import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Loader2, Search, Trash2, X } from 'lucide-react'
import { useTokenBalances } from '@/hooks/useBalances'
import { useTokenLookup, useTokens } from '@/hooks/useTokens'
import { formatTokenAmount, shortAddress } from '@/lib/dex/format'
import { sameAddress, type Token } from '@/lib/dex/tokens'
import { TokenIcon } from './TokenIcon'

interface TokenSelectModalProps {
  open: boolean
  onClose: () => void
  onSelect: (token: Token) => void
  /** Token already chosen on the other side; it is shown but cannot be picked. */
  disabledToken?: Token
}

/** Body mounts only while the dialog is open, so the search box and balance reads reset on every open. */
function TokenSelectBody({ onClose, onSelect, disabledToken }: Omit<TokenSelectModalProps, 'open'>) {
  const { tokens, addCustomToken, removeCustomToken } = useTokens()
  const [query, setQuery] = useState('')
  const lookup = useTokenLookup(query)
  const { balances } = useTokenBalances(tokens)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return tokens
    return tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || sameAddress(t.address, q))
  }, [tokens, query])

  const importable = lookup.token && !tokens.some((t) => sameAddress(t.address, lookup.token?.address)) ? lookup.token : undefined

  const pick = (token: Token) => {
    onSelect(token)
    onClose()
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <h2 className="display text-lg font-semibold">Select a token</h2>
              <button type="button" onClick={onClose} aria-label="Close" className="flex size-10 items-center justify-center rounded-full btn-ghost">
                <X className="size-4" />
              </button>
            </div>

            <div className="px-5 pb-3">
              <label className="inner flex items-center gap-2 rounded-2xl px-3.5 py-3">
                <Search className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} aria-hidden />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search name or paste token address"
                  className="w-full bg-transparent text-sm outline-none"
                  autoFocus
                  spellCheck={false}
                />
              </label>
            </div>

            <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              {importable && (
                <li className="mx-3 mb-2 rounded-2xl p-3" style={{ background: 'var(--surface-strong)' }}>
                  <div className="flex items-center gap-3">
                    <TokenIcon token={importable} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{importable.symbol}</div>
                      <div className="truncate text-xs" style={{ color: 'var(--subtle)' }}>
                        {importable.name} · {shortAddress(importable.address)}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-primary min-h-[44px] rounded-xl px-4 text-sm font-semibold"
                      onClick={() => {
                        addCustomToken(importable)
                        pick(importable)
                      }}
                    >
                      Import
                    </button>
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--warning)' }}>
                    Anyone can create a token with any name. Check the address before you trade it.
                  </p>
                </li>
              )}
              {lookup.isLoading && (
                <li className="flex items-center justify-center gap-2 py-6 text-sm" style={{ color: 'var(--subtle)' }}>
                  <Loader2 className="size-4 animate-spin" aria-hidden /> Reading token from Arc...
                </li>
              )}
              {lookup.notAToken && (
                <li className="px-5 py-4 text-sm" style={{ color: 'var(--danger)' }}>
                  That address is not an ERC-20 token on Arc Testnet.
                </li>
              )}
              {filtered.map((token) => {
                const isDisabled = sameAddress(token.address, disabledToken?.address)
                const balance = balances[token.address.toLowerCase()]
                return (
                  <li key={token.address} className="flex items-center">
                    <button
                      type="button"
                      disabled={isDisabled}
                      onClick={() => pick(token)}
                      className="flex min-h-[56px] flex-1 items-center gap-3 rounded-2xl px-3 text-left transition-colors hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <TokenIcon token={token} size={32} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{token.symbol}</span>
                        <span className="block truncate text-xs" style={{ color: 'var(--subtle)' }}>{token.name}</span>
                      </span>
                      <span className="text-sm tabular-nums" style={{ color: 'var(--muted)' }}>
                        {balance !== undefined ? formatTokenAmount(balance, token.decimals, 4) : ''}
                      </span>
                    </button>
                    {!token.builtIn && (
                      <button
                        type="button"
                        aria-label={`Remove ${token.symbol} from list`}
                        onClick={() => removeCustomToken(token.address)}
                        className="mr-1 flex size-10 items-center justify-center rounded-full hover:bg-white/5"
                        style={{ color: 'var(--subtle)' }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </li>
                )
              })}
              {filtered.length === 0 && !importable && !lookup.isLoading && !lookup.notAToken && (
                <li className="px-5 py-6 text-center text-sm" style={{ color: 'var(--subtle)' }}>No tokens match your search.</li>
              )}
            </ul>
    </>
  )
}

export function TokenSelectModal({ open, onClose, onSelect, disabledToken }: TokenSelectModalProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Select a token"
            className="card relative flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
            style={{ background: 'rgba(18,45,69,0.96)' }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
          >
            <TokenSelectBody onClose={onClose} onSelect={onSelect} disabledToken={disabledToken} />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
