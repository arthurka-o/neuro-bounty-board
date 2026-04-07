// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Minimal Reclaim Protocol interface for on-chain proof verification.
/// @dev Struct definitions mirror the reclaim-solidity-sdk Claims library.

/// @notice Data types used by Reclaim proofs.
library Claims {
    struct ClaimInfo {
        string provider;
        string parameters;
        string context;
    }

    struct CompleteClaimData {
        bytes32 identifier;
        address owner;
        uint32 timestampS;
        uint32 epoch;
    }

    struct SignedClaim {
        CompleteClaimData claim;
        bytes[] signatures;
    }
}

/// @title IReclaim — interface for the deployed Reclaim verifier contract.
interface IReclaim {
    struct Proof {
        Claims.ClaimInfo claimInfo;
        Claims.SignedClaim signedClaim;
    }

    /// @dev Verifies a Reclaim proof on-chain. Reverts if the proof is invalid.
    function verifyProof(Proof memory proof) external;
}

/// @title ReclaimUtils — helper for extracting fields from proof context strings.
library ReclaimUtils {
    /// @dev Extracts a field value from a JSON-like context string.
    ///      Target format: '"fieldName":"' (include quotes and colon).
    ///      Returns everything between the target and the next '"'.
    function extractFieldFromContext(string memory data, string memory target)
        internal
        pure
        returns (string memory)
    {
        bytes memory dataBytes = bytes(data);
        bytes memory targetBytes = bytes(target);

        require(dataBytes.length >= targetBytes.length, "ReclaimUtils: data shorter than target");

        uint256 start = 0;
        bool found = false;

        for (uint256 i = 0; i <= dataBytes.length - targetBytes.length; i++) {
            bool isMatch = true;
            for (uint256 j = 0; j < targetBytes.length; j++) {
                if (dataBytes[i + j] != targetBytes[j]) {
                    isMatch = false;
                    break;
                }
            }
            if (isMatch) {
                start = i + targetBytes.length;
                found = true;
                break;
            }
        }

        require(found, "ReclaimUtils: field not found in context");

        // Find closing quote
        uint256 end = start;
        while (end < dataBytes.length && dataBytes[end] != '"') {
            end++;
        }

        bytes memory result = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = dataBytes[i];
        }

        return string(result);
    }
}
