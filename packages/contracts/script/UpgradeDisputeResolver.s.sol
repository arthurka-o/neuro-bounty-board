// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/DisputeResolver.sol";

/// @title UpgradeDisputeResolver — deploys new implementation and upgrades the proxy.
contract UpgradeDisputeResolver is Script {
    address constant PROXY = 0xF7bBF83bdA864b7298eeBfB509c887033226FaB4;

    function run() external {
        vm.startBroadcast();

        DisputeResolver newImpl = new DisputeResolver();
        DisputeResolver(PROXY).upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("New implementation:", address(newImpl));
        console.log("Proxy upgraded:", PROXY);
    }
}
