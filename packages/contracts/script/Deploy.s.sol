// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/BountyEscrow.sol";
import "../src/DisputeResolver.sol";
import "../src/VoterRegistry.sol";

/// @title Deploy — deploys all bounty board contracts behind UUPS proxies.
/// @dev Deploy order matters due to cross-references:
///      1. VoterRegistry (creates Semaphore group)
///      2. DisputeResolver (needs groupId from VoterRegistry)
///      3. BountyEscrow (needs DisputeResolver address)
///      4. Wire: BountyEscrow.setDisputeResolver(resolver)
contract Deploy is Script {
    // ─── Optimism Mainnet Addresses ──────────────────────────────────────
    address constant SEMAPHORE = 0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D;
    address constant RECLAIM = 0xB238380c4C6C1a7eD9E1808B1b6fcb3F1B2836cF;

    // ─── Configuration (set via env or override) ─────────────────────────
    // EURC on Optimism: https://developers.circle.com/stablecoins/docs/eurc-on-main-networks
    // If not set, will need to be provided via EURC_ADDRESS env var
    address eurcAddress;
    address treasuryAddress;

    function run() external {
        eurcAddress = vm.envAddress("EURC_ADDRESS");
        treasuryAddress = vm.envAddress("TREASURY_ADDRESS");

        string memory userIdField = vm.envOr("USER_ID_FIELD", string('"userId":"'));
        string memory providerId = vm.envOr("PROVIDER_ID", string("twitch-sub-provider"));

        vm.startBroadcast();

        // 1. Deploy VoterRegistry
        VoterRegistry registryImpl = new VoterRegistry();
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(VoterRegistry.initialize, (SEMAPHORE, RECLAIM, userIdField, providerId))
        );
        VoterRegistry registry = VoterRegistry(address(registryProxy));
        uint256 groupId = registry.getGroupId();

        // 2. Deploy BountyEscrow (need address first for DisputeResolver)
        BountyEscrow escrowImpl = new BountyEscrow();
        ERC1967Proxy escrowProxy = new ERC1967Proxy(
            address(escrowImpl), abi.encodeCall(BountyEscrow.initialize, (eurcAddress, treasuryAddress))
        );
        BountyEscrow escrow = BountyEscrow(address(escrowProxy));

        // 3. Deploy DisputeResolver
        DisputeResolver resolverImpl = new DisputeResolver();
        ERC1967Proxy resolverProxy = new ERC1967Proxy(
            address(resolverImpl),
            abi.encodeCall(DisputeResolver.initialize, (SEMAPHORE, address(escrow), groupId))
        );
        DisputeResolver resolver = DisputeResolver(address(resolverProxy));

        // 4. Wire escrow to resolver
        escrow.setDisputeResolver(address(resolver));

        vm.stopBroadcast();

        // Log deployed addresses
        console.log("=== Deployed Contracts ===");
        console.log("VoterRegistry (impl):", address(registryImpl));
        console.log("VoterRegistry (proxy):", address(registryProxy));
        console.log("BountyEscrow (impl):", address(escrowImpl));
        console.log("BountyEscrow (proxy):", address(escrowProxy));
        console.log("DisputeResolver (impl):", address(resolverImpl));
        console.log("DisputeResolver (proxy):", address(resolverProxy));
        console.log("Semaphore group ID:", groupId);
    }
}
