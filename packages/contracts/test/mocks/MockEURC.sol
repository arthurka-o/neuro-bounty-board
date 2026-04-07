// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Simple ERC-20 with public mint for testing.
contract MockEURC is ERC20 {
    constructor() ERC20("Mock EURC", "EURC") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function decimals() public pure override returns (uint8) {
        return 6; // EURC uses 6 decimals like USDC
    }
}
