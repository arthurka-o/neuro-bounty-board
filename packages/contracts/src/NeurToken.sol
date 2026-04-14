// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title NeurToken — test ERC-20 for Base Sepolia demo.
/// @notice 6-decimal token mimicking EURC. Owner can mint; anyone can use the faucet.
contract NeurToken is ERC20, Ownable {
    uint8 private constant DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 500 * 10 ** DECIMALS; // 500 nEUR per drip
    uint256 public constant FAUCET_COOLDOWN = 24 hours;

    mapping(address => uint256) public lastFaucetDrip;

    constructor() ERC20("nEuro", "NEUR") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    /// @notice Owner can mint any amount to any address.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    /// @notice Public faucet — 1000 nEUR per call, 1-hour cooldown.
    function faucet() external {
        require(
            block.timestamp >= lastFaucetDrip[msg.sender] + FAUCET_COOLDOWN,
            "Faucet: cooldown not elapsed"
        );
        lastFaucetDrip[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }
}
