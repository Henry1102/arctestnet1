// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {DexFactory} from "./DexFactory.sol";
import {DexPair} from "./DexPair.sol";

/// @title ERC-20-only, noncustodial router for Arc DEX
/// @dev Intended for Arc Testnet (chain 5042002). Native currency and WETH are
/// deliberately unsupported. Amounts are raw token units, not normalized decimals.
/// Supports standard ERC-20s; fee-on-transfer and rebasing tokens are unsupported.
/// All routed transfers go directly from users to pairs or from pairs to recipients.
contract DexRouter is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address public immutable factory;

    error Expired();
    error InvalidFactory();
    error InvalidTokens();
    error InvalidRecipient();
    error InvalidPath();
    error PairNotFound();
    error InsufficientAmount();
    error InsufficientInputAmount();
    error InsufficientOutputAmount();
    error ExcessiveInputAmount();
    error InsufficientLiquidity();
    error InsufficientAAmount();
    error InsufficientBAmount();

    modifier ensure(uint256 deadline) {
        if (block.timestamp > deadline) revert Expired();
        _;
    }

    /// @notice Sets the immutable factory used for every pair lookup.
    constructor(address factory_) {
        if (factory_ == address(0) || factory_.code.length == 0) revert InvalidFactory();
        factory = factory_;
    }

    /// @notice Deposits assets directly into a pair, creating it if absent, and mints LP to `to`.
    /// @dev Requires token allowances to this router; both minima apply even for a new pool.
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        _validateRecipient(to);
        (amountA, amountB) = _addLiquidity(
            tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin
        );
        liquidity = _depositLiquidity(tokenA, tokenB, amountA, amountB, to);
    }

    /// @notice Sends approved LP directly to its pair and burns it for assets paid directly to `to`.
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256 amountA, uint256 amountB) {
        _validateRecipient(to);
        (amountA, amountB) = _withdrawLiquidity(tokenA, tokenB, liquidity, to);
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    /// @notice Swaps an exact input along a multi-hop path, enforcing minimum final output.
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        _validateRecipient(to);
        amounts = getAmountsOut(amountIn, path);
        if (amounts[amounts.length - 1] < amountOutMin) revert InsufficientOutputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Obtains exact final output along a multi-hop path, enforcing maximum input.
    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) nonReentrant returns (uint256[] memory amounts) {
        _validateRecipient(to);
        amounts = getAmountsIn(amountOut, path);
        if (amounts[0] > amountInMax) revert ExcessiveInputAmount();
        IERC20(path[0]).safeTransferFrom(msg.sender, pairFor(path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    /// @notice Quotes an equivalent raw amount at the reserve ratio, without a swap fee.
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) public pure returns (uint256 amountB) {
        if (amountA == 0) revert InsufficientAmount();
        if (reserveA == 0 || reserveB == 0) revert InsufficientLiquidity();
        amountB = amountA * reserveB / reserveA;
    }

    /// @notice Computes exact-input output with the V2 997/1000 fee formula, rounded down.
    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        public pure returns (uint256 amountOut)
    {
        if (amountIn == 0) revert InsufficientInputAmount();
        if (reserveIn == 0 || reserveOut == 0) revert InsufficientLiquidity();
        uint256 amountInWithFee = amountIn * 997;
        amountOut = amountInWithFee * reserveOut / (reserveIn * 1000 + amountInWithFee);
    }

    /// @notice Computes exact-output input with the V2 fee formula, rounded up.
    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        public pure returns (uint256 amountIn)
    {
        if (amountOut == 0) revert InsufficientOutputAmount();
        if (reserveIn == 0 || reserveOut == 0 || amountOut >= reserveOut) revert InsufficientLiquidity();
        amountIn = reserveIn * amountOut * 1000 / ((reserveOut - amountOut) * 997) + 1;
    }

    /// @notice Returns every hop's quoted amounts for an exact input in raw units.
    function getAmountsOut(uint256 amountIn, address[] memory path) public view returns (uint256[] memory amounts) {
        _validatePath(path);
        amounts = new uint256[](path.length);
        amounts[0] = amountIn;
        for (uint256 i; i < path.length - 1; ++i) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i], path[i + 1]);
            amounts[i + 1] = getAmountOut(amounts[i], reserveIn, reserveOut);
            if (amounts[i + 1] == 0) revert InsufficientOutputAmount();
        }
    }

    /// @notice Returns every hop's quoted amounts for an exact output in raw units.
    function getAmountsIn(uint256 amountOut, address[] memory path) public view returns (uint256[] memory amounts) {
        _validatePath(path);
        amounts = new uint256[](path.length);
        amounts[path.length - 1] = amountOut;
        for (uint256 i = path.length - 1; i > 0; --i) {
            (uint256 reserveIn, uint256 reserveOut) = getReserves(path[i - 1], path[i]);
            amounts[i - 1] = getAmountIn(amounts[i], reserveIn, reserveOut);
        }
    }

    /// @notice Returns reserves in the caller's tokenA/tokenB order, not necessarily sorted order.
    function getReserves(address tokenA, address tokenB) public view returns (uint256 reserveA, uint256 reserveB) {
        (address token0,) = _sortTokens(tokenA, tokenB);
        (uint112 reserve0, uint112 reserve1,) = DexPair(pairFor(tokenA, tokenB)).getReserves();
        (reserveA, reserveB) = tokenA == token0 ? (uint256(reserve0), uint256(reserve1)) : (uint256(reserve1), uint256(reserve0));
    }

    /// @notice Resolves an existing pair through factory.getPair; no init-code hash is hardcoded.
    function pairFor(address tokenA, address tokenB) public view returns (address pair) {
        _sortTokens(tokenA, tokenB);
        pair = DexFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) revert PairNotFound();
    }

    function _depositLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountA,
        uint256 amountB,
        address to
    ) private returns (uint256 liquidity) {
        address pair = pairFor(tokenA, tokenB);
        IERC20(tokenA).safeTransferFrom(msg.sender, pair, amountA);
        IERC20(tokenB).safeTransferFrom(msg.sender, pair, amountB);
        liquidity = DexPair(pair).mint(to);
    }

    function _withdrawLiquidity(address tokenA, address tokenB, uint256 liquidity, address to)
        private returns (uint256 amountA, uint256 amountB)
    {
        address pair = pairFor(tokenA, tokenB);
        IERC20(pair).safeTransferFrom(msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = DexPair(pair).burn(to);
        (address token0,) = _sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
    }

    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) private returns (uint256 amountA, uint256 amountB) {
        _sortTokens(tokenA, tokenB);
        if (amountADesired == 0 || amountBDesired == 0) revert InsufficientAmount();
        address pair = DexFactory(factory).getPair(tokenA, tokenB);
        if (pair == address(0)) {
            pair = DexFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = getReserves(tokenA, tokenB);
        // A pair with no LP supply is uninitialized: ignore any dust that was donated and
        // synced beforehand, so one-sided donations can never block the first deposit.
        if (DexPair(pair).totalSupply() == 0 || (reserveA == 0 && reserveB == 0)) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = quote(amountBDesired, reserveB, reserveA);
                if (amountAOptimal > amountADesired) revert ExcessiveInputAmount();
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
        if (amountA == 0 || amountB == 0) revert InsufficientAmount();
        if (amountA < amountAMin) revert InsufficientAAmount();
        if (amountB < amountBMin) revert InsufficientBAmount();
    }

    function _swap(uint256[] memory amounts, address[] calldata path, address to) private {
        for (uint256 i; i < path.length - 1; ++i) {
            (address input, address output) = (path[i], path[i + 1]);
            uint256 amount0Out;
            uint256 amount1Out;
            {
                (address token0,) = _sortTokens(input, output);
                uint256 amountOut = amounts[i + 1];
                (amount0Out, amount1Out) = input == token0
                    ? (uint256(0), amountOut) : (amountOut, uint256(0));
            }
            address recipient = i < path.length - 2 ? pairFor(output, path[i + 2]) : to;
            DexPair(pairFor(input, output)).swap(amount0Out, amount1Out, recipient, "");
        }
    }

    function _sortTokens(address tokenA, address tokenB) private pure returns (address token0, address token1) {
        if (tokenA == tokenB || tokenA == address(0) || tokenB == address(0)) revert InvalidTokens();
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
    }

    function _validateRecipient(address to) private view {
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
    }

    function _validatePath(address[] memory path) private view {
        if (path.length < 2) revert InvalidPath();
        for (uint256 i; i < path.length; ++i) {
            if (path[i] == address(0) || path[i] == address(this)) revert InvalidPath();
            if (i > 0 && path[i] == path[i - 1]) revert InvalidPath();
            // A pair cannot send its output back to itself for the next hop.
            if (i > 1 && path[i] == path[i - 2]) revert InvalidPath();
        }
    }
}
