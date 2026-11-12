import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useReadContracts } from 'wagmi'
import { isAddress, getAddress, type Address } from 'viem'
import { erc20MetaAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID } from '@/lib/dex/config'
import {
  buildDefaultTokens,
  loadCustomTokens,
  saveCustomTokens,
  sameAddress,
  type Token,
} from '@/lib/dex/tokens'

interface TokensContextValue {
  tokens: Token[]
  findToken: (address?: string) => Token | undefined
  addCustomToken: (token: Omit<Token, 'builtIn'>) => void
  removeCustomToken: (address: string) => void
}

const TokensContext = createContext<TokensContextValue | null>(null)

export function TokensProvider({ children }: { children: ReactNode }) {
  const [custom, setCustom] = useState<Token[]>(() => loadCustomTokens())
  const defaults = useMemo(() => buildDefaultTokens(), [])
  const tokens = useMemo(() => [...defaults, ...custom], [defaults, custom])

  const findToken = useCallback(
    (address?: string) => tokens.find((t) => sameAddress(t.address, address)),
    [tokens],
  )

  const addCustomToken = useCallback((token: Omit<Token, 'builtIn'>) => {
    setCustom((current) => {
      if (current.some((t) => sameAddress(t.address, token.address))) return current
      const next = [...current, { ...token, builtIn: false }]
      saveCustomTokens(next)
      return next
    })
  }, [])

  const removeCustomToken = useCallback((address: string) => {
    setCustom((current) => {
      const next = current.filter((t) => !sameAddress(t.address, address))
      saveCustomTokens(next)
      return next
    })
  }, [])

  const value = useMemo(
    () => ({ tokens, findToken, addCustomToken, removeCustomToken }),
    [tokens, findToken, addCustomToken, removeCustomToken],
  )
  return <TokensContext.Provider value={value}>{children}</TokensContext.Provider>
}

export function useTokens(): TokensContextValue {
  const ctx = useContext(TokensContext)
  if (!ctx) throw new Error('useTokens must be used inside TokensProvider')
  return ctx
}

/** Reads name, symbol and decimals straight from an ERC-20 address the user pasted. */
export function useTokenLookup(input: string) {
  const trimmed = input.trim()
  const valid = isAddress(trimmed, { strict: false })
  const address = valid ? getAddress(trimmed) : undefined
  const query = useReadContracts({
    allowFailure: true,
    contracts: address
      ? [
          { address, abi: erc20MetaAbi, functionName: 'name', chainId: DEX_CHAIN_ID },
          { address, abi: erc20MetaAbi, functionName: 'symbol', chainId: DEX_CHAIN_ID },
          { address, abi: erc20MetaAbi, functionName: 'decimals', chainId: DEX_CHAIN_ID },
        ]
      : [],
    query: { enabled: !!address },
  })

  const [nameRes, symbolRes, decimalsRes] = query.data ?? []
  const token: Token | undefined =
    address && symbolRes?.status === 'success' && decimalsRes?.status === 'success'
      ? {
          address,
          symbol: String(symbolRes.result),
          name: nameRes?.status === 'success' ? String(nameRes.result) : String(symbolRes.result),
          decimals: Number(decimalsRes.result),
          builtIn: false,
        }
      : undefined

  return {
    isAddress: valid,
    isLoading: valid && query.isLoading,
    notAToken: valid && !query.isLoading && !token,
    token,
  }
}

/** Resolves a set of token addresses to metadata, reading unknown ones from the chain. */
export function useResolvedTokens(addresses: Address[]): Record<string, Token> {
  const { findToken } = useTokens()
  const unknown = useMemo(() => {
    const seen = new Set<string>()
    return addresses.filter((a) => {
      const key = a.toLowerCase()
      if (seen.has(key) || findToken(a)) return false
      seen.add(key)
      return true
    })
  }, [addresses, findToken])

  const query = useReadContracts({
    allowFailure: true,
    contracts: unknown.flatMap((address) => [
      { address, abi: erc20MetaAbi, functionName: 'name' as const, chainId: DEX_CHAIN_ID },
      { address, abi: erc20MetaAbi, functionName: 'symbol' as const, chainId: DEX_CHAIN_ID },
      { address, abi: erc20MetaAbi, functionName: 'decimals' as const, chainId: DEX_CHAIN_ID },
    ]),
    query: { enabled: unknown.length > 0 },
  })

  return useMemo(() => {
    const map: Record<string, Token> = {}
    for (const address of addresses) {
      const known = findToken(address)
      if (known) map[address.toLowerCase()] = known
    }
    unknown.forEach((address, i) => {
      const name = query.data?.[i * 3]
      const symbol = query.data?.[i * 3 + 1]
      const decimals = query.data?.[i * 3 + 2]
      map[address.toLowerCase()] = {
        address,
        name: name?.status === 'success' ? String(name.result) : 'Unknown token',
        symbol: symbol?.status === 'success' ? String(symbol.result) : 'TOKEN',
        decimals: decimals?.status === 'success' ? Number(decimals.result) : 18,
        builtIn: false,
      }
    })
    return map
  }, [addresses, unknown, query.data, findToken])
}
