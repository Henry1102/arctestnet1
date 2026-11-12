// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title Testnet-only demo ERC-20 with a permissionless hourly faucet
/// @dev Not a production asset: faucet access is per address, not per person.
contract TestToken is ERC20 {
    uint8 private immutable tokenDecimals;
    uint256 public immutable faucetAmount;
    uint256 public constant FAUCET_INTERVAL = 1 hours;
    mapping(address => uint256) public nextFaucetAt;

    error FaucetRateLimited(uint256 nextAvailableAt);
    error InvalidDecimals();

    /// @notice Emitted when an address claims its hourly allocation.
    event FaucetClaimed(address indexed account, uint256 amount, uint256 nextAvailableAt);

    /// @notice Sets demo token metadata and decimal precision.
    /// @dev Decimals must be <= 74 so 1000 * 10**decimals fits in uint256.
    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        if (decimals_ > 74) revert InvalidDecimals();
        tokenDecimals = decimals_;
        faucetAmount = 1000 * (10 ** uint256(decimals_));
    }

    /// @notice Returns this token's configured display precision.
    function decimals() public view override returns (uint8) {
        return tokenDecimals;
    }

    /// @notice Mints 1000 whole demo tokens to the caller, at most once per hour.
    function faucet() external {
        uint256 availableAt = nextFaucetAt[msg.sender];
        if (block.timestamp < availableAt) revert FaucetRateLimited(availableAt);
        uint256 nextAvailableAt = block.timestamp + FAUCET_INTERVAL;
        nextFaucetAt[msg.sender] = nextAvailableAt;
        _mint(msg.sender, faucetAmount);
        emit FaucetClaimed(msg.sender, faucetAmount, nextAvailableAt);
    }
}
