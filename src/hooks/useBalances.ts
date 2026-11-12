import { useMemo } from 'react'
import { useAccount, useReadContracts } from 'wagmi'
import { erc20MetaAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID } from '@/lib/dex/config'
import type { Token } from '@/lib/dex/tokens'

/**
 * ERC-20 balances for a list of tokens. On Arc, USDC is shown from its ERC-20 view only (6 decimals);
 * the 18-decimal native gas view is the same funds and is never added on top.
 */
export function useTokenBalances(tokens: Token[]) {
  const { address } = useAccount()
  const query = useReadContracts({
    allowFailure: true,
    contracts: address
      ? tokens.map((token) => ({
          address: token.address,
          abi: erc20MetaAbi,
          functionName: 'balanceOf' as const,
          args: [address] as const,
          chainId: DEX_CHAIN_ID,
        }))
      : [],
    query: { enabled: !!address && tokens.length > 0, refetchInterval: 15_000 },
  })

  const balances = useMemo(() => {
    const map: Record<string, bigint | undefined> = {}
    tokens.forEach((token, i) => {
      const result = query.data?.[i]
      map[token.address.toLowerCase()] = result?.status === 'success' ? (result.result) : undefined
    })
    return map
  }, [tokens, query.data])

  return { balances, isLoading: query.isLoading, refetch: query.refetch }
}

export function useTokenBalance(token?: Token) {
  const list = useMemo(() => (token ? [token] : []), [token])
  const { balances, isLoading } = useTokenBalances(list)
  return { balance: token ? balances[token.address.toLowerCase()] : undefined, isLoading }
}
