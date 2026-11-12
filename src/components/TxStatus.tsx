import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { DEX_CHAIN_ID } from '@/lib/dex/config'
import type { TxPhase } from '@/hooks/useTxFlow'

interface TxStatusProps {
  phase: TxPhase
  stepLabel: string
  hash?: string
  error?: string
  successText: string
}

/** Inline result for the last transaction. Only renders states backed by a wallet or receipt result. */
export function TxStatus({ phase, stepLabel, hash, error, successText }: TxStatusProps) {
  if (phase === 'error' && error) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-2xl px-3.5 py-3 text-sm" style={{ background: 'rgba(232,109,122,0.12)', color: 'var(--danger)' }}>
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{error}</span>
      </div>
    )
  }
  if (phase === 'wallet' || phase === 'confirming') {
    return (
      <p className="text-center text-xs" style={{ color: 'var(--subtle)' }} aria-live="polite">
        {phase === 'wallet' ? `${stepLabel}...` : 'Waiting for confirmation on Arc...'}
      </p>
    )
  }
  if (phase === 'success' && hash) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 text-sm" style={{ background: 'rgba(141,216,159,0.12)', color: 'var(--success)' }}>
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-4" aria-hidden />
          {successText}
        </span>
        <a
          href={buildTxExplorerUrl(DEX_CHAIN_ID, hash)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline"
        >
          View on ArcScan <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>
    )
  }
  return null
}
