// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/libraries/TLSNVerifier.sol";

/// @dev Harness contract to expose TLSNVerifier's internal library functions for testing.
contract TLSNVerifierHarness {
    function recoverSigner(TLSNVerifier.Presentation calldata proof) external pure returns (address) {
        return TLSNVerifier.recoverSigner(proof);
    }

    function verifyAttestationHash(TLSNVerifier.Presentation calldata proof) external pure {
        TLSNVerifier.verifyAttestationHash(proof);
    }

    function verifyChunkCommitments(TLSNVerifier.Presentation calldata proof) external pure {
        TLSNVerifier.verifyChunkCommitments(proof);
    }

    function verifyDomain(TLSNVerifier.Presentation calldata proof, string memory expectedDomain) external pure {
        TLSNVerifier.verifyDomain(proof, expectedDomain);
    }

    function containsBytes(bytes memory haystack, bytes memory needle) external pure returns (bool) {
        return TLSNVerifier.containsBytes(haystack, needle);
    }
}

contract TLSNVerifierTest is Test {
    TLSNVerifierHarness harness;

    uint256 constant NOTARY_PK = 0xA11CE;
    address notary;

    function setUp() public {
        harness = new TLSNVerifierHarness();
        notary = vm.addr(NOTARY_PK);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────

    /// @dev Builds chunk arrays for a presentation. Separated to avoid stack-too-deep.
    function _buildChunkData()
        internal
        pure
        returns (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices)
    {
        bytes memory chunk = bytes('{"data":{"user":{"displayName":"vedal987","self":{"subscriptionBenefit":{"tier":"1000","purchasedWithPrime":false}}}}}');
        bytes32 salt = keccak256("salt0");

        commitments = new bytes32[](1);
        commitments[0] = keccak256(abi.encodePacked(chunk, salt));

        chunks = new bytes[](1);
        chunks[0] = chunk;

        salts = new bytes32[](1);
        salts[0] = salt;

        indices = new uint256[](1);
        indices[0] = 0;
    }

    function _buildPresentation(uint256 signerPk, string memory domain, uint256 timestamp)
        internal
        pure
        returns (TLSNVerifier.Presentation memory proof)
    {
        (bytes32[] memory commitments, bytes[] memory chunks, bytes32[] memory salts, uint256[] memory indices) =
            _buildChunkData();

        bytes32 attestationHash =
            keccak256(abi.encodePacked(domain, abi.encodePacked(commitments), timestamp));

        bytes32 ethSignedHash =
            keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", attestationHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, ethSignedHash);

        proof = TLSNVerifier.Presentation({
            signature: abi.encodePacked(r, s, v),
            attestationHash: attestationHash,
            serverDomain: domain,
            timestamp: timestamp,
            commitments: commitments,
            revealedChunks: chunks,
            salts: salts,
            chunkIndices: indices
        });
    }

    // ─── recoverSigner ───────────────────────────────────────────────────

    function test_recoverSigner_valid() public view {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        address recovered = harness.recoverSigner(proof);
        assertEq(recovered, notary);
    }

    function test_recoverSigner_wrongKey() public view {
        uint256 otherPk = 0xB0B;
        TLSNVerifier.Presentation memory proof = _buildPresentation(otherPk, "gql.twitch.tv", 1000);
        address recovered = harness.recoverSigner(proof);
        assertEq(recovered, vm.addr(otherPk));
        assertTrue(recovered != notary);
    }

    function test_recoverSigner_invalidLength_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        proof.signature = hex"DEADBEEF"; // 4 bytes, not 65

        vm.expectRevert(TLSNVerifier.InvalidSignatureLength.selector);
        harness.recoverSigner(proof);
    }

    function test_recoverSigner_tamperedHash_recoversWrongAddress() public view {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        proof.attestationHash = bytes32(uint256(proof.attestationHash) ^ 1); // flip a bit

        address recovered = harness.recoverSigner(proof);
        assertTrue(recovered != notary);
    }

    // ─── verifyAttestationHash ───────────────────────────────────────────

    function test_verifyAttestationHash_valid() public view {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        harness.verifyAttestationHash(proof); // should not revert
    }

    function test_verifyAttestationHash_tamperedDomain_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        proof.serverDomain = "evil.com";

        vm.expectRevert(TLSNVerifier.AttestationHashMismatch.selector);
        harness.verifyAttestationHash(proof);
    }

    function test_verifyAttestationHash_tamperedTimestamp_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        proof.timestamp = 9999;

        vm.expectRevert(TLSNVerifier.AttestationHashMismatch.selector);
        harness.verifyAttestationHash(proof);
    }

    // ─── verifyChunkCommitments ──────────────────────────────────────────

    function test_verifyChunkCommitments_valid() public view {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        harness.verifyChunkCommitments(proof); // should not revert
    }

    function test_verifyChunkCommitments_tamperedChunk_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        proof.revealedChunks[0] = bytes("tampered data");

        vm.expectRevert(abi.encodeWithSelector(TLSNVerifier.CommitmentMismatch.selector, 0));
        harness.verifyChunkCommitments(proof);
    }

    function test_verifyChunkCommitments_tamperedSalt_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        proof.salts[0] = bytes32(uint256(1));

        vm.expectRevert(abi.encodeWithSelector(TLSNVerifier.CommitmentMismatch.selector, 0));
        harness.verifyChunkCommitments(proof);
    }

    function test_verifyChunkCommitments_lengthMismatch_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);

        // Add an extra salt without a matching chunk
        bytes32[] memory extraSalts = new bytes32[](2);
        extraSalts[0] = proof.salts[0];
        extraSalts[1] = bytes32(uint256(2));
        proof.salts = extraSalts;

        vm.expectRevert(TLSNVerifier.ChunkArrayLengthMismatch.selector);
        harness.verifyChunkCommitments(proof);
    }

    // ─── verifyDomain ────────────────────────────────────────────────────

    function test_verifyDomain_match() public view {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);
        harness.verifyDomain(proof, "gql.twitch.tv"); // should not revert
    }

    function test_verifyDomain_mismatch_reverts() public {
        TLSNVerifier.Presentation memory proof = _buildPresentation(NOTARY_PK, "gql.twitch.tv", 1000);

        vm.expectRevert(TLSNVerifier.DomainMismatch.selector);
        harness.verifyDomain(proof, "evil.com");
    }

    // ─── containsBytes ───────────────────────────────────────────────────

    function test_containsBytes_found() public view {
        bytes memory haystack = bytes('{"user":"vedal987","tier":"1000"}');
        assertTrue(harness.containsBytes(haystack, bytes("vedal987")));
    }

    function test_containsBytes_notFound() public view {
        bytes memory haystack = bytes('{"user":"vedal987","tier":"1000"}');
        assertFalse(harness.containsBytes(haystack, bytes("neuro")));
    }

    function test_containsBytes_emptyNeedle() public view {
        bytes memory haystack = bytes("anything");
        assertTrue(harness.containsBytes(haystack, bytes("")));
    }

    function test_containsBytes_needleLongerThanHaystack() public view {
        bytes memory haystack = bytes("short");
        assertFalse(harness.containsBytes(haystack, bytes("this is much longer than the haystack")));
    }

    function test_containsBytes_exactMatch() public view {
        bytes memory haystack = bytes("exact");
        assertTrue(harness.containsBytes(haystack, bytes("exact")));
    }

    function test_containsBytes_atEnd() public view {
        bytes memory haystack = bytes("hello world");
        assertTrue(harness.containsBytes(haystack, bytes("world")));
    }

    function test_containsBytes_atStart() public view {
        bytes memory haystack = bytes("hello world");
        assertTrue(harness.containsBytes(haystack, bytes("hello")));
    }

    // ─── Cross-verification with Rust attestation module ────────────────
    // These values are generated by the Rust verifier's attestation.rs
    // with a known key (Hardhat account 0), fixed salts, and fixed timestamp.
    // If this test passes, Rust and Solidity agree on encoding.

    function test_crossVerify_rustAttestation_signerRecovery() public view {
        TLSNVerifier.Presentation memory proof = _buildRustFixture();

        address recovered = harness.recoverSigner(proof);
        // Hardhat account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
        assertEq(recovered, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
    }

    function test_crossVerify_rustAttestation_attestationHash() public view {
        TLSNVerifier.Presentation memory proof = _buildRustFixture();
        harness.verifyAttestationHash(proof); // reverts if mismatch
    }

    function test_crossVerify_rustAttestation_chunkCommitments() public view {
        TLSNVerifier.Presentation memory proof = _buildRustFixture();
        harness.verifyChunkCommitments(proof); // reverts if mismatch
    }

    function test_crossVerify_rustAttestation_domain() public view {
        TLSNVerifier.Presentation memory proof = _buildRustFixture();
        harness.verifyDomain(proof, "gql.twitch.tv"); // reverts if mismatch
    }

    function test_crossVerify_rustAttestation_fullPipeline() public view {
        TLSNVerifier.Presentation memory proof = _buildRustFixture();

        // All four verification steps must pass
        address signer = harness.recoverSigner(proof);
        assertEq(signer, 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266);
        harness.verifyAttestationHash(proof);
        harness.verifyChunkCommitments(proof);
        harness.verifyDomain(proof, "gql.twitch.tv");
    }

    /// @dev Builds a Presentation from exact Rust attestation output (deterministic fixture).
    function _buildRustFixture() internal pure returns (TLSNVerifier.Presentation memory proof) {
        // Two chunks: HTTP status line + JSON body
        bytes[] memory chunks = new bytes[](2);
        chunks[0] = hex"485454502f312e3120323030204f4b0d0a436f6e74656e742d547970653a206170706c69636174696f6e2f6a736f6e";
        chunks[1] = hex"7b2264617461223a7b2263757272656e7455736572223a7b226964223a22313536383436313230222c22646973706c61794e616d65223a22766564616c393837222c22737562736372697074696f6e42656e65666974223a7b2274696572223a2231303030227d7d7d7d";

        bytes32[] memory salts = new bytes32[](2);
        salts[0] = bytes32(hex"0101010101010101010101010101010101010101010101010101010101010101");
        salts[1] = bytes32(hex"0202020202020202020202020202020202020202020202020202020202020202");

        bytes32[] memory commitments = new bytes32[](2);
        commitments[0] = bytes32(hex"ccdb6f576880aeee3a03c91d7a76a0f6b285818b5b69d39958a8defc9c2013b4");
        commitments[1] = bytes32(hex"292984c3bb317c046fc244992f5b36ad138d4f273807b944f5b4af653cac6c18");

        uint256[] memory indices = new uint256[](2);
        indices[0] = 0;
        indices[1] = 1;

        proof = TLSNVerifier.Presentation({
            signature: hex"98bfe0bf9bba6795bffdc6d9d74adf4de7eaf348f2f82a8466e90bd866452cf169a3c6edd1f3a137b353a8d1ba25cdeca2e8ba9db2208ec33844c18e2e0e76831b",
            attestationHash: bytes32(hex"587d354b819d55a76a4434c72e36569df26a014613608a7538f5470150664f58"),
            serverDomain: "gql.twitch.tv",
            timestamp: 1700000000,
            commitments: commitments,
            revealedChunks: chunks,
            salts: salts,
            chunkIndices: indices
        });
    }
}
