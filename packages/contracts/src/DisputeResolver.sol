// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import "./interfaces/ISemaphore.sol";
import "./interfaces/IBountyEscrow.sol";

/// @title DisputeResolver — anonymous community voting for bounty disputes.
/// @notice Uses Semaphore for anonymous, sybil-resistant voting.
///         Voters prove group membership via zk-SNARK without revealing identity.
contract DisputeResolver is OwnableUpgradeable, UUPSUpgradeable, ReentrancyGuardTransient {
    // ─── Types ───────────────────────────────────────────────────────────

    enum DisputeStatus {
        None,
        Voting,
        Extended,
        Resolved,
        Escalated
    }

    struct Dispute {
        uint256 votingStart;
        uint256 votingEnd;
        uint256 approveCount;
        uint256 rejectCount;
        DisputeStatus status;
        bool extended;
    }

    // ─── Constants ───────────────────────────────────────────────────────

    /// @dev Scope prefix to prevent nullifier collision with other contracts using the same Semaphore group.
    bytes32 public constant SCOPE_PREFIX = keccak256("neuro-bounty-board.dispute");

    // ─── State ───────────────────────────────────────────────────────────

    ISemaphore public semaphore;
    IBountyEscrow public bountyEscrow;
    uint256 public voterGroupId;

    uint256 public votingPeriod; // seconds
    uint256 public quorum; // minimum total votes
    uint256 public supermajorityBps; // basis points (6667 = 66.67%)

    mapping(uint256 => Dispute) public disputes; // bountyId => Dispute

    // ─── Events ──────────────────────────────────────────────────────────

    event DisputeOpened(uint256 indexed bountyId, uint256 votingEnd);
    event VoteCast(uint256 indexed bountyId, uint256 message);
    event DisputeResolved(uint256 indexed bountyId, IBountyEscrow.DisputeOutcome outcome);
    event DisputeExtended(uint256 indexed bountyId, uint256 newVotingEnd);
    event DisputeEscalated(uint256 indexed bountyId);

    event VotingPeriodUpdated(uint256 oldPeriod, uint256 newPeriod);
    event QuorumUpdated(uint256 oldQuorum, uint256 newQuorum);
    event SupermajorityBpsUpdated(uint256 oldBps, uint256 newBps);
    event VoterGroupIdUpdated(uint256 oldGroupId, uint256 newGroupId);

    // ─── Errors ──────────────────────────────────────────────────────────

    error NotBountyEscrow();
    error DisputeAlreadyExists();
    error DisputeNotActive();
    error VotingPeriodEnded();
    error VotingPeriodNotEnded();
    error InvalidVote();
    error InvalidScope();
    error ZeroAddress();
    error InvalidParameter();

    // ─── Initializer ─────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _semaphore, address _bountyEscrow, uint256 _voterGroupId) external initializer {
        if (_semaphore == address(0) || _bountyEscrow == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);

        semaphore = ISemaphore(_semaphore);
        bountyEscrow = IBountyEscrow(_bountyEscrow);
        voterGroupId = _voterGroupId;

        votingPeriod = 14 days;
        quorum = 10;
        supermajorityBps = 6667; // 66.67%
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function setVotingPeriod(uint256 _period) external onlyOwner {
        if (_period < 1 days) revert InvalidParameter();
        emit VotingPeriodUpdated(votingPeriod, _period);
        votingPeriod = _period;
    }

    function setQuorum(uint256 _quorum) external onlyOwner {
        if (_quorum == 0) revert InvalidParameter();
        emit QuorumUpdated(quorum, _quorum);
        quorum = _quorum;
    }

    function setSupermajorityBps(uint256 _bps) external onlyOwner {
        if (_bps <= 5000 || _bps >= 10_000) revert InvalidParameter();
        emit SupermajorityBpsUpdated(supermajorityBps, _bps);
        supermajorityBps = _bps;
    }

    function setVoterGroupId(uint256 _groupId) external onlyOwner {
        emit VoterGroupIdUpdated(voterGroupId, _groupId);
        voterGroupId = _groupId;
    }

    // ─── Dispute Lifecycle ───────────────────────────────────────────────

    /// @notice Opens a dispute for a bounty. Only callable by BountyEscrow.
    function openDispute(uint256 bountyId) external {
        if (msg.sender != address(bountyEscrow)) revert NotBountyEscrow();
        if (disputes[bountyId].status != DisputeStatus.None) revert DisputeAlreadyExists();

        uint256 end = block.timestamp + votingPeriod;

        disputes[bountyId] = Dispute({
            votingStart: block.timestamp,
            votingEnd: end,
            approveCount: 0,
            rejectCount: 0,
            status: DisputeStatus.Voting,
            extended: false
        });

        emit DisputeOpened(bountyId, end);
    }

    /// @notice Cast an anonymous vote on a dispute via Semaphore proof.
    /// @dev proof.message must be 1 (approve) or 0 (reject).
    ///      proof.scope must equal the namespaced scope for this bountyId.
    function castVote(uint256 bountyId, ISemaphore.SemaphoreProof calldata proof) external nonReentrant {
        Dispute storage d = disputes[bountyId];

        if (d.status != DisputeStatus.Voting && d.status != DisputeStatus.Extended) {
            revert DisputeNotActive();
        }
        if (block.timestamp > d.votingEnd) revert VotingPeriodEnded();
        if (proof.message != 0 && proof.message != 1) revert InvalidVote();

        // Verify namespaced scope to prevent nullifier collision
        uint256 expectedScope = disputeScope(bountyId);
        if (proof.scope != expectedScope) revert InvalidScope();

        // Validates proof + records nullifier (reverts on double-vote or invalid proof)
        semaphore.validateProof(voterGroupId, proof);

        if (proof.message == 1) {
            d.approveCount++;
        } else {
            d.rejectCount++;
        }

        emit VoteCast(bountyId, proof.message);
    }

    /// @notice Resolves a dispute after the voting period ends.
    /// @dev Anyone can call this. Handles quorum extension and escalation.
    function resolveDispute(uint256 bountyId) external nonReentrant {
        Dispute storage d = disputes[bountyId];

        if (d.status != DisputeStatus.Voting && d.status != DisputeStatus.Extended) {
            revert DisputeNotActive();
        }
        if (block.timestamp <= d.votingEnd) revert VotingPeriodNotEnded();

        uint256 totalVotes = d.approveCount + d.rejectCount;

        // Quorum not met
        if (totalVotes < quorum) {
            if (!d.extended) {
                // First extension
                d.extended = true;
                d.status = DisputeStatus.Extended;
                d.votingEnd = block.timestamp + votingPeriod;

                emit DisputeExtended(bountyId, d.votingEnd);
                return;
            }

            // Already extended once — escalate to admin for manual resolution.
            // Funds remain in escrow until admin calls resolveEscalated().
            d.status = DisputeStatus.Escalated;
            emit DisputeEscalated(bountyId);
            return;
        }

        // Quorum met — check supermajority
        if (d.approveCount * 10_000 > totalVotes * supermajorityBps) {
            d.status = DisputeStatus.Resolved;
            bountyEscrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
            emit DisputeResolved(bountyId, IBountyEscrow.DisputeOutcome.DevWins);
        } else if (d.rejectCount * 10_000 > totalVotes * supermajorityBps) {
            d.status = DisputeStatus.Resolved;
            bountyEscrow.resolveDispute(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);
            emit DisputeResolved(bountyId, IBountyEscrow.DisputeOutcome.SponsorWins);
        } else {
            // No supermajority — escalate to admin for manual resolution
            d.status = DisputeStatus.Escalated;
            emit DisputeEscalated(bountyId);
        }
    }

    /// @notice Admin manually resolves an escalated dispute.
    /// @dev Only callable when dispute status is Escalated.
    function resolveEscalated(uint256 bountyId, IBountyEscrow.DisputeOutcome outcome) external onlyOwner {
        Dispute storage d = disputes[bountyId];
        if (d.status != DisputeStatus.Escalated) revert DisputeNotActive();

        d.status = DisputeStatus.Resolved;
        bountyEscrow.resolveDispute(bountyId, outcome);

        emit DisputeResolved(bountyId, outcome);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function getDispute(uint256 bountyId) external view returns (Dispute memory) {
        return disputes[bountyId];
    }

    /// @notice Returns the namespaced Semaphore scope for a given bountyId.
    function disputeScope(uint256 bountyId) public pure returns (uint256) {
        return uint256(keccak256(abi.encodePacked(SCOPE_PREFIX, bountyId)));
    }

    // ─── Upgrade Auth ────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Storage Gap ─────────────────────────────────────────────────────

    uint256[50] private __gap;
}
