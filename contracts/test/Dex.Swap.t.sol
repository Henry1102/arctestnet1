// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DexTestBase} from "./Dex.Base.t.sol";
import {DexPair} from "../DexPair.sol";
import {DexRouter} from "../DexRouter.sol";

contract DexSwapTest is DexTestBase {
    function setUp() public override {
        super.setUp();
        _seedPools(); // usdc/dai 1e12 / 1e24 ; dai/tkc 5e23 / 2e24
    }

    // ---------- swapExactTokensForTokens ----------

    function test_SwapExact_SingleHop_ExactOutput() public {
        uint256 uBefore = usdc.balanceOf(trader);
        uint256 dBefore = dai.balanceOf(trader);
        vm.prank(trader);
        uint256[] memory amts = router.swapExactTokensForTokens(
            1000 * U, 0, _path2(address(usdc), address(dai)), trader, deadline
        );
        assertEq(amts.length, 2);
        assertEq(amts[0], 1000 * U);
        assertEq(amts[1], 996006981039903216493);
        assertEq(usdc.balanceOf(trader), uBefore - 1000 * U);
        assertEq(dai.balanceOf(trader), dBefore + 996006981039903216493);
        (uint256 ru, uint256 rd) = _res(address(usdc), address(dai));
        assertEq(ru, 1_000_000 * U + 1000 * U);
        assertEq(rd, 1_000_000 * E - 996006981039903216493);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(dai.balanceOf(address(router)), 0);
    }

    function test_SwapExact_SingleHop_ReverseDirection_MatchesFormula() public {
        (uint256 rd, uint256 ru) = _res(address(dai), address(usdc));
        uint256 expected = _refOut(100 * E, rd, ru);
        vm.prank(trader);
        uint256[] memory amts =
            router.swapExactTokensForTokens(100 * E, expected, _path2(address(dai), address(usdc)), trader, deadline);
        assertEq(amts[1], expected);
        // 997/1000 sanity: output strictly less than the fee-free price
        assertLt(expected, 100 * U);
    }

    function test_SwapExact_TwoHop_ExactOutput() public {
        uint256 cBefore = tkc.balanceOf(trader);
        uint256 dBefore = dai.balanceOf(trader);
        vm.prank(trader);
        uint256[] memory amts = router.swapExactTokensForTokens(
            1000 * U, 0, _path3(address(usdc), address(dai), address(tkc)), trader, deadline
        );
        assertEq(amts.length, 3);
        assertEq(amts[0], 1000 * U);
        assertEq(amts[1], 996006981039903216493);
        assertEq(amts[2], 3964202783336091666325);
        assertEq(tkc.balanceOf(trader), cBefore + 3964202783336091666325);
        assertEq(dai.balanceOf(trader), dBefore, "intermediate token never touches the trader");
        assertEq(dai.balanceOf(address(router)), 0);
        // pair reserves updated on both hops
        (uint256 r1u, uint256 r1d) = _res(address(usdc), address(dai));
        assertEq(r1u, 1_001_000 * U);
        assertEq(r1d, 1_000_000 * E - 996006981039903216493);
        (uint256 r2d, uint256 r2c) = _res(address(dai), address(tkc));
        assertEq(r2d, 500_000 * E + 996006981039903216493);
        assertEq(r2c, 2_000_000 * E - 3964202783336091666325);
    }

    function test_SwapExact_EmitsSwapEvent() public {
        address pairAddr = factory.getPair(address(usdc), address(dai));
        bool usdcIs0 = DexPair(pairAddr).token0() == address(usdc);
        (uint256 in0, uint256 in1, uint256 out0, uint256 out1) = usdcIs0
            ? (1000 * U, uint256(0), uint256(0), uint256(996006981039903216493))
            : (uint256(0), 1000 * U, uint256(996006981039903216493), uint256(0));
        vm.expectEmit(true, true, false, true, pairAddr);
        emit DexPair.Swap(address(router), in0, in1, out0, out1, trader);
        vm.prank(trader);
        router.swapExactTokensForTokens(1000 * U, 0, _path2(address(usdc), address(dai)), trader, deadline);
    }

    function test_SwapExact_MinOutExactlyMetSucceeds() public {
        vm.prank(trader);
        router.swapExactTokensForTokens(
            1000 * U, 996006981039903216493, _path2(address(usdc), address(dai)), trader, deadline
        );
    }

    function test_RevertWhen_SwapExact_InsufficientOutput() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(
            1000 * U, 996006981039903216494, _path2(address(usdc), address(dai)), trader, deadline
        );
    }

    function test_RevertWhen_SwapExact_TwoHopInsufficientOutput() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.InsufficientOutputAmount.selector);
        router.swapExactTokensForTokens(
            1000 * U, 3964202783336091666326, _path3(address(usdc), address(dai), address(tkc)), trader, deadline
        );
    }

    // ---------- swapTokensForExactTokens ----------

    function test_SwapForExact_SingleHop_ExactInput() public {
        uint256 uBefore = usdc.balanceOf(trader);
        uint256 dBefore = dai.balanceOf(trader);
        vm.prank(trader);
        uint256[] memory amts = router.swapTokensForExactTokens(
            1000 * E, 1004013041, _path2(address(usdc), address(dai)), trader, deadline
        );
        assertEq(amts[0], 1004013041);
        assertEq(amts[1], 1000 * E);
        assertEq(usdc.balanceOf(trader), uBefore - 1004013041);
        assertEq(dai.balanceOf(trader), dBefore + 1000 * E);
    }

    function test_SwapForExact_TwoHop_ExactInputs() public {
        uint256 uBefore = usdc.balanceOf(trader);
        uint256 cBefore = tkc.balanceOf(trader);
        vm.prank(trader);
        uint256[] memory amts = router.swapTokensForExactTokens(
            100 * E, 25152567, _path3(address(usdc), address(dai), address(tkc)), trader, deadline
        );
        assertEq(amts[0], 25152567);
        assertEq(amts[1], 25076479501006143588);
        assertEq(amts[2], 100 * E);
        assertEq(usdc.balanceOf(trader), uBefore - 25152567);
        assertEq(tkc.balanceOf(trader), cBefore + 100 * E);
    }

    function test_RevertWhen_SwapForExact_ExcessiveInput() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.ExcessiveInputAmount.selector);
        router.swapTokensForExactTokens(1000 * E, 1004013040, _path2(address(usdc), address(dai)), trader, deadline);
    }

    function test_RevertWhen_SwapForExact_TwoHopExcessiveInput() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.ExcessiveInputAmount.selector);
        router.swapTokensForExactTokens(
            100 * E, 25152566, _path3(address(usdc), address(dai), address(tkc)), trader, deadline
        );
    }

    function test_RevertWhen_SwapForExact_OutputExceedsReserve() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.InsufficientLiquidity.selector);
        router.swapTokensForExactTokens(
            1_000_000 * E, type(uint256).max, _path2(address(usdc), address(dai)), trader, deadline
        );
    }

    // ---------- deadline / path / recipient ----------

    function test_RevertWhen_SwapExpired() public {
        vm.warp(deadline + 1);
        vm.startPrank(trader);
        vm.expectRevert(DexRouter.Expired.selector);
        router.swapExactTokensForTokens(1000 * U, 0, _path2(address(usdc), address(dai)), trader, deadline);
        vm.expectRevert(DexRouter.Expired.selector);
        router.swapTokensForExactTokens(1 * E, type(uint256).max, _path2(address(usdc), address(dai)), trader, deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_PathTooShort() public {
        address[] memory p = new address[](1);
        p[0] = address(usdc);
        vm.startPrank(trader);
        vm.expectRevert(DexRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(1000, 0, p, trader, deadline);
        vm.expectRevert(DexRouter.InvalidPath.selector);
        router.swapTokensForExactTokens(1000, type(uint256).max, new address[](0), trader, deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_PathHasRepeatedAdjacentToken() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(1000, 0, _path2(address(usdc), address(usdc)), trader, deadline);
    }

    function test_RevertWhen_PathHasZeroOrRouterAddress() public {
        vm.startPrank(trader);
        vm.expectRevert(DexRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(1000, 0, _path2(address(usdc), address(0)), trader, deadline);
        vm.expectRevert(DexRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(1000, 0, _path2(address(router), address(dai)), trader, deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_PathReturnsToTokenTwoBack() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.InvalidPath.selector);
        router.swapExactTokensForTokens(1000 * U, 0, _path3(address(usdc), address(dai), address(usdc)), trader, deadline);
    }

    function test_RevertWhen_PathPairMissing() public {
        // usdc/tkc pair was never created
        vm.prank(trader);
        vm.expectRevert(DexRouter.PairNotFound.selector);
        router.swapExactTokensForTokens(1000 * U, 0, _path2(address(usdc), address(tkc)), trader, deadline);
    }

    function test_RevertWhen_SwapInvalidRecipient() public {
        vm.startPrank(trader);
        vm.expectRevert(DexRouter.InvalidRecipient.selector);
        router.swapExactTokensForTokens(1000 * U, 0, _path2(address(usdc), address(dai)), address(0), deadline);
        vm.expectRevert(DexRouter.InvalidRecipient.selector);
        router.swapExactTokensForTokens(1000 * U, 0, _path2(address(usdc), address(dai)), address(router), deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_SwapZeroAmountIn() public {
        vm.prank(trader);
        vm.expectRevert(DexRouter.InsufficientInputAmount.selector);
        router.swapExactTokensForTokens(0, 0, _path2(address(usdc), address(dai)), trader, deadline);
    }

    // ---------- direct pair.swap ----------

    function test_RevertWhen_PairSwapWithNonEmptyData() public {
        DexPair pair = _pair(address(usdc), address(dai));
        vm.prank(trader);
        vm.expectRevert(DexPair.FlashSwapNotSupported.selector);
        pair.swap(1, 0, trader, hex"01");
    }

    function test_RevertWhen_PairSwapNoOutputOrNoInput() public {
        DexPair pair = _pair(address(usdc), address(dai));
        vm.expectRevert(DexPair.InsufficientOutputAmount.selector);
        pair.swap(0, 0, trader, "");
        // output requested but nothing deposited
        vm.expectRevert(DexPair.InsufficientInputAmount.selector);
        pair.swap(1, 0, trader, "");
    }

    function test_RevertWhen_PairSwapViolatesInvariant() public {
        DexPair pair = _pair(address(usdc), address(dai));
        bool usdcIs0 = pair.token0() == address(usdc);
        // pay in usdc, ask for 1 wei more dai than the fee-adjusted formula allows
        uint256 amtIn = 1000 * U;
        uint256 maxOut = 996006981039903216493;
        vm.prank(trader);
        usdc.transfer(address(pair), amtIn);
        vm.expectRevert(DexPair.InvariantViolation.selector);
        if (usdcIs0) pair.swap(0, maxOut + 1, trader, "");
        else pair.swap(maxOut + 1, 0, trader, "");
        // exactly maxOut is fine
        if (usdcIs0) pair.swap(0, maxOut, trader, "");
        else pair.swap(maxOut, 0, trader, "");
        assertEq(dai.balanceOf(trader), 1e30 + maxOut);
    }

    function test_RevertWhen_PairSwapInvalidRecipient() public {
        DexPair pair = _pair(address(usdc), address(dai));
        vm.expectRevert(DexPair.InvalidRecipient.selector);
        pair.swap(1, 0, address(0), "");
        vm.expectRevert(DexPair.InvalidRecipient.selector);
        pair.swap(1, 0, address(usdc), "");
    }
}
