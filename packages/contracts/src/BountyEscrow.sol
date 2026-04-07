// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IBountyEscrow.sol";

/// @title BountyEscrow — escrow contract for the ZK Bounty Board.
/// @notice Manages bounty lifecycle: creation, dev approval, bond staking,
///         deliverable submission, approval/rejection, timeouts, and dispute resolution.
contract BountyEscrow is IBountyEscrow, OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // ─── Types ───────────────────────────────────────────────────────────

    enum BountyStatus {
        Open,
        Active,
        Submitted,
        Approved,
        Disputed,
        Expired,
        Cancelled,
        Resolved
    }

    struct Bounty {
        address sponsor;
        address dev;
        uint256 reward;
        uint256 bond;
        uint256 deadline; // implementation deadline (timestamp)
        uint256 bondStakeDeadline; // dev must stake by this time
        uint256 submissionTime; // when dev submitted
        bytes32 descriptionHash;
        bytes32 proofURIHash;
        BountyStatus status;
    }

    // ─── State ───────────────────────────────────────────────────────────

    IERC20 public eurc;
    address public disputeResolver;
    address public treasury;

    uint256 public bondPercentageBps; // basis points (500 = 5%)
    uint256 public reviewWindow; // seconds
    uint256 public bondStakeWindow; // seconds

    uint256 public nextBountyId;
    mapping(uint256 => Bounty) public bounties;

    // ─── Events ──────────────────────────────────────────────────────────

    event BountyCreated(uint256 indexed bountyId, address indexed sponsor, uint256 reward, uint256 deadline);
    event BountyCancelled(uint256 indexed bountyId);
    event DevApproved(uint256 indexed bountyId, address indexed dev, uint256 bondStakeDeadline);
    event BondStaked(uint256 indexed bountyId, address indexed dev, uint256 bondAmount);
    event DeliverableSubmitted(uint256 indexed bountyId, string proofURI);
    event DeliverableApproved(uint256 indexed bountyId);
    event DeliverableRejected(uint256 indexed bountyId);
    event BountyExpired(uint256 indexed bountyId);
    event BountyResolved(uint256 indexed bountyId, DisputeOutcome outcome);

    event DisputeResolverUpdated(address indexed oldResolver, address indexed newResolver);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event BondPercentageUpdated(uint256 oldBps, uint256 newBps);
    event ReviewWindowUpdated(uint256 oldWindow, uint256 newWindow);
    event BondStakeWindowUpdated(uint256 oldWindow, uint256 newWindow);

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotSponsor();
    error NotDev();
    error NotDisputeResolver();
    error InvalidStatus(BountyStatus current, BountyStatus expected);
    error DeadlineInPast();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error ReviewWindowNotExpired();
    error ReviewWindowExpired();
    error BondStakeWindowExpired();
    error BondStakeWindowNotExpired();
    error RewardTooLow();
    error ZeroAddress();
    error InvalidParameter();

    // ─── Modifiers ───────────────────────────────────────────────────────

    modifier onlySponsor(uint256 bountyId) {
        if (msg.sender != bounties[bountyId].sponsor) revert NotSponsor();
        _;
    }

    modifier onlyDev(uint256 bountyId) {
        if (msg.sender != bounties[bountyId].dev) revert NotDev();
        _;
    }

    modifier onlyDisputeResolver() {
        if (msg.sender != disputeResolver) revert NotDisputeResolver();
        _;
    }

    modifier inStatus(uint256 bountyId, BountyStatus expected) {
        if (bounties[bountyId].status != expected) {
            revert InvalidStatus(bounties[bountyId].status, expected);
        }
        _;
    }

    // ─── Initializer ─────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _eurc, address _treasury) external initializer {
        if (_eurc == address(0) || _treasury == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);

        eurc = IERC20(_eurc);
        treasury = _treasury;

        bondPercentageBps = 500; // 5%
        reviewWindow = 14 days;
        bondStakeWindow = 3 days;
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function setDisputeResolver(address _disputeResolver) external onlyOwner {
        if (_disputeResolver == address(0)) revert ZeroAddress();
        emit DisputeResolverUpdated(disputeResolver, _disputeResolver);
        disputeResolver = _disputeResolver;
    }

    function setTreasury(address _treasury) external onlyOwner {
        if (_treasury == address(0)) revert ZeroAddress();
        emit TreasuryUpdated(treasury, _treasury);
        treasury = _treasury;
    }

    function setBondPercentageBps(uint256 _bps) external onlyOwner {
        if (_bps == 0 || _bps > 5000) revert InvalidParameter();
        emit BondPercentageUpdated(bondPercentageBps, _bps);
        bondPercentageBps = _bps;
    }

    function setReviewWindow(uint256 _window) external onlyOwner {
        if (_window < 1 days) revert InvalidParameter();
        emit ReviewWindowUpdated(reviewWindow, _window);
        reviewWindow = _window;
    }

    function setBondStakeWindow(uint256 _window) external onlyOwner {
        if (_window < 1 days) revert InvalidParameter();
        emit BondStakeWindowUpdated(bondStakeWindow, _window);
        bondStakeWindow = _window;
    }

    // ─── Bounty Lifecycle ────────────────────────────────────────────────

    /// @notice Sponsor creates a bounty and locks EURC reward in escrow.
    function createBounty(bytes32 descriptionHash, uint256 deadline, uint256 reward)
        external
        nonReentrant
        returns (uint256 bountyId)
    {
        if (reward < 1e6) revert RewardTooLow();
        if (deadline <= block.timestamp) revert DeadlineInPast();

        bountyId = nextBountyId++;

        Bounty storage b = bounties[bountyId];
        b.sponsor = msg.sender;
        b.reward = reward;
        b.deadline = deadline;
        b.descriptionHash = descriptionHash;
        b.status = BountyStatus.Open;

        eurc.safeTransferFrom(msg.sender, address(this), reward);

        emit BountyCreated(bountyId, msg.sender, reward, deadline);
    }

    /// @notice Sponsor cancels a bounty before a dev has staked their bond.
    function cancelBounty(uint256 bountyId)
        external
        onlySponsor(bountyId)
        inStatus(bountyId, BountyStatus.Open)
        nonReentrant
    {
        bounties[bountyId].status = BountyStatus.Cancelled;

        eurc.safeTransfer(bounties[bountyId].sponsor, bounties[bountyId].reward);

        emit BountyCancelled(bountyId);
    }

    /// @notice Sponsor selects a dev. Dev has bondStakeWindow to stake their bond.
    /// @dev Can be called again to replace a dev who didn't stake in time.
    function approveDev(uint256 bountyId, address devAddress)
        external
        onlySponsor(bountyId)
        inStatus(bountyId, BountyStatus.Open)
    {
        if (devAddress == address(0)) revert ZeroAddress();

        Bounty storage b = bounties[bountyId];

        // If replacing a dev, ensure previous bond stake window has expired
        if (b.dev != address(0) && block.timestamp <= b.bondStakeDeadline) {
            revert BondStakeWindowNotExpired();
        }

        b.dev = devAddress;
        b.bond = (b.reward * bondPercentageBps) / 10_000;
        b.bondStakeDeadline = block.timestamp + bondStakeWindow;

        emit DevApproved(bountyId, devAddress, b.bondStakeDeadline);
    }

    /// @notice Approved dev stakes their bond, activating the bounty.
    function stakeBond(uint256 bountyId)
        external
        onlyDev(bountyId)
        inStatus(bountyId, BountyStatus.Open)
        nonReentrant
    {
        Bounty storage b = bounties[bountyId];

        if (block.timestamp > b.bondStakeDeadline) revert BondStakeWindowExpired();

        b.status = BountyStatus.Active;

        eurc.safeTransferFrom(msg.sender, address(this), b.bond);

        emit BondStaked(bountyId, msg.sender, b.bond);
    }

    /// @notice Dev submits their deliverable. Starts the review window.
    function submitDeliverable(uint256 bountyId, string calldata proofURI)
        external
        onlyDev(bountyId)
        inStatus(bountyId, BountyStatus.Active)
    {
        Bounty storage b = bounties[bountyId];

        if (block.timestamp > b.deadline) revert DeadlinePassed();

        b.proofURIHash = keccak256(bytes(proofURI));
        b.submissionTime = block.timestamp;
        b.status = BountyStatus.Submitted;

        emit DeliverableSubmitted(bountyId, proofURI);
    }

    /// @notice Sponsor approves the deliverable. Releases reward + bond to dev.
    function approveDeliverable(uint256 bountyId)
        external
        onlySponsor(bountyId)
        inStatus(bountyId, BountyStatus.Submitted)
        nonReentrant
    {
        Bounty storage b = bounties[bountyId];
        b.status = BountyStatus.Approved;

        eurc.safeTransfer(b.dev, b.reward + b.bond);

        emit DeliverableApproved(bountyId);
    }

    /// @notice Sponsor rejects the deliverable within the review window. Opens a dispute.
    function rejectDeliverable(uint256 bountyId)
        external
        onlySponsor(bountyId)
        inStatus(bountyId, BountyStatus.Submitted)
    {
        Bounty storage b = bounties[bountyId];

        if (block.timestamp > b.submissionTime + reviewWindow) revert ReviewWindowExpired();

        b.status = BountyStatus.Disputed;

        IDisputeResolver(disputeResolver).openDispute(bountyId);

        emit DeliverableRejected(bountyId);
    }

    /// @notice Anyone can claim funds after dev misses the implementation deadline.
    /// @dev Reward returns to sponsor, bond is slashed to treasury.
    function claimOnTimeout(uint256 bountyId) external inStatus(bountyId, BountyStatus.Active) nonReentrant {
        Bounty storage b = bounties[bountyId];

        if (block.timestamp <= b.deadline) revert DeadlineNotPassed();

        b.status = BountyStatus.Expired;

        eurc.safeTransfer(b.sponsor, b.reward);
        eurc.safeTransfer(treasury, b.bond);

        emit BountyExpired(bountyId);
    }

    /// @notice Dev claims funds after the review window expires without sponsor action.
    function claimOnExpiredReview(uint256 bountyId)
        external
        onlyDev(bountyId)
        inStatus(bountyId, BountyStatus.Submitted)
        nonReentrant
    {
        Bounty storage b = bounties[bountyId];

        if (block.timestamp <= b.submissionTime + reviewWindow) revert ReviewWindowNotExpired();

        b.status = BountyStatus.Approved;

        eurc.safeTransfer(b.dev, b.reward + b.bond);

        emit DeliverableApproved(bountyId);
    }

    // ─── Dispute Resolution (callback) ───────────────────────────────────

    /// @notice Called by DisputeResolver to finalize a disputed bounty.
    function resolveDispute(uint256 bountyId, DisputeOutcome outcome)
        external
        override
        onlyDisputeResolver
        inStatus(bountyId, BountyStatus.Disputed)
        nonReentrant
    {
        Bounty storage b = bounties[bountyId];
        b.status = BountyStatus.Resolved;

        if (outcome == DisputeOutcome.DevWins) {
            eurc.safeTransfer(b.dev, b.reward + b.bond);
        } else {
            // SponsorWins: reward to sponsor, bond to treasury
            eurc.safeTransfer(b.sponsor, b.reward);
            eurc.safeTransfer(treasury, b.bond);
        }

        emit BountyResolved(bountyId, outcome);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function getBounty(uint256 bountyId) external view returns (Bounty memory) {
        return bounties[bountyId];
    }

    // ─── Upgrade Auth ────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Storage Gap ─────────────────────────────────────────────────────

    uint256[50] private __gap;
}

/// @dev Minimal interface for the DisputeResolver callback.
interface IDisputeResolver {
    function openDispute(uint256 bountyId) external;
}
