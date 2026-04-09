// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/BountyEscrow.sol";
import "../src/DisputeResolver.sol";

/// @title Deploy — deploys bounty board contracts behind UUPS proxies.
/// @dev Deploy order matters due to cross-references:
///      1. BountyEscrow (deployed first, needs address for DisputeResolver)
///      2. DisputeResolver (needs BountyEscrow address + TLSNotary config)
///      3. Wire: BountyEscrow.setDisputeResolver(resolver)
contract Deploy is Script {
    // ─── Base Mainnet Addresses ────────────────────────────────────────
    address constant SEMAPHORE = 0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D;

    function run() external {
        address eurcAddress = vm.envAddress("EURC_ADDRESS");
        address treasuryAddress = vm.envAddress("TREASURY_ADDRESS");
        uint256 requiredSigs = vm.envUint("REQUIRED_SIGNATURES");

        // Read notaries from env (comma-separated or individual NOTARY_N vars)
        address[] memory notaries = _loadNotaries();

        vm.startBroadcast();

        // 1. Deploy BountyEscrow
        BountyEscrow escrowImpl = new BountyEscrow();
        ERC1967Proxy escrowProxy = new ERC1967Proxy(
            address(escrowImpl), abi.encodeCall(BountyEscrow.initialize, (eurcAddress, treasuryAddress))
        );
        BountyEscrow escrow = BountyEscrow(address(escrowProxy));

        // 2. Deploy DisputeResolver with TLSNotary config
        DisputeResolver resolverImpl = new DisputeResolver();
        ERC1967Proxy resolverProxy = new ERC1967Proxy(
            address(resolverImpl),
            abi.encodeCall(
                DisputeResolver.initialize,
                (SEMAPHORE, address(escrow), notaries, requiredSigs, "gql.twitch.tv")
            )
        );
        DisputeResolver resolver = DisputeResolver(address(resolverProxy));

        // 3. Wire escrow to resolver
        escrow.setDisputeResolver(address(resolver));

        vm.stopBroadcast();

        // Log deployed addresses
        console.log("=== Deployed Contracts ===");
        console.log("BountyEscrow (impl):", address(escrowImpl));
        console.log("BountyEscrow (proxy):", address(escrowProxy));
        console.log("DisputeResolver (impl):", address(resolverImpl));
        console.log("DisputeResolver (proxy):", address(resolverProxy));
        console.log("Notaries registered:", notaries.length);
        console.log("Required signatures:", requiredSigs);
    }

    function _loadNotaries() internal view returns (address[] memory) {
        // Try NOTARY_1, NOTARY_2, ... up to 10
        address[] memory tmp = new address[](10);
        uint256 count;
        for (uint256 i = 1; i <= 10; i++) {
            try vm.envAddress(string.concat("NOTARY_", vm.toString(i))) returns (address n) {
                tmp[count++] = n;
            } catch {
                break;
            }
        }
        address[] memory result = new address[](count);
        for (uint256 i; i < count; i++) result[i] = tmp[i];
        return result;
    }
}
