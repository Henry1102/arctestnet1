// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @title Arc DEX constant-product pair and 18-decimal liquidity token
/// @dev Accounting uses raw token units, including for six-decimal assets.
/// Direct deposits and LP transfers must be followed atomically by mint/burn;
/// otherwise anyone can consume those deposits, as in Uniswap V2.
contract DexPair is ERC20, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant MINIMUM_LIQUIDITY = 1000;
    address public immutable factory;
    address public token0;
    address public token1;
    uint112 private reserve0;
    uint112 private reserve1;
    uint32 public blockTimestampLast;
    uint256 public price0CumulativeLast;
    uint256 public price1CumulativeLast;

    struct SwapCache {
        uint112 reserve0;
        uint112 reserve1;
        uint256 balance0;
        uint256 balance1;
        uint256 amount0In;
        uint256 amount1In;
    }

    error Forbidden();
    error AlreadyInitialized();
    error NotInitialized();
    error InvalidTokens();
    error InvalidRecipient();
    error ReserveOverflow();
    error InsufficientLiquidityMinted();
    error InsufficientLiquidityBurned();
    error InsufficientLiquidity();
    error InsufficientOutputAmount();
    error InsufficientInputAmount();
    error InvariantViolation();
    error FlashSwapNotSupported();

    /// @notice Emitted when deposited token amounts create LP tokens.
    event Mint(address indexed sender, uint256 amount0, uint256 amount1);
    /// @notice Emitted when LP tokens are burned for underlying assets.
    event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to);
    /// @notice Emitted after a fee-adjusted constant-product swap.
    event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to);
    /// @notice Emitted whenever stored reserves change.
    event Sync(uint112 reserve0, uint112 reserve1);

    /// @notice Sets the deploying factory and LP token metadata.
    constructor() ERC20("Arc DEX LP", "ARC-LP") {
        factory = msg.sender;
    }

    /// @notice Initializes sorted token addresses exactly once, by the factory only.
    function initialize(address token0_, address token1_) external {
        if (msg.sender != factory) revert Forbidden();
        if (token0 != address(0)) revert AlreadyInitialized();
        if (token0_ == address(0) || token0_ >= token1_) revert InvalidTokens();
        token0 = token0_;
        token1 = token1_;
    }

    /// @notice Returns raw reserves in token0/token1 order and their last update time modulo 2**32.
    function getReserves() external view returns (uint112, uint112, uint32) {
        return (reserve0, reserve1, blockTimestampLast);
    }

    /// @notice Mints LP tokens for assets already deposited into this pair.
    /// @dev The initial 1000 LP units are permanently assigned to address(0xdead).
    function mint(address to) external nonReentrant returns (uint256 liquidity) {
        (uint256 balance0, uint256 balance1) = _currentBalances();
        uint256 amount0 = balance0 - reserve0;
        uint256 amount1 = balance1 - reserve1;
        uint256 supply = totalSupply();
        if (supply == 0) {
            uint256 root = Math.sqrt(amount0 * amount1);
            if (root <= MINIMUM_LIQUIDITY) revert InsufficientLiquidityMinted();
            liquidity = root - MINIMUM_LIQUIDITY;
            _mint(address(0xdead), MINIMUM_LIQUIDITY);
        } else {
            if (reserve0 == 0 || reserve1 == 0) revert InsufficientLiquidity();
            liquidity = Math.min(amount0 * supply / reserve0, amount1 * supply / reserve1);
        }
        if (liquidity == 0) revert InsufficientLiquidityMinted();
        _mint(to, liquidity);
        _update(balance0, balance1);
        emit Mint(msg.sender, amount0, amount1);
    }

    /// @notice Burns all LP tokens previously transferred to the pair and sends assets to `to`.
    function burn(address to) external nonReentrant returns (uint256 amount0, uint256 amount1) {
        _validateRecipient(to);
        (uint256 balance0, uint256 balance1) = _currentBalances();
        uint256 liquidity = balanceOf(address(this));
        uint256 supply = totalSupply();
        if (supply == 0) revert InsufficientLiquidityBurned();
        amount0 = liquidity * balance0 / supply;
        amount1 = liquidity * balance1 / supply;
        if (amount0 == 0 || amount1 == 0) revert InsufficientLiquidityBurned();
        _burn(address(this), liquidity);
        IERC20(token0).safeTransfer(to, amount0);
        IERC20(token1).safeTransfer(to, amount1);
        (balance0, balance1) = _currentBalances();
        _update(balance0, balance1);
        emit Burn(msg.sender, amount0, amount1, to);
    }

    /// @notice Exchanges pre-deposited input for specified output with a 0.3% input fee.
    /// @param data Must be empty; flash-swap callbacks are not supported.
    function swap(uint256 amount0Out, uint256 amount1Out, address to, bytes calldata data) external nonReentrant {
        if (data.length != 0) revert FlashSwapNotSupported();
        if (amount0Out == 0 && amount1Out == 0) revert InsufficientOutputAmount();
        SwapCache memory c;
        c.reserve0 = reserve0;
        c.reserve1 = reserve1;
        if (amount0Out >= c.reserve0 || amount1Out >= c.reserve1) revert InsufficientLiquidity();
        _validateRecipient(to);
        if (amount0Out != 0) IERC20(token0).safeTransfer(to, amount0Out);
        if (amount1Out != 0) IERC20(token1).safeTransfer(to, amount1Out);
        (c.balance0, c.balance1) = _currentBalances();
        c.amount0In = c.balance0 > uint256(c.reserve0) - amount0Out
            ? c.balance0 - (uint256(c.reserve0) - amount0Out) : 0;
        c.amount1In = c.balance1 > uint256(c.reserve1) - amount1Out
            ? c.balance1 - (uint256(c.reserve1) - amount1Out) : 0;
        if (c.amount0In == 0 && c.amount1In == 0) revert InsufficientInputAmount();
        uint256 adjusted0 = c.balance0 * 1000 - c.amount0In * 3;
        uint256 adjusted1 = c.balance1 * 1000 - c.amount1In * 3;
        if (adjusted0 * adjusted1 < uint256(c.reserve0) * c.reserve1 * 1_000_000) {
            revert InvariantViolation();
        }
        _update(c.balance0, c.balance1);
        emit Swap(msg.sender, c.amount0In, c.amount1In, amount0Out, amount1Out, to);
    }

    /// @notice Sends token balances exceeding stored reserves to `to` without changing reserves.
    function skim(address to) external nonReentrant {
        if (token0 == address(0)) revert NotInitialized();
        _validateRecipient(to);
        IERC20(token0).safeTransfer(to, IERC20(token0).balanceOf(address(this)) - reserve0);
        IERC20(token1).safeTransfer(to, IERC20(token1).balanceOf(address(this)) - reserve1);
    }

    /// @notice Updates reserves and TWAP accumulators to reflect current token balances.
    function sync() external nonReentrant {
        (uint256 balance0, uint256 balance1) = _currentBalances();
        _update(balance0, balance1);
    }

    function _validateRecipient(address to) private view {
        if (to == address(0) || to == address(this) || to == token0 || to == token1) {
            revert InvalidRecipient();
        }
    }

    function _currentBalances() private view returns (uint256 balance0, uint256 balance1) {
        if (token0 == address(0)) revert NotInitialized();
        balance0 = IERC20(token0).balanceOf(address(this));
        balance1 = IERC20(token1).balanceOf(address(this));
        if (balance0 > type(uint112).max || balance1 > type(uint112).max) revert ReserveOverflow();
    }

    function _update(uint256 balance0, uint256 balance1) private {
        uint32 timestamp = uint32(block.timestamp);
        // V2 intentionally wraps timestamps and Q112.112 cumulative prices.
        unchecked {
            uint32 elapsed = timestamp - blockTimestampLast;
            if (elapsed != 0 && reserve0 != 0 && reserve1 != 0) {
                price0CumulativeLast += ((uint256(reserve1) << 112) / reserve0) * elapsed;
                price1CumulativeLast += ((uint256(reserve0) << 112) / reserve1) * elapsed;
            }
        }
        reserve0 = uint112(balance0);
        reserve1 = uint112(balance1);
        blockTimestampLast = timestamp;
        emit Sync(reserve0, reserve1);
    }
}
