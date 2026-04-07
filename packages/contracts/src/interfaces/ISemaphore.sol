// SPDX-License-Identifier: MIT
pragma solidity >=0.8.23 <0.9.0;

/// @title Semaphore contract interface.
interface ISemaphore {
    error Semaphore__GroupHasNoMembers();
    error Semaphore__MerkleTreeDepthIsNotSupported();
    error Semaphore__MerkleTreeRootIsExpired();
    error Semaphore__MerkleTreeRootIsNotPartOfTheGroup();
    error Semaphore__YouAreUsingTheSameNullifierTwice();
    error Semaphore__InvalidProof();

    /// It defines all the Semaphore proof parameters used by Semaphore.sol.
    struct SemaphoreProof {
        uint256 merkleTreeDepth;
        uint256 merkleTreeRoot;
        uint256 nullifier;
        uint256 message;
        uint256 scope;
        uint256[8] points;
    }

    /// @dev Event emitted when the Merkle tree duration of a group is updated.
    event GroupMerkleTreeDurationUpdated(
        uint256 indexed groupId,
        uint256 oldMerkleTreeDuration,
        uint256 newMerkleTreeDuration
    );

    /// @dev Event emitted when a Semaphore proof is validated.
    event ProofValidated(
        uint256 indexed groupId,
        uint256 merkleTreeDepth,
        uint256 indexed merkleTreeRoot,
        uint256 nullifier,
        uint256 message,
        uint256 indexed scope,
        uint256[8] points
    );

    /// @dev Returns the current value of the group counter.
    function groupCounter() external view returns (uint256);

    /// @dev Creates a group with msg.sender as admin.
    function createGroup() external returns (uint256);

    /// @dev Creates a group with a specific admin.
    function createGroup(address admin) external returns (uint256);

    /// @dev Creates a group with a custom Merkle tree duration.
    function createGroup(address admin, uint256 merkleTreeDuration) external returns (uint256);

    /// @dev Updates the group admin (two-step transfer).
    function updateGroupAdmin(uint256 groupId, address newAdmin) external;

    /// @dev Accepts the pending group admin role.
    function acceptGroupAdmin(uint256 groupId) external;

    /// @dev Updates the group Merkle tree duration.
    function updateGroupMerkleTreeDuration(uint256 groupId, uint256 newMerkleTreeDuration) external;

    /// @dev Adds a member to a group.
    function addMember(uint256 groupId, uint256 identityCommitment) external;

    /// @dev Adds multiple members to a group.
    function addMembers(uint256 groupId, uint256[] calldata identityCommitments) external;

    /// @dev Updates a member in a group.
    function updateMember(
        uint256 groupId,
        uint256 oldIdentityCommitment,
        uint256 newIdentityCommitment,
        uint256[] calldata merkleProofSiblings
    ) external;

    /// @dev Removes a member from a group.
    function removeMember(uint256 groupId, uint256 identityCommitment, uint256[] calldata merkleProofSiblings)
        external;

    /// @dev Validates a proof, saves the nullifier, and emits an event.
    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external;

    /// @dev Verifies a proof without state changes.
    function verifyProof(uint256 groupId, SemaphoreProof calldata proof) external view returns (bool);
}
