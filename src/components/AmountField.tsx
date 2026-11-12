import { ChevronDown } from 'lucide-react'
import { formatTokenAmount, sanitizeAmountInput, toInputValue } from '@/lib/dex/format'
import type { Token } from '@/lib/dex/tokens'
import { TokenIcon } from './TokenIcon'

interface AmountFieldProps {
  label: string
  token?: Token
  value: string
  onChange?: (value: string) => void
  onTokenClick?: () => void
  /** Raw token balance of the connected wallet, when known. */
  balance?: bigint
  readOnly?: boolean
  loading?: boolean
  showMax?: boolean
  /** Locks the token chip (used when the token is fixed by an existing pool). */
  tokenLocked?: boolean
  hint?: string
}

export function AmountField({ label, token, value, onChange, onTokenClick, balance, readOnly, loading, showMax, tokenLocked, hint }: AmountFieldProps) {
  const decimals = token?.decimals ?? 18
  return (
    <div className="inner rounded-2xl p-4">
      <div className="mb-2 flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
        <span className="font-medium uppercase" style={{ letterSpacing: '0.08em' }}>{label}</span>
        {token && balance !== undefined ? (
          <button
            type="button"
            disabled={!showMax || readOnly}
            onClick={() => onChange?.(toInputValue(balance, decimals))}
            className="min-h-[28px] tabular-nums disabled:cursor-default"
            style={{ color: showMax && !readOnly ? 'var(--accent)' : 'var(--subtle)' }}
          >
            Balance: {formatTokenAmount(balance, decimals, 4)}
            {showMax && !readOnly && <span className="ml-1 font-semibold">Max</span>}
          </button>
        ) : (
          hint && <span>{hint}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <input
          inputMode="decimal"
          aria-label={`${label} amount`}
          value={loading ? '' : value}
          readOnly={readOnly}
          placeholder={loading ? '...' : '0.0'}
          onChange={(event) => {
            const next = sanitizeAmountInput(event.target.value, decimals)
            if (next !== null) onChange?.(next)
          }}
          className="display min-w-0 flex-1 bg-transparent text-3xl font-semibold tabular-nums outline-none sm:text-4xl"
          style={{ color: 'var(--ink)' }}
        />
        <button
          type="button"
          onClick={onTokenClick}
          disabled={tokenLocked || !onTokenClick}
          className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full py-1.5 pl-2 text-sm font-semibold transition-colors disabled:cursor-default ${token ? 'btn-ghost pr-3' : 'btn-primary pr-3'}`}
        >
          {token ? <TokenIcon token={token} size={24} /> : null}
          <span>{token ? token.symbol : 'Select token'}</span>
          {!tokenLocked && onTokenClick && <ChevronDown className="size-4" aria-hidden />}
        </button>
      </div>
    </div>
  )
}
