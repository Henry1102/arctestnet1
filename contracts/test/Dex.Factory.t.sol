// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DexTestBase} from "./Dex.Base.t.sol";
import {DexFactory} from "../DexFactory.sol";
import {DexPair} from "../DexPair.sol";
import {TestToken} from "../TestToken.sol";

contract DexFactoryTest is DexTestBase {
    function test_CreatePair_SortsTokensAndRegistersBothDirections() public {
        address a = address(usdc);
        address b = address(dai);
        address pair = factory.createPair(a, b);
        assertTrue(pair != address(0));
        assertEq(factory.getPair(a, b), pair);
        assertEq(factory.getPair(b, a), pair);
        (address lo, address hi) = a < b ? (a, b) : (b, a);
        assertEq(DexPair(pair).token0(), lo);
        assertEq(DexPair(pair).token1(), hi);
        assertEq(DexPair(pair).factory(), address(factory));
    }

    function test_CreatePair_ReversedArgsGiveSamePairOrdering() public {
        address pair = factory.createPair(address(dai), address(usdc));
        assertTrue(DexPair(pair).token0() < DexPair(pair).token1());
    }

    function test_CreatePair_EmitsPairCreated() public {
        (address lo, address hi) = address(usdc) < address(dai) ? (address(usdc), address(dai)) : (address(dai), address(usdc));
        // Pair address is unknown ahead of time: check topics only, skip data.
        vm.expectEmit(true, true, false, false, address(factory));
        emit DexFactory.PairCreated(lo, hi, address(0), 1);
        factory.createPair(address(usdc), address(dai));
    }

    function test_AllPairsLength_And_AllPairs() public {
        assertEq(factory.allPairsLength(), 0);
        address p1 = factory.createPair(address(usdc), address(dai));
        assertEq(factory.allPairsLength(), 1);
        address p2 = factory.createPair(address(dai), address(tkc));
        assertEq(factory.allPairsLength(), 2);
        assertEq(factory.allPairs(0), p1);
        assertEq(factory.allPairs(1), p2);
        assertTrue(p1 != p2);
    }

    function test_RevertWhen_CreatePairIdentical() public {
        vm.expectRevert(DexFactory.IdenticalTokens.selector);
        factory.createPair(address(usdc), address(usdc));
    }

    function test_RevertWhen_CreatePairZeroAddress() public {
        vm.expectRevert(DexFactory.ZeroAddress.selector);
        factory.createPair(address(0), address(usdc));
        vm.expectRevert(DexFactory.ZeroAddress.selector);
        factory.createPair(address(usdc), address(0));
    }

    function test_RevertWhen_CreatePairBothZero_IsIdentical() public {
        vm.expectRevert(DexFactory.IdenticalTokens.selector);
        factory.createPair(address(0), address(0));
    }

    function test_RevertWhen_CreatePairDuplicate_BothOrders() public {
        factory.createPair(address(usdc), address(dai));
        vm.expectRevert(DexFactory.PairExists.selector);
        factory.createPair(address(usdc), address(dai));
        vm.expectRevert(DexFactory.PairExists.selector);
        factory.createPair(address(dai), address(usdc));
    }

    function test_PairCodeHash_MatchesPairCreationCode() public view {
        assertEq(factory.pairCodeHash(), keccak256(type(DexPair).creationCode));
    }

    function test_RevertWhen_PairInitializedAgainOrByNonFactory() public {
        address pair = factory.createPair(address(usdc), address(dai));
        vm.expectRevert(DexPair.Forbidden.selector);
        DexPair(pair).initialize(address(usdc), address(dai));
        vm.prank(address(factory));
        vm.expectRevert(DexPair.AlreadyInitialized.selector);
        DexPair(pair).initialize(address(usdc), address(dai));
    }
}

contract TestTokenFaucetTest is DexTestBase {
    TestToken internal t6;
    TestToken internal t18;
    address internal bob = makeAddr("bob");

    function setUp() public override {
        super.setUp();
        t6 = new TestToken("Six", "SIX", 6);
        t18 = new TestToken("Eighteen", "EGT", 18);
        vm.warp(1_000_000);
    }

    function test_Faucet_Mints1000WholeTokens_6Decimals() public {
        vm.prank(bob);
        t6.faucet();
        assertEq(t6.balanceOf(bob), 1000 * 10 ** 6);
        assertEq(t6.totalSupply(), 1000 * 10 ** 6);
        assertEq(t6.decimals(), 6);
    }

    function test_Faucet_Mints1000WholeTokens_18Decimals() public {
        vm.prank(bob);
        t18.faucet();
        assertEq(t18.balanceOf(bob), 1000 * 10 ** 18);
        assertEq(t18.decimals(), 18);
    }

    function test_Faucet_EmitsFaucetClaimed() public {
        vm.expectEmit(true, false, false, true, address(t18));
        emit TestToken.FaucetClaimed(bob, 1000e18, block.timestamp + 1 hours);
        vm.prank(bob);
        t18.faucet();
    }

    function test_Faucet_RateLimitedWithinHour() public {
        vm.prank(bob);
        t18.faucet();
        uint256 next = block.timestamp + 1 hours;
        skip(1 hours - 1);
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(TestToken.FaucetRateLimited.selector, next));
        t18.faucet();
        assertEq(t18.balanceOf(bob), 1000e18);
    }

    function test_Faucet_AvailableAgainAfterOneHour() public {
        vm.prank(bob);
        t18.faucet();
        skip(1 hours);
        vm.prank(bob);
        t18.faucet();
        assertEq(t18.balanceOf(bob), 2000e18);
    }

    function test_Faucet_RateLimitIsPerAddress() public {
        address carol = makeAddr("carol");
        vm.prank(bob);
        t18.faucet();
        vm.prank(carol);
        t18.faucet();
        assertEq(t18.balanceOf(carol), 1000e18);
    }

    function test_RevertWhen_DecimalsTooLarge() public {
        vm.expectRevert(TestToken.InvalidDecimals.selector);
        new TestToken("Bad", "BAD", 75);
    }
}
