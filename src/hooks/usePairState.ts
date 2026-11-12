import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import { factoryAbi, pairAbi, routerAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID, DEX_FACTORY, DEX_ROUTER } from '@/lib/dex/config'
import type { Token } from '@/lib/dex/tokens'

const ZERO = '0x0000000000000000000000000000000000000000'

/** Live state of the pool for two tokens, with reserves oriented as tokenA / tokenB. */
export function usePairState(tokenA?: Token, tokenB?: Token) {
  const { address: account } = useAccount()
  const ready = !!tokenA && !!tokenB && tokenA.address.toLowerCase() !== tokenB.address.toLowerCase()

  const pairQuery = useReadContract({
    address: DEX_FACTORY,
    abi: factoryAbi,
    functionName: 'getPair',
    args: tokenA && tokenB ? [tokenA.address, tokenB.address] : undefined,
    chainId: DEX_CHAIN_ID,
    query: { enabled: ready && !!DEX_FACTORY },
  })
  const pair = pairQuery.data && pairQuery.data !== ZERO ? (pairQuery.data) : undefined

  const detail = useReadContracts({
    allowFailure: true,
    contracts: pair && tokenA && tokenB
      ? [
          { address: DEX_ROUTER, abi: routerAbi, functionName: 'getReserves' as const, args: [tokenA.address, tokenB.address] as const, chainId: DEX_CHAIN_ID },
          { address: pair, abi: pairAbi, functionName: 'totalSupply' as const, chainId: DEX_CHAIN_ID },
          { address: pair, abi: pairAbi, functionName: 'balanceOf' as const, args: [account ?? ZERO] as const, chainId: DEX_CHAIN_ID },
        ]
      : [],
    query: { enabled: !!pair && !!DEX_ROUTER, refetchInterval: 15_000 },
  })

  const reserves = detail.data?.[0]
  const supply = detail.data?.[1]
  const lp = detail.data?.[2]
  const totalSupply = supply?.status === 'success' ? (supply.result) : 0n
  const [reserveA, reserveB] = reserves?.status === 'success' ? (reserves.result) : [0n, 0n]

  return {
    pair,
    totalSupply,
    reserveA,
    reserveB,
    lpBalance: account && lp?.status === 'success' ? (lp.result) : 0n,
    /** True when no liquidity has been supplied yet, so the next deposit sets the price. */
    isNew: !pair || totalSupply === 0n,
    isLoading: ready && (pairQuery.isLoading || (!!pair && detail.isLoading)),
  }
}
