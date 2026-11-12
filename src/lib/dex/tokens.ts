import { isAddress, type Address } from 'viem'
import { TOKEN_ADDRESSES, USDC_FACT } from './config'

export interface Token {
  address: Address
  symbol: string
  name: string
  decimals: number
  /** True for tokens that ship with the app; false for tokens the user imported by address. */
  builtIn: boolean
}

export function buildDefaultTokens(): Token[] {
  const list: Token[] = []
  if (USDC_FACT) {
    list.push({
      address: USDC_FACT.address as Address,
      symbol: USDC_FACT.symbol,
      name: 'USD Coin',
      decimals: USDC_FACT.decimals,
      builtIn: true,
    })
  }
  if (TOKEN_ADDRESSES.EURC) {
    list.push({ address: TOKEN_ADDRESSES.EURC, symbol: 'EURC', name: 'Euro Coin', decimals: 6, builtIn: true })
  }
  if (TOKEN_ADDRESSES.tWETH) {
    list.push({ address: TOKEN_ADDRESSES.tWETH, symbol: 'tWETH', name: 'Test Wrapped Ether', decimals: 18, builtIn: true })
  }
  if (TOKEN_ADDRESSES.tWBTC) {
    list.push({ address: TOKEN_ADDRESSES.tWBTC, symbol: 'tWBTC', name: 'Test Wrapped Bitcoin', decimals: 8, builtIn: true })
  }
  return list
}

export const sameAddress = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase()

function isStoredToken(value: unknown): value is Token {
  if (typeof value !== 'object' || value === null) return false
  const t = value as Record<string, unknown>
  return (
    typeof t.address === 'string' &&
    isAddress(t.address, { strict: false }) &&
    typeof t.symbol === 'string' &&
    typeof t.name === 'string' &&
    typeof t.decimals === 'number' &&
    Number.isInteger(t.decimals) &&
    t.decimals >= 0 &&
    t.decimals <= 36
  )
}

const STORAGE_KEY = 'arc-dex:custom-tokens:v1'

export function loadCustomTokens(): Token[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return (parsed as unknown[]).filter(isStoredToken).map((t) => ({ ...t, builtIn: false }))
  } catch {
    return []
  }
}

export function saveCustomTokens(tokens: Token[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens.filter((t) => !t.builtIn)))
  } catch {
    // Storage can be unavailable (private mode). The token list still works for this session.
  }
}
