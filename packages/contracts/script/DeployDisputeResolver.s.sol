// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import "../src/DisputeResolver.sol";
import "../src/BountyEscrow.sol";

/// @title DeployDisputeResolver — fresh deploy of DisputeResolver + wire to existing BountyEscrow.
contract DeployDisputeResolver is Script {
    address constant SEMAPHORE = 0x8A1fd199516489B0Fb7153EB5f075cDAC83c693D;
    address constant BOUNTY_ESCROW = 0x1005c4231E5A687F41A15277cEc416d4A9D3649e;

    function run() external {
        uint256 requiredSigs = vm.envUint("REQUIRED_SIGNATURES");
        address[] memory notaries = _loadNotaries();

        vm.startBroadcast();

        // Deploy new DisputeResolver behind UUPS proxy
        DisputeResolver impl = new DisputeResolver();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                DisputeResolver.initialize,
                (SEMAPHORE, BOUNTY_ESCROW, notaries, requiredSigs, "gql.twitch.tv")
            )
        );

        // Wire escrow to new resolver
        BountyEscrow(BOUNTY_ESCROW).setDisputeResolver(address(proxy));

        vm.stopBroadcast();

        console.log("DisputeResolver (impl):", address(impl));
        console.log("DisputeResolver (proxy):", address(proxy));
        console.log("BountyEscrow.setDisputeResolver() called");
    }

    function _loadNotaries() internal view returns (address[] memory) {
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
