// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DexPair} from "./DexPair.sol";

/// @title Permissionless CREATE2 factory for Arc DEX pairs
contract DexFactory {
    mapping(address => mapping(address => address)) public getPair;
    address[] public allPairs;

    error IdenticalTokens();
    error ZeroAddress();
    error PairExists();

    /// @notice Emitted when a new sorted token pair is deployed and initialized.
    event PairCreated(address indexed token0, address indexed token1, address pair, uint256 pairCount);

    /// @notice Creates a unique pair for two nonzero, distinct token addresses.
    function createPair(address tokenA, address tokenB) external returns (address pair) {
        if (tokenA == tokenB) revert IdenticalTokens();
        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        if (token0 == address(0)) revert ZeroAddress();
        if (getPair[token0][token1] != address(0)) revert PairExists();
        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        pair = address(new DexPair{salt: salt}());
        DexPair(pair).initialize(token0, token1);
        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);
        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    /// @notice Returns the number of pairs created by this factory.
    function allPairsLength() external view returns (uint256) {
        return allPairs.length;
    }

    /// @notice Returns the hash of the exact pair creation bytecode used by this factory.
    function pairCodeHash() external pure returns (bytes32) {
        return keccak256(type(DexPair).creationCode);
    }
}
