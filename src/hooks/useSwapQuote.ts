import { useEffect, useMemo, useState } from 'react'
import { useReadContracts } from 'wagmi'
import type { Address } from 'viem'
import { routerAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID, DEX_ROUTER, SWAP_FEE_BPS } from '@/lib/dex/config'
import { sameAddress, type Token } from '@/lib/dex/tokens'

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

interface RouteResult {
  status: 'success' | 'failure'
  result?: unknown
}

/** Chooses the candidate route that pays out the most, skipping routes whose pools do not exist. */
function pickBestRoute(candidates: Address[][], results: readonly RouteResult[] | undefined) {
  let best: { path: Address[]; amounts: bigint[] } | undefined
  candidates.forEach((path, i) => {
    const res = results?.[i]
    if (res?.status !== 'success') return
    const amounts = res.result as readonly bigint[]
    const out = amounts[amounts.length - 1]
    if (out <= 0n) return
    if (!best || out > best.amounts[best.amounts.length - 1]) best = { path, amounts: [...amounts] }
  })
  return best
}

type HopReserves = readonly { status: 'success' | 'failure'; result?: unknown }[] | undefined

/** Price impact compares the executed rate with the pool spot rate, after removing the fee on each hop. */
function computeQuote(
  best: { path: Address[]; amounts: bigint[] } | undefined,
  amountIn: bigint | undefined,
  reserves: HopReserves,
): SwapQuote | undefined {
  if (!best || !amountIn) return undefined
  const hops = best.path.length - 1
  const amountOut = best.amounts[best.amounts.length - 1]
  let spot = 1
  for (let i = 0; i < hops; i++) {
    const res = reserves?.[i]
    if (res?.status !== 'success') return { path: best.path, amounts: best.amounts, amountOut, priceImpact: 0 }
    const [reserveIn, reserveOut] = res.result as readonly [bigint, bigint]
    spot *= Number(reserveOut) / Number(reserveIn)
  }
  const feeFactor = Math.pow(1 - SWAP_FEE_BPS / 10_000, hops)
  const executed = Number(amountOut) / Number(amountIn)
  const impact = Math.max(0, (1 - executed / (spot * feeFactor)) * 100)
  return { path: best.path, amounts: best.amounts, amountOut, priceImpact: Number.isFinite(impact) ? impact : 0 }
}

export interface SwapQuote {
  path: Address[]
  amounts: bigint[]
  amountOut: bigint
  /** Price impact in percent, with the 0.30% pool fee per hop excluded. */
  priceImpact: number
}

/**
 * Finds the best route for an exact-input swap. Tries the direct pool and every two-hop route
 * through another listed token, then keeps the one that pays out the most.
 */
export function useSwapQuote(tokenIn: Token | undefined, tokenOut: Token | undefined, amountIn: bigint | undefined, hubs: Token[]) {
  const candidates = useMemo<Address[][]>(() => {
    if (!tokenIn || !tokenOut || sameAddress(tokenIn.address, tokenOut.address)) return []
    const routes: Address[][] = [[tokenIn.address, tokenOut.address]]
    for (const hub of hubs) {
      if (sameAddress(hub.address, tokenIn.address) || sameAddress(hub.address, tokenOut.address)) continue
      routes.push([tokenIn.address, hub.address, tokenOut.address])
    }
    return routes
  }, [tokenIn, tokenOut, hubs])

  const enabled = !!DEX_ROUTER && !!amountIn && amountIn > 0n && candidates.length > 0

  const quotes = useReadContracts({
    allowFailure: true,
    contracts: candidates.map((path) => ({
      address: DEX_ROUTER as Address,
      abi: routerAbi,
      functionName: 'getAmountsOut' as const,
      args: [amountIn ?? 0n, path] as const,
      chainId: DEX_CHAIN_ID,
    })),
    query: { enabled, refetchInterval: 12_000 },
  })

  const best = useMemo(() => pickBestRoute(candidates, quotes.data), [candidates, quotes.data])

  const reserves = useReadContracts({
    allowFailure: true,
    contracts: best
      ? best.path.slice(0, -1).map((token, i) => ({
          address: DEX_ROUTER as Address,
          abi: routerAbi,
          functionName: 'getReserves' as const,
          args: [token, best.path[i + 1]] as const,
          chainId: DEX_CHAIN_ID,
        }))
      : [],
    query: { enabled: !!best },
  })

  const quote = computeQuote(best, amountIn, reserves.data)

  const loading = enabled && (quotes.isLoading || (!!best && reserves.isLoading))
  return {
    quote,
    isLoading: loading,
    noRoute: enabled && !quotes.isLoading && !best,
  }
}
