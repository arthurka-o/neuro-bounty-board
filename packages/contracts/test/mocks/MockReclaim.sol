// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IReclaim.sol";

/// @dev Mock Reclaim verifier for testing.
///      Accepts all proofs by default. Can be configured to reject.
contract MockReclaim {
    bool public shouldReject;

    function setShouldReject(bool _reject) external {
        shouldReject = _reject;
    }

    function verifyProof(IReclaim.Proof memory) external view {
        require(!shouldReject, "MockReclaim: proof rejected");
    }
}
