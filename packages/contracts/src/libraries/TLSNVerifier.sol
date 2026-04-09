// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TLSNVerifier — on-chain verification of TLSNotary attestations.
/// @notice Verifies Notary signatures, chunk commitments, attestation hashes,
///         and server domain for TLSNotary presentations.
library TLSNVerifier {
    // ─── Types ───────────────────────────────────────────────────────────

    struct Presentation {
        bytes signature; // 65 bytes: r(32) || s(32) || v(1)
        bytes32 attestationHash; // hash(serverDomain, commitments, timestamp)
        string serverDomain; // e.g. "gql.twitch.tv"
        uint256 timestamp; // when the TLS session occurred
        bytes32[] commitments; // hash commitments to transcript chunks
        bytes[] revealedChunks; // plaintext of revealed chunks
        bytes32[] salts; // salt for each revealed chunk
        uint256[] chunkIndices; // which commitment each revealed chunk maps to
    }

    // ─── Errors ──────────────────────────────────────────────────────────

    error InvalidSignatureLength();
    error InvalidSigner();
    error AttestationHashMismatch();
    error CommitmentMismatch(uint256 index);
    error ChunkArrayLengthMismatch();
    error DomainMismatch();

    // ─── Functions ───────────────────────────────────────────────────────

    /// @notice Recovers the signer address from a TLSNotary presentation signature.
    /// @dev Uses ecrecover with EIP-191 prefix over attestationHash.
    function recoverSigner(Presentation calldata proof) internal pure returns (address) {
        bytes memory sig = proof.signature;
        if (sig.length != 65) revert InvalidSignatureLength();

        bytes32 r;
        bytes32 s;
        uint8 v;

        // solhint-disable-next-line no-inline-assembly
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := byte(0, mload(add(sig, 96)))
        }

        // EIP-191 signed data: "\x19Ethereum Signed Message:\n32" + hash
        bytes32 ethSignedHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", proof.attestationHash));

        address signer = ecrecover(ethSignedHash, v, r, s);
        if (signer == address(0)) revert InvalidSigner();

        return signer;
    }

    /// @notice Recomputes attestationHash from its components and checks it matches.
    function verifyAttestationHash(Presentation calldata proof) internal pure {
        bytes32 computed = keccak256(abi.encodePacked(proof.serverDomain, _packCommitments(proof.commitments), proof.timestamp));

        if (computed != proof.attestationHash) revert AttestationHashMismatch();
    }

    /// @notice Verifies each revealed chunk hashes (with its salt) to the corresponding commitment.
    function verifyChunkCommitments(Presentation calldata proof) internal pure {
        uint256 len = proof.revealedChunks.length;
        if (len != proof.salts.length || len != proof.chunkIndices.length) {
            revert ChunkArrayLengthMismatch();
        }

        for (uint256 i; i < len; ++i) {
            bytes32 computed = keccak256(abi.encodePacked(proof.revealedChunks[i], proof.salts[i]));
            if (computed != proof.commitments[proof.chunkIndices[i]]) {
                revert CommitmentMismatch(i);
            }
        }
    }

    /// @notice Checks that the server domain matches the expected domain.
    function verifyDomain(Presentation calldata proof, string memory expectedDomain) internal pure {
        if (keccak256(bytes(proof.serverDomain)) != keccak256(bytes(expectedDomain))) {
            revert DomainMismatch();
        }
    }

    /// @notice Checks if `needle` appears anywhere within `haystack`.
    /// @dev Naive O(n*m) scan. Sufficient for short needles in ~200 byte responses.
    function containsBytes(bytes memory haystack, bytes memory needle) internal pure returns (bool) {
        if (needle.length == 0) return true;
        if (needle.length > haystack.length) return false;

        uint256 limit = haystack.length - needle.length;
        for (uint256 i; i <= limit; ++i) {
            bool found = true;
            for (uint256 j; j < needle.length; ++j) {
                if (haystack[i + j] != needle[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }
        return false;
    }

    /// @notice Extracts a JSON string value for a given key from a byte buffer.
    /// @dev Searches for `"key":"` and returns bytes up to the next `"`.
    ///      Returns empty bytes if not found. Only works for simple string values (no escaping).
    function extractJsonStringValue(bytes memory data, bytes memory key) internal pure returns (bytes memory) {
        // Build the search pattern: "key":"
        bytes memory pattern = abi.encodePacked('"', key, '":"');
        if (pattern.length > data.length) return "";

        uint256 limit = data.length - pattern.length;
        for (uint256 i; i <= limit; ++i) {
            bool found = true;
            for (uint256 j; j < pattern.length; ++j) {
                if (data[i + j] != pattern[j]) {
                    found = false;
                    break;
                }
            }
            if (found) {
                // Found pattern — extract value up to closing quote
                uint256 valueStart = i + pattern.length;
                uint256 valueEnd = valueStart;
                while (valueEnd < data.length && data[valueEnd] != '"') {
                    ++valueEnd;
                }
                bytes memory value = new bytes(valueEnd - valueStart);
                for (uint256 k; k < value.length; ++k) {
                    value[k] = data[valueStart + k];
                }
                return value;
            }
        }
        return "";
    }

    // ─── Internal Helpers ────────────────────────────────────────────────

    /// @dev Packs a commitments array into a single bytes blob for hashing.
    function _packCommitments(bytes32[] calldata commitments) private pure returns (bytes memory) {
        return abi.encodePacked(commitments);
    }
}
