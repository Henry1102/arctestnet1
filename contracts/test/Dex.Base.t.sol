// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {DexFactory} from "../DexFactory.sol";
import {DexPair} from "../DexPair.sol";
import {DexRouter} from "../DexRouter.sol";
import {TestToken} from "../TestToken.sol";

abstract contract DexTestBase is Test {
    DexFactory internal factory;
    DexRouter internal router;
    TestToken internal usdc; // 6 decimals
    TestToken internal dai; // 18 decimals
    TestToken internal tkc; // 18 decimals

    address internal lp = makeAddr("lp");
    address internal trader = makeAddr("trader");
    address internal constant DEAD = address(0xdead);

    uint256 internal constant U = 1e6;
    uint256 internal constant E = 1e18;
    uint256 internal deadline;

    function setUp() public virtual {
        factory = new DexFactory();
        router = new DexRouter(address(factory));
        usdc = new TestToken("USD Coin", "USDC", 6);
        dai = new TestToken("Dai", "DAI", 18);
        tkc = new TestToken("Token C", "TKC", 18);
        deadline = block.timestamp + 1 hours;

        address[3] memory toks = [address(usdc), address(dai), address(tkc)];
        address[2] memory users = [lp, trader];
        for (uint256 i; i < 3; ++i) {
            for (uint256 j; j < 2; ++j) {
                deal(toks[i], users[j], 1e30, true);
                vm.prank(users[j]);
                TestToken(toks[i]).approve(address(router), type(uint256).max);
            }
        }
    }

    function _addLiq(TestToken a, TestToken b, uint256 amtA, uint256 amtB)
        internal
        returns (uint256 usedA, uint256 usedB, uint256 liq)
    {
        vm.prank(lp);
        (usedA, usedB, liq) = router.addLiquidity(address(a), address(b), amtA, amtB, 0, 0, lp, deadline);
    }

    /// Seeds usdc/dai = 1,000,000e6 / 1,000,000e18 and dai/tkc = 500,000e18 / 2,000,000e18.
    function _seedPools() internal {
        _addLiq(usdc, dai, 1_000_000 * U, 1_000_000 * E);
        _addLiq(dai, tkc, 500_000 * E, 2_000_000 * E);
    }

    function _pair(address a, address b) internal view returns (DexPair) {
        return DexPair(factory.getPair(a, b));
    }

    /// Reserves in (a, b) order.
    function _res(address a, address b) internal view returns (uint256 ra, uint256 rb) {
        (ra, rb) = router.getReserves(a, b);
    }

    function _path2(address a, address b) internal pure returns (address[] memory p) {
        p = new address[](2);
        p[0] = a;
        p[1] = b;
    }

    function _path3(address a, address b, address c) internal pure returns (address[] memory p) {
        p = new address[](3);
        p[0] = a;
        p[1] = b;
        p[2] = c;
    }

    /// Independent reference implementation of the 997/1000 exact-input formula.
    function _refOut(uint256 amtIn, uint256 rIn, uint256 rOut) internal pure returns (uint256) {
        uint256 f = amtIn * 997;
        return f * rOut / (rIn * 1000 + f);
    }
}
