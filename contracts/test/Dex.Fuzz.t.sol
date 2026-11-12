// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DexTestBase} from "./Dex.Base.t.sol";
import {DexPair} from "../DexPair.sol";
import {DexRouter} from "../DexRouter.sol";
import {TestToken} from "../TestToken.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

contract DexSwapHandler is Test {
    DexRouter public router;
    TestToken public usdc;
    TestToken public dai;
    DexPair public pair;
    uint256 public swaps;
    uint256 public minK; // smallest k ever observed after the initial deposit

    constructor(DexRouter _router, TestToken _usdc, TestToken _dai, DexPair _pair) {
        router = _router;
        usdc = _usdc;
        dai = _dai;
        pair = _pair;
        deal(address(_usdc), address(this), 1e30, true);
        deal(address(_dai), address(this), 1e30, true);
        _usdc.approve(address(_router), type(uint256).max);
        _dai.approve(address(_router), type(uint256).max);
        minK = _k();
    }

    function _k() internal view returns (uint256) {
        (uint112 r0, uint112 r1,) = pair.getReserves();
        return uint256(r0) * uint256(r1);
    }

    function swapUsdcForDai(uint256 amt) external {
        (uint256 ru,) = router.getReserves(address(usdc), address(dai));
        amt = bound(amt, 1, ru / 2);
        address[] memory p = new address[](2);
        p[0] = address(usdc);
        p[1] = address(dai);
        try router.swapExactTokensForTokens(amt, 0, p, address(this), block.timestamp) {
            ++swaps;
        } catch {}
        uint256 k = _k();
        if (k < minK) minK = k;
    }

    function swapDaiForUsdc(uint256 amt) external {
        (, uint256 rd) = router.getReserves(address(usdc), address(dai));
        amt = bound(amt, 1, rd / 2);
        address[] memory p = new address[](2);
        p[0] = address(dai);
        p[1] = address(usdc);
        try router.swapExactTokensForTokens(amt, 0, p, address(this), block.timestamp) {
            ++swaps;
        } catch {}
        uint256 k = _k();
        if (k < minK) minK = k;
    }

    function addLiquidity(uint256 amt) external {
        (uint256 ru,) = router.getReserves(address(usdc), address(dai));
        amt = bound(amt, 1, ru / 10);
        try router.addLiquidity(address(usdc), address(dai), amt, type(uint128).max, 0, 0, address(this), block.timestamp) {}
        catch {}
        uint256 k = _k();
        if (k < minK) minK = k;
    }
}

contract DexFuzzTest is DexTestBase {
    function setUp() public override {
        super.setUp();
        _seedPools();
    }

    function _k(address a, address b) internal view returns (uint256) {
        (uint256 ra, uint256 rb) = _res(a, b);
        return ra * rb;
    }

    function testFuzz_SwapExactIn_KNeverDecreases_AndOutputMatchesFormula(uint256 amtIn, bool usdcToDai) public {
        (address tin, address tout) = usdcToDai ? (address(usdc), address(dai)) : (address(dai), address(usdc));
        // bounds keep output non-zero (dai->usdc needs >= ~1e13 wei) and below reserves
        amtIn = usdcToDai ? bound(amtIn, 1, 5e11) : bound(amtIn, 1e13, 5e23);
        (uint256 rin, uint256 rout) = _res(tin, tout);
        uint256 kBefore = rin * rout;
        uint256 expected = _refOut(amtIn, rin, rout);
        uint256 balBefore = TestToken(tout).balanceOf(trader);

        vm.prank(trader);
        router.swapExactTokensForTokens(amtIn, 0, _path2(tin, tout), trader, deadline);

        assertEq(TestToken(tout).balanceOf(trader) - balBefore, expected);
        assertGe(_k(tin, tout), kBefore, "k decreased");
    }

    function testFuzz_SwapForExactOut_KNeverDecreases_AndInputIsSufficient(uint256 amtOut, bool usdcToDai) public {
        (address tin, address tout) = usdcToDai ? (address(usdc), address(dai)) : (address(dai), address(usdc));
        (uint256 rin, uint256 rout) = _res(tin, tout);
        amtOut = bound(amtOut, 1, rout / 2);
        uint256 kBefore = rin * rout;
        uint256 outBefore = TestToken(tout).balanceOf(trader);

        vm.prank(trader);
        uint256[] memory amts = router.swapTokensForExactTokens(amtOut, type(uint256).max, _path2(tin, tout), trader, deadline);

        assertEq(TestToken(tout).balanceOf(trader) - outBefore, amtOut, "exact output delivered");
        assertEq(amts[1], amtOut);
        assertGe(_k(tin, tout), kBefore, "k decreased");
    }

    function testFuzz_TwoHop_KNeverDecreasesOnEitherPool(uint256 amtIn) public {
        amtIn = bound(amtIn, 1e3, 1e11);
        uint256 k1 = _k(address(usdc), address(dai));
        uint256 k2 = _k(address(dai), address(tkc));
        vm.prank(trader);
        router.swapExactTokensForTokens(amtIn, 0, _path3(address(usdc), address(dai), address(tkc)), trader, deadline);
        assertGe(_k(address(usdc), address(dai)), k1);
        assertGe(_k(address(dai), address(tkc)), k2);
    }

    function testFuzz_NewPool_LpIsSqrtMinusMinimum(uint256 a, uint256 b) public {
        a = bound(a, 1e4, 1e27);
        b = bound(b, 1e4, 1e27);
        TestToken x = new TestToken("X", "X", 6);
        TestToken y = new TestToken("Y", "Y", 18);
        deal(address(x), lp, 1e30, true);
        deal(address(y), lp, 1e30, true);
        vm.startPrank(lp);
        x.approve(address(router), type(uint256).max);
        y.approve(address(router), type(uint256).max);
        (,, uint256 liq) = router.addLiquidity(address(x), address(y), a, b, 0, 0, lp, deadline);
        vm.stopPrank();
        assertEq(liq, Math.sqrt(a * b) - 1000);
        assertEq(_pair(address(x), address(y)).balanceOf(DEAD), 1000);
    }

    function testFuzz_AddThenRemove_NeverReturnsMoreThanDeposited(uint256 a) public {
        a = bound(a, 1e3, 1e11);
        (uint256 used0, uint256 used1, uint256 liq) = _addLiq(usdc, dai, a, 1e30);
        DexPair pair = _pair(address(usdc), address(dai));
        vm.startPrank(lp);
        pair.approve(address(router), liq);
        (uint256 outU, uint256 outD) = router.removeLiquidity(address(usdc), address(dai), liq, 0, 0, lp, deadline);
        vm.stopPrank();
        assertLe(outU, used0);
        assertLe(outD, used1);
    }
}

contract DexInvariantTest is DexTestBase {
    DexSwapHandler internal handler;
    uint256 internal initialK;

    function setUp() public override {
        super.setUp();
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        DexPair pair = _pair(address(usdc), address(dai));
        (uint112 r0, uint112 r1,) = pair.getReserves();
        initialK = uint256(r0) * uint256(r1);
        handler = new DexSwapHandler(router, usdc, dai, pair);
        targetContract(address(handler));
    }

    /// Guards against a vacuous invariant: handler actions really execute (not swallowed by try/catch).
    function test_HandlerActionsActuallySucceed() public {
        handler.swapUsdcForDai(1e9);
        handler.swapDaiForUsdc(1e20);
        assertEq(handler.swaps(), 2);
        (uint256 ru,) = _res(address(usdc), address(dai));
        uint256 supplyBefore = _pair(address(usdc), address(dai)).totalSupply();
        handler.addLiquidity(1e9);
        assertGt(_pair(address(usdc), address(dai)).totalSupply(), supplyBefore);
        assertGt(ru, 0);
    }

    /// k never falls below its post-deposit value under arbitrary swaps + deposits.
    function invariant_KNeverBelowInitial() public view {
        assertGe(handler.minK(), initialK);
    }

    /// With only router operations (no donations), reserves always equal token balances
    /// and the 1000 locked LP units stay locked.
    function invariant_ReservesMatchBalances_AndLockedLpIntact() public view {
        DexPair pair = _pair(address(usdc), address(dai));
        (uint256 ru, uint256 rd) = _res(address(usdc), address(dai));
        assertEq(usdc.balanceOf(address(pair)), ru);
        assertEq(dai.balanceOf(address(pair)), rd);
        assertEq(pair.balanceOf(DEAD), 1000);
        assertGe(pair.totalSupply(), 1000);
    }
}
