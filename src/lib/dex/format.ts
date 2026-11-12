import { formatUnits, parseUnits } from 'viem'

export const shortAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`

/** Keeps only digits and one decimal point, and caps the fraction at `decimals` digits. */
export function sanitizeAmountInput(raw: string, decimals: number): string | null {
  const value = raw.replace(/,/g, '.')
  if (value === '') return ''
  if (!/^\d*\.?\d*$/.test(value)) return null
  const [whole, fraction] = value.split('.')
  if (fraction !== undefined && fraction.length > decimals) return `${whole}.${fraction.slice(0, decimals)}`
  return value
}

/** Parses a user-typed amount in the token's own decimals. Returns undefined for empty or zero input. */
export function parseTokenAmount(value: string, decimals: number): bigint | undefined {
  if (!value || value === '.') return undefined
  try {
    const parsed = parseUnits(value.endsWith('.') ? value.slice(0, -1) : value, decimals)
    return parsed > 0n ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Formats a raw amount for display with grouping and a bounded number of fraction digits. */
export function formatTokenAmount(raw: bigint | undefined, decimals: number, maxFraction = 6): string {
  if (raw === undefined) return '0'
  const plain = formatUnits(raw, decimals)
  const [whole, fraction = ''] = plain.split('.')
  const groupedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  if (raw === 0n) return '0'
  const trimmed = fraction.slice(0, maxFraction).replace(/0+$/, '')
  if (trimmed === '' && fraction.replace(/0+$/, '') !== '') {
    return `<${(10 ** -maxFraction).toFixed(maxFraction)}`
  }
  return trimmed ? `${groupedWhole}.${trimmed}` : groupedWhole
}

/** Full-precision string used when a button writes a balance back into an input. */
export const toInputValue = (raw: bigint, decimals: number) => formatUnits(raw, decimals)

export function formatPercent(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return '0%'
  if (value > 0 && value < 0.01) return '<0.01%'
  return `${value.toFixed(digits)}%`
}

/** Compact number for rates, e.g. 1,234.5678 or 0.000123. */
export function formatRate(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0'
  if (value >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (value >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return value.toLocaleString('en-US', { maximumSignificantDigits: 4 })
}

/** Converts a raw amount to a JS number for ratios only. Never use for balances or transaction amounts. */
export const toNumber = (raw: bigint, decimals: number) => Number(formatUnits(raw, decimals))
