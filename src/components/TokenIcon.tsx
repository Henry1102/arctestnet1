import { TokenBTC, TokenETH, TokenEURC, TokenUSDC } from '@web3icons/react'
import type { Token } from '@/lib/dex/tokens'

interface TokenIconProps {
  token?: Pick<Token, 'symbol'>
  size?: number
}

function renderBrandIcon(symbol: string, size: number) {
  switch (symbol.toUpperCase()) {
    case 'USDC':
      return <TokenUSDC variant="branded" size={size} />
    case 'EURC':
      return <TokenEURC variant="branded" size={size} />
    case 'TWETH':
      return <TokenETH variant="branded" size={size} />
    case 'TWBTC':
      return <TokenBTC variant="branded" size={size} />
    default:
      return null
  }
}

export function TokenIcon({ token, size = 28 }: TokenIconProps) {
  const branded = token ? renderBrandIcon(token.symbol, size) : null
  if (branded) return branded
  const initials = (token?.symbol ?? '?').slice(0, 2).toUpperCase()
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
      style={{ width: size, height: size, background: 'var(--surface-muted)', color: 'var(--accent)', border: '1px solid var(--border)' }}
    >
      {initials}
    </span>
  )
}

export function TokenPairIcons({ a, b, size = 28 }: { a?: Pick<Token, 'symbol'>; b?: Pick<Token, 'symbol'>; size?: number }) {
  return (
    <span className="flex items-center">
      <TokenIcon token={a} size={size} />
      <span className="-ml-2.5 rounded-full" style={{ boxShadow: '0 0 0 2px var(--bg)' }}>
        <TokenIcon token={b} size={size} />
      </span>
    </span>
  )
}
