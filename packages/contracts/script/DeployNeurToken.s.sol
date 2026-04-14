// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/NeurToken.sol";

/// @title DeployNeurToken — deploys the NEUR test token on Base Sepolia.
contract DeployNeurToken is Script {
    function run() external {
        vm.startBroadcast();

        NeurToken token = new NeurToken();

        vm.stopBroadcast();

        console.log("NEUR Token deployed at:", address(token));
        console.log("Owner:", token.owner());
        console.log("Decimals:", token.decimals());
    }
}
