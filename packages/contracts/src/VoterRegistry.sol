// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./interfaces/ISemaphore.sol";
import "./interfaces/IReclaim.sol";

/// @title VoterRegistry — bridges Reclaim identity verification to Semaphore voting group.
/// @notice Verifies Reclaim proofs on-chain, extracts user IDs for sybil resistance,
///         and adds verified identity commitments to the Semaphore voter group.
contract VoterRegistry is OwnableUpgradeable, UUPSUpgradeable {
    // ─── State ───────────────────────────────────────────────────────────

    ISemaphore public semaphore;
    address public reclaimAddress;
    uint256 public groupId;

    /// @dev Maps hash(extractedUserId) => true to prevent double-registration.
    mapping(bytes32 => bool) public registeredUserHashes;

    /// @dev Maps identityCommitment => true to prevent duplicate commitments.
    mapping(uint256 => bool) public registeredCommitments;

    /// @dev The context field key used to extract the user ID from Reclaim proofs.
    ///      Format: '"fieldName":"' (include quotes and colon per Reclaim convention).
    string public userIdFieldTarget;

    /// @dev Expected Reclaim provider ID. Only proofs from this provider are accepted.
    string public expectedProvider;

    // ─── Events ──────────────────────────────────────────────────────────

    event VoterRegistered(bytes32 indexed userHash, uint256 identityCommitment);
    event ReclaimAddressUpdated(address indexed oldAddress, address indexed newAddress);
    event UserIdFieldTargetUpdated(string oldTarget, string newTarget);
    event ExpectedProviderUpdated(string oldProvider, string newProvider);

    // ─── Errors ──────────────────────────────────────────────────────────

    error ZeroAddress();
    error AlreadyRegistered();
    error ZeroCommitment();
    error DuplicateCommitment();
    error InvalidProvider();

    // ─── Initializer ─────────────────────────────────────────────────────

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @param _semaphore Address of the deployed Semaphore V4 contract.
    /// @param _reclaimAddress Address of the deployed Reclaim verifier contract.
    /// @param _userIdFieldTarget The context field key for user ID extraction.
    /// @param _expectedProvider The Reclaim provider ID that proofs must match.
    function initialize(
        address _semaphore,
        address _reclaimAddress,
        string calldata _userIdFieldTarget,
        string calldata _expectedProvider
    ) external initializer {
        if (_semaphore == address(0) || _reclaimAddress == address(0)) revert ZeroAddress();

        __Ownable_init(msg.sender);

        semaphore = ISemaphore(_semaphore);
        reclaimAddress = _reclaimAddress;
        userIdFieldTarget = _userIdFieldTarget;
        expectedProvider = _expectedProvider;

        // Create a Semaphore group — this contract becomes the group admin
        groupId = semaphore.createGroup(address(this));
    }

    // ─── Admin ───────────────────────────────────────────────────────────

    function setUserIdFieldTarget(string calldata _target) external onlyOwner {
        emit UserIdFieldTargetUpdated(userIdFieldTarget, _target);
        userIdFieldTarget = _target;
    }

    function setReclaimAddress(address _reclaimAddress) external onlyOwner {
        if (_reclaimAddress == address(0)) revert ZeroAddress();
        emit ReclaimAddressUpdated(reclaimAddress, _reclaimAddress);
        reclaimAddress = _reclaimAddress;
    }

    function setExpectedProvider(string calldata _provider) external onlyOwner {
        emit ExpectedProviderUpdated(expectedProvider, _provider);
        expectedProvider = _provider;
    }

    // ─── Registration ────────────────────────────────────────────────────

    /// @notice Register as a voter by submitting a Reclaim proof and a Semaphore identity commitment.
    /// @param proof The Reclaim proof (verified on-chain).
    /// @param identityCommitment The user's Semaphore identity commitment to add to the voter group.
    function registerVoter(IReclaim.Proof calldata proof, uint256 identityCommitment) external {
        if (identityCommitment == 0) revert ZeroCommitment();

        // 1. Validate provider matches expected
        if (keccak256(bytes(proof.claimInfo.provider)) != keccak256(bytes(expectedProvider))) {
            revert InvalidProvider();
        }

        // 2. Verify Reclaim proof on-chain
        IReclaim(reclaimAddress).verifyProof(proof);

        // 3. Extract user ID from proof context for sybil resistance
        string memory userId =
            ReclaimUtils.extractFieldFromContext(proof.claimInfo.context, userIdFieldTarget);

        // 4. Check user uniqueness (sybil resistance)
        bytes32 userHash = keccak256(abi.encodePacked(userId));
        if (registeredUserHashes[userHash]) revert AlreadyRegistered();
        registeredUserHashes[userHash] = true;

        // 5. Check commitment uniqueness (prevents double voting power)
        if (registeredCommitments[identityCommitment]) revert DuplicateCommitment();
        registeredCommitments[identityCommitment] = true;

        // 6. Add to Semaphore voter group
        semaphore.addMember(groupId, identityCommitment);

        emit VoterRegistered(userHash, identityCommitment);
    }

    // ─── Views ───────────────────────────────────────────────────────────

    function getGroupId() external view returns (uint256) {
        return groupId;
    }

    function isRegistered(bytes32 userHash) external view returns (bool) {
        return registeredUserHashes[userHash];
    }

    // ─── Upgrade Auth ────────────────────────────────────────────────────

    function _authorizeUpgrade(address) internal override onlyOwner {}

    // ─── Storage Gap ─────────────────────────────────────────────────────

    uint256[50] private __gap;
}
