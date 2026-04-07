// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/BountyEscrow.sol";

/// @title UpgradeBountyEscrow — deploys new implementation and upgrades the proxy.
contract UpgradeBountyEscrow is Script {
    address constant PROXY = 0x756aC998B595f95F5bfC4092dBC043857430A806;

    function run() external {
        vm.startBroadcast();

        BountyEscrow newImpl = new BountyEscrow();
        BountyEscrow(PROXY).upgradeToAndCall(address(newImpl), "");

        vm.stopBroadcast();

        console.log("New implementation:", address(newImpl));
        console.log("Proxy upgraded:", PROXY);
    }
}
