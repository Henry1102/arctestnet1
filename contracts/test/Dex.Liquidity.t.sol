// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DexTestBase} from "./Dex.Base.t.sol";
import {DexPair} from "../DexPair.sol";
import {DexRouter} from "../DexRouter.sol";
import {DexFactory} from "../DexFactory.sol";
import {TestToken} from "../TestToken.sol";

contract DexLiquidityTest is DexTestBase {
    // ---------- new pool ----------

    function test_AddLiquidity_NewPair_6and18Decimals() public {
        assertEq(factory.getPair(address(usdc), address(dai)), address(0));
        uint256 lpUsdcBefore = usdc.balanceOf(lp);
        uint256 lpDaiBefore = dai.balanceOf(lp);

        (uint256 a, uint256 b, uint256 liq) = _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);

        assertEq(a, 1_000_000 * U);
        assertEq(b, 1_000_000 * E);
        // sqrt(1e12 * 1e24) = 1e18
        assertEq(liq, 1e18 - 1000);
        DexPair pair = _pair(address(usdc), address(dai));
        assertTrue(address(pair) != address(0), "pair auto-created");
        assertEq(factory.allPairsLength(), 1);
        assertEq(pair.balanceOf(lp), 1e18 - 1000);
        assertEq(pair.balanceOf(DEAD), 1000);
        assertEq(pair.totalSupply(), 1e18);
        (uint256 ru, uint256 rd) = _res(address(usdc), address(dai));
        assertEq(ru, 1_000_000 * U);
        assertEq(rd, 1_000_000 * E);
        assertEq(usdc.balanceOf(lp), lpUsdcBefore - 1_000_000 * U);
        assertEq(dai.balanceOf(lp), lpDaiBefore - 1_000_000 * E);
        assertEq(usdc.balanceOf(address(router)), 0);
        assertEq(dai.balanceOf(address(router)), 0);
    }

    function test_AddLiquidity_NewPair_Both18Decimals_ReversedArgOrder() public {
        // sqrt(2e24 * 5e23 ) = sqrt(1e48) = 1e24
        vm.prank(lp);
        (uint256 a, uint256 b, uint256 liq) =
            router.addLiquidity(address(tkc), address(dai), 2_000_000 * E, 500_000 * E, 0, 0, lp, deadline);
        assertEq(a, 2_000_000 * E);
        assertEq(b, 500_000 * E);
        assertEq(liq, 1e24 - 1000);
        DexPair pair = _pair(address(dai), address(tkc));
        assertEq(pair.balanceOf(DEAD), 1000);
        (uint256 rt, uint256 rd) = _res(address(tkc), address(dai));
        assertEq(rt, 2_000_000 * E);
        assertEq(rd, 500_000 * E);
    }

    function test_AddLiquidity_EmitsPairMintAndSync() public {
        address pairAddr = factory.createPair(address(usdc), address(dai));
        bool usdcIs0 = DexPair(pairAddr).token0() == address(usdc);
        (uint256 a0, uint256 a1) = usdcIs0 ? (100 * U, 100 * E) : (100 * E, 100 * U);
        vm.expectEmit(true, false, false, true, pairAddr);
        emit DexPair.Mint(address(router), a0, a1);
        _addLiq(usdc, dai, 100 * U, 100 * E);
    }

    function test_AddLiquidity_RecipientGetsLp() public {
        address other = makeAddr("other");
        vm.prank(lp);
        (,, uint256 liq) = router.addLiquidity(address(usdc), address(dai), 1_000_000 * U, 1_000_000 * E, 0, 0, other, deadline);
        assertEq(_pair(address(usdc), address(dai)).balanceOf(other), liq);
        assertEq(_pair(address(usdc), address(dai)).balanceOf(lp), 0);
    }

    // ---------- second deposit ----------

    function test_AddLiquidity_SecondDeposit_KeepsRatio_ExcessBDesiredNotPulled() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        uint256 daiBefore = dai.balanceOf(lp);
        (uint256 a, uint256 b, uint256 liq) = _addLiq(usdc, dai, 100 * U, 500 * E);
        assertEq(a, 100 * U);
        assertEq(b, 100 * E, "B clipped to pool ratio");
        assertEq(dai.balanceOf(lp), daiBefore - 100 * E);
        // liq = 100e6 * 1e18 / 1e12
        assertEq(liq, 1e14);
        (uint256 ru, uint256 rd) = _res(address(usdc), address(dai));
        assertEq(ru, 1_000_100 * U);
        assertEq(rd, 1_000_100 * E);
    }

    function test_AddLiquidity_SecondDeposit_ExcessADesiredClipped() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        uint256 usdcBefore = usdc.balanceOf(lp);
        (uint256 a, uint256 b,) = _addLiq(usdc, dai, 500 * U, 100 * E);
        assertEq(a, 100 * U);
        assertEq(b, 100 * E);
        assertEq(usdc.balanceOf(lp), usdcBefore - 100 * U);
    }

    function test_AddLiquidity_NonUnitRatio() public {
        _addLiq(dai, tkc, 500_000 * E, 2_000_000 * E); // 1 dai = 4 tkc
        (uint256 a, uint256 b,) = _addLiq(dai, tkc, 10 * E, 1000 * E);
        assertEq(a, 10 * E);
        assertEq(b, 40 * E);
        // reversed arg order
        vm.prank(lp);
        (uint256 c, uint256 d,) = router.addLiquidity(address(tkc), address(dai), 400 * E, 1000 * E, 0, 0, lp, deadline);
        assertEq(c, 400 * E);
        assertEq(d, 100 * E);
    }

    function test_RevertWhen_SecondDeposit_BMinNotMet() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        vm.prank(lp);
        vm.expectRevert(DexRouter.InsufficientBAmount.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 500 * E, 100 * U, 101 * E, lp, deadline);
    }

    function test_RevertWhen_SecondDeposit_AMinNotMet() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        vm.prank(lp);
        vm.expectRevert(DexRouter.InsufficientAAmount.selector);
        router.addLiquidity(address(usdc), address(dai), 500 * U, 100 * E, 101 * U, 100 * E, lp, deadline);
    }

    function test_SecondDeposit_MinAmountsExactlyMet() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        vm.prank(lp);
        (uint256 a, uint256 b,) =
            router.addLiquidity(address(usdc), address(dai), 500 * U, 100 * E, 100 * U, 100 * E, lp, deadline);
        assertEq(a, 100 * U);
        assertEq(b, 100 * E);
    }

    // ---------- addLiquidity reverts ----------

    function test_RevertWhen_AddLiquidityMinAboveDesired_NewPool() public {
        vm.prank(lp);
        vm.expectRevert(DexRouter.InsufficientAAmount.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 100 * E, 101 * U, 0, lp, deadline);
        vm.prank(lp);
        vm.expectRevert(DexRouter.InsufficientBAmount.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 100 * E, 0, 101 * E, lp, deadline);
    }

    function test_RevertWhen_AddLiquidityZeroDesired() public {
        vm.prank(lp);
        vm.expectRevert(DexRouter.InsufficientAmount.selector);
        router.addLiquidity(address(usdc), address(dai), 0, 100 * E, 0, 0, lp, deadline);
        vm.prank(lp);
        vm.expectRevert(DexRouter.InsufficientAmount.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 0, 0, 0, lp, deadline);
    }

    function test_RevertWhen_AddLiquidityExpired() public {
        vm.warp(deadline + 1);
        vm.prank(lp);
        vm.expectRevert(DexRouter.Expired.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 100 * E, 0, 0, lp, deadline);
    }

    function test_AddLiquidity_AtExactDeadlineSucceeds() public {
        vm.warp(deadline);
        _addLiq(usdc, dai, 100 * U, 100 * E);
    }

    function test_RevertWhen_AddLiquidityInvalidTokens() public {
        vm.startPrank(lp);
        vm.expectRevert(DexRouter.InvalidTokens.selector);
        router.addLiquidity(address(usdc), address(usdc), 1, 1, 0, 0, lp, deadline);
        vm.expectRevert(DexRouter.InvalidTokens.selector);
        router.addLiquidity(address(0), address(usdc), 1, 1, 0, 0, lp, deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_AddLiquidityInvalidRecipient() public {
        vm.startPrank(lp);
        vm.expectRevert(DexRouter.InvalidRecipient.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 100 * E, 0, 0, address(0), deadline);
        vm.expectRevert(DexRouter.InvalidRecipient.selector);
        router.addLiquidity(address(usdc), address(dai), 100 * U, 100 * E, 0, 0, address(router), deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_FirstDepositAtMinimumLiquidity() public {
        // sqrt(1000 * 1000) == MINIMUM_LIQUIDITY -> InsufficientLiquidityMinted
        vm.prank(lp);
        vm.expectRevert(DexPair.InsufficientLiquidityMinted.selector);
        router.addLiquidity(address(usdc), address(dai), 1000, 1000, 0, 0, lp, deadline);
    }

    // ---------- removeLiquidity ----------

    function test_RemoveLiquidity_ReturnsProportionalAmounts() public {
        (,, uint256 liq) = _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        DexPair pair = _pair(address(usdc), address(dai));
        vm.prank(lp);
        pair.approve(address(router), type(uint256).max);

        uint256 half = liq / 2;
        uint256 supply = pair.totalSupply();
        uint256 expU = half * (1_000_000 * U) / supply;
        uint256 expD = half * (1_000_000 * E) / supply;
        address dest = makeAddr("dest");

        vm.prank(lp);
        (uint256 a, uint256 b) = router.removeLiquidity(address(usdc), address(dai), half, expU, expD, dest, deadline);

        assertEq(a, expU);
        assertEq(b, expD);
        assertEq(usdc.balanceOf(dest), expU);
        assertEq(dai.balanceOf(dest), expD);
        assertEq(pair.balanceOf(lp), liq - half);
        assertEq(pair.totalSupply(), supply - half);
        (uint256 ru, uint256 rd) = _res(address(usdc), address(dai));
        assertEq(ru, 1_000_000 * U - expU);
        assertEq(rd, 1_000_000 * E - expD);
    }

    function test_RemoveLiquidity_ReversedTokenOrder_ReturnsInCallerOrder() public {
        (,, uint256 liq) = _addLiq(dai, tkc, 500_000 * E, 2_000_000 * E);
        DexPair pair = _pair(address(dai), address(tkc));
        vm.startPrank(lp);
        pair.approve(address(router), type(uint256).max);
        (uint256 a, uint256 b) = router.removeLiquidity(address(tkc), address(dai), liq / 4, 0, 0, lp, deadline);
        vm.stopPrank();
        // tkc:dai is 4:1 so a ≈ 4*b
        assertApproxEqAbs(a, 4 * b, 4);
        assertGt(a, b);
    }

    function test_RemoveLiquidity_AllLpLeavesLockedMinimum() public {
        (,, uint256 liq) = _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        DexPair pair = _pair(address(usdc), address(dai));
        vm.startPrank(lp);
        pair.approve(address(router), liq);
        router.removeLiquidity(address(usdc), address(dai), liq, 0, 0, lp, deadline);
        vm.stopPrank();
        assertEq(pair.totalSupply(), 1000);
        assertEq(pair.balanceOf(DEAD), 1000);
        (uint256 ru, uint256 rd) = _res(address(usdc), address(dai));
        assertGt(ru, 0);
        assertGt(rd, 0);
    }

    function test_RevertWhen_RemoveLiquidityMinsNotMet() public {
        (,, uint256 liq) = _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        DexPair pair = _pair(address(usdc), address(dai));
        vm.startPrank(lp);
        pair.approve(address(router), liq);
        vm.expectRevert(DexRouter.InsufficientAAmount.selector);
        router.removeLiquidity(address(usdc), address(dai), liq / 2, 1_000_000 * U, 0, lp, deadline);
        vm.expectRevert(DexRouter.InsufficientBAmount.selector);
        router.removeLiquidity(address(usdc), address(dai), liq / 2, 0, 1_000_000 * E, lp, deadline);
        vm.stopPrank();
    }

    function test_RevertWhen_RemoveLiquidityExpiredOrBadRecipientOrNoPair() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        vm.startPrank(lp);
        vm.expectRevert(DexRouter.InvalidRecipient.selector);
        router.removeLiquidity(address(usdc), address(dai), 1, 0, 0, address(0), deadline);
        vm.expectRevert(DexRouter.PairNotFound.selector);
        router.removeLiquidity(address(usdc), address(tkc), 1, 0, 0, lp, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(DexRouter.Expired.selector);
        router.removeLiquidity(address(usdc), address(dai), 1, 0, 0, lp, deadline);
        vm.stopPrank();
    }

    // ---------- donation + sync regression ----------

    function _donationRegression(TestToken donated) internal {
        address pairAddr = factory.createPair(address(usdc), address(dai));
        DexPair pair = DexPair(pairAddr);
        // One-sided donation then sync on an uninitialised pair.
        uint256 donation = donated == usdc ? 777 * U : 777 * E;
        vm.prank(trader);
        donated.transfer(pairAddr, donation);
        pair.sync();
        (uint112 r0, uint112 r1,) = pair.getReserves();
        assertTrue((r0 == 0) != (r1 == 0), "one-sided reserves");
        assertEq(pair.totalSupply(), 0);

        // Router addLiquidity must still succeed with exactly the desired amounts.
        vm.prank(lp);
        (uint256 a, uint256 b, uint256 liq) =
            router.addLiquidity(address(usdc), address(dai), 1_000_000 * U, 1_000_000 * E, 0, 0, lp, deadline);
        assertEq(a, 1_000_000 * U);
        assertEq(b, 1_000_000 * E);
        assertEq(liq, 1e18 - 1000);
        assertEq(pair.balanceOf(DEAD), 1000);
        assertEq(pair.balanceOf(lp), 1e18 - 1000);
    }

    function test_Regression_DonateUsdcAndSync_DoesNotBlockAddLiquidity() public {
        _donationRegression(usdc);
    }

    function test_Regression_DonateDaiAndSync_DoesNotBlockAddLiquidity() public {
        _donationRegression(dai);
    }

    function test_Regression_DonateWithoutSync_DoesNotBlockAddLiquidity() public {
        address pairAddr = factory.createPair(address(usdc), address(dai));
        vm.prank(trader);
        dai.transfer(pairAddr, 5 * E);
        // Without sync, reserves are 0/0; pair.mint would count the donation as deposit.
        vm.prank(lp);
        (,, uint256 liq) = router.addLiquidity(address(usdc), address(dai), 1_000_000 * U, 1_000_000 * E, 0, 0, lp, deadline);
        assertGt(liq, 0);
    }

    function test_Regression_DonationAfterInit_SubsequentAddStillWorks() public {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        address pairAddr = factory.getPair(address(usdc), address(dai));
        vm.prank(trader);
        dai.transfer(pairAddr, 1000 * E);
        DexPair(pairAddr).sync();
        (uint256 a, uint256 b, uint256 liq) = _addLiq(usdc, dai, 100 * U, 500 * E);
        assertEq(a, 100 * U);
        assertGt(b, 0);
        assertGt(liq, 0);
    }
}
