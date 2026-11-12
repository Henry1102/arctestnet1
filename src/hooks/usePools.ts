import { useMemo } from 'react'
import { useAccount, useReadContract, useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { factoryAbi, pairAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID, DEX_FACTORY } from '@/lib/dex/config'
import type { Token } from '@/lib/dex/tokens'
import { useResolvedTokens } from './useTokens'

export interface Pool {
  pair: Address
  token0: Token
  token1: Token
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  lpBalance: bigint
}

/** Newest pools shown first; keeps the first load bounded on a busy factory. */
const MAX_POOLS = 60

export function usePools() {
  const { address: account } = useAccount()

  const lengthQuery = useReadContract({
    address: DEX_FACTORY,
    abi: factoryAbi,
    functionName: 'allPairsLength',
    chainId: DEX_CHAIN_ID,
    query: { enabled: !!DEX_FACTORY, refetchInterval: 20_000 },
  })
  const total = lengthQuery.data !== undefined ? Number(lengthQuery.data) : 0
  const first = Math.max(0, total - MAX_POOLS)

  const pairsQuery = useReadContracts({
    allowFailure: false,
    contracts: Array.from({ length: total - first }, (_, i) => ({
      address: DEX_FACTORY as Address,
      abi: factoryAbi,
      functionName: 'allPairs' as const,
      args: [BigInt(first + i)] as const,
      chainId: DEX_CHAIN_ID,
    })),
    query: { enabled: !!DEX_FACTORY && total > 0 },
  })
  const pairs = useMemo(() => (pairsQuery.data ?? []), [pairsQuery.data])

  const detailsQuery = useReadContracts({
    allowFailure: true,
    contracts: pairs.flatMap((pair) => [
      { address: pair, abi: pairAbi, functionName: 'token0' as const, chainId: DEX_CHAIN_ID },
      { address: pair, abi: pairAbi, functionName: 'token1' as const, chainId: DEX_CHAIN_ID },
      { address: pair, abi: pairAbi, functionName: 'getReserves' as const, chainId: DEX_CHAIN_ID },
      { address: pair, abi: pairAbi, functionName: 'totalSupply' as const, chainId: DEX_CHAIN_ID },
      {
        address: pair,
        abi: pairAbi,
        functionName: 'balanceOf' as const,
        args: [account ?? '0x0000000000000000000000000000000000000000'] as const,
        chainId: DEX_CHAIN_ID,
      },
    ]),
    query: { enabled: pairs.length > 0, refetchInterval: 20_000 },
  })

  const tokenAddresses = useMemo(() => {
    const out: Address[] = []
    pairs.forEach((_, i) => {
      const t0 = detailsQuery.data?.[i * 5]
      const t1 = detailsQuery.data?.[i * 5 + 1]
      if (t0?.status === 'success') out.push(t0.result as Address)
      if (t1?.status === 'success') out.push(t1.result as Address)
    })
    return out
  }, [pairs, detailsQuery.data])
  const tokenMap = useResolvedTokens(tokenAddresses)

  const pools = useMemo(() => {
    const list: Pool[] = []
    pairs.forEach((pair, i) => {
      const d = detailsQuery.data
      if (!d) return
      const [t0, t1, reserves, supply, balance] = [d[i * 5], d[i * 5 + 1], d[i * 5 + 2], d[i * 5 + 3], d[i * 5 + 4]]
      if (t0?.status !== 'success' || t1?.status !== 'success' || reserves?.status !== 'success') return
      const token0 = tokenMap[(t0.result as Address).toLowerCase()]
      const token1 = tokenMap[(t1.result as Address).toLowerCase()]
      if (!token0 || !token1) return
      const [reserve0, reserve1] = reserves.result as readonly [bigint, bigint, number]
      list.push({
        pair,
        token0,
        token1,
        reserve0,
        reserve1,
        totalSupply: supply?.status === 'success' ? (supply.result as bigint) : 0n,
        lpBalance: account && balance?.status === 'success' ? (balance.result as bigint) : 0n,
      })
    })
    return list.reverse()
  }, [pairs, detailsQuery.data, tokenMap, account])

  return {
    pools,
    total,
    isLoading: lengthQuery.isLoading || (total > 0 && (pairsQuery.isLoading || detailsQuery.isLoading)),
    isError: lengthQuery.isError || pairsQuery.isError,
  }
}
