// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IBountyEscrow — callback interface used by DisputeResolver.
interface IBountyEscrow {
    enum DisputeOutcome {
        DevWins,
        SponsorWins
    }

    /// @dev Called by DisputeResolver to resolve a disputed bounty.
    function resolveDispute(uint256 bountyId, DisputeOutcome outcome) external;
}
