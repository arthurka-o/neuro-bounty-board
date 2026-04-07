// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/ISemaphore.sol";

/// @dev Mock Semaphore for testing. Tracks groups, members, and nullifiers.
///      Does NOT verify zk-SNARKs — just validates nullifier uniqueness.
contract MockSemaphore is ISemaphore {
    uint256 private _groupCounter;

    struct GroupData {
        address admin;
        address pendingAdmin;
        uint256 merkleTreeDuration;
        uint256[] members;
    }

    mapping(uint256 => GroupData) private _groups;
    // groupId => nullifier => used
    mapping(uint256 => mapping(uint256 => bool)) private _usedNullifiers;

    bool public shouldRejectProofs;

    function setShouldRejectProofs(bool _reject) external {
        shouldRejectProofs = _reject;
    }

    // ─── ISemaphore Implementation ───────────────────────────────────────

    function groupCounter() external view override returns (uint256) {
        return _groupCounter;
    }

    function createGroup() external override returns (uint256) {
        return _createGroup(msg.sender, 3600);
    }

    function createGroup(address admin) external override returns (uint256) {
        return _createGroup(admin, 3600);
    }

    function createGroup(address admin, uint256 merkleTreeDuration) external override returns (uint256) {
        return _createGroup(admin, merkleTreeDuration);
    }

    function updateGroupAdmin(uint256 groupId, address newAdmin) external override {
        require(msg.sender == _groups[groupId].admin, "Not admin");
        _groups[groupId].pendingAdmin = newAdmin;
    }

    function acceptGroupAdmin(uint256 groupId) external override {
        require(msg.sender == _groups[groupId].pendingAdmin, "Not pending admin");
        _groups[groupId].admin = msg.sender;
        _groups[groupId].pendingAdmin = address(0);
    }

    function updateGroupMerkleTreeDuration(uint256 groupId, uint256 newMerkleTreeDuration) external override {
        require(msg.sender == _groups[groupId].admin, "Not admin");
        uint256 old = _groups[groupId].merkleTreeDuration;
        _groups[groupId].merkleTreeDuration = newMerkleTreeDuration;
        emit GroupMerkleTreeDurationUpdated(groupId, old, newMerkleTreeDuration);
    }

    function addMember(uint256 groupId, uint256 identityCommitment) external override {
        require(msg.sender == _groups[groupId].admin, "Not admin");
        _groups[groupId].members.push(identityCommitment);
    }

    function addMembers(uint256 groupId, uint256[] calldata identityCommitments) external override {
        require(msg.sender == _groups[groupId].admin, "Not admin");
        for (uint256 i = 0; i < identityCommitments.length; i++) {
            _groups[groupId].members.push(identityCommitments[i]);
        }
    }

    function updateMember(uint256 groupId, uint256, uint256 newIdentityCommitment, uint256[] calldata)
        external
        override
    {
        require(msg.sender == _groups[groupId].admin, "Not admin");
        // Simplified: just add the new commitment
        _groups[groupId].members.push(newIdentityCommitment);
    }

    function removeMember(uint256 groupId, uint256, uint256[] calldata) external override {
        require(msg.sender == _groups[groupId].admin, "Not admin");
        // Simplified: no-op (real Semaphore sets leaf to 0)
    }

    function validateProof(uint256 groupId, SemaphoreProof calldata proof) external override {
        if (shouldRejectProofs) revert Semaphore__InvalidProof();
        if (_groups[groupId].members.length == 0) revert Semaphore__GroupHasNoMembers();
        if (_usedNullifiers[groupId][proof.nullifier]) revert Semaphore__YouAreUsingTheSameNullifierTwice();

        _usedNullifiers[groupId][proof.nullifier] = true;

        emit ProofValidated(
            groupId, proof.merkleTreeDepth, proof.merkleTreeRoot, proof.nullifier, proof.message, proof.scope, proof.points
        );
    }

    function verifyProof(uint256 groupId, SemaphoreProof calldata proof) external view override returns (bool) {
        if (shouldRejectProofs) return false;
        if (_groups[groupId].members.length == 0) return false;
        if (_usedNullifiers[groupId][proof.nullifier]) return false;
        return true;
    }

    // ─── Test Helpers ────────────────────────────────────────────────────

    function getGroupMembers(uint256 groupId) external view returns (uint256[] memory) {
        return _groups[groupId].members;
    }

    function getGroupAdmin(uint256 groupId) external view returns (address) {
        return _groups[groupId].admin;
    }

    function isNullifierUsed(uint256 groupId, uint256 nullifier) external view returns (bool) {
        return _usedNullifiers[groupId][nullifier];
    }

    // ─── Internal ────────────────────────────────────────────────────────

    function _createGroup(address admin, uint256 merkleTreeDuration) internal returns (uint256) {
        uint256 groupId = _groupCounter++;
        _groups[groupId].admin = admin;
        _groups[groupId].merkleTreeDuration = merkleTreeDuration;
        return groupId;
    }
}
