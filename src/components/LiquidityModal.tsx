import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { Pool } from '@/hooks/usePools'
import { AddLiquidityForm } from './AddLiquidityForm'
import { RemoveLiquidityForm } from './RemoveLiquidityForm'

export interface LiquidityTarget {
  mode: 'add' | 'remove'
  /** Absent when creating a brand-new pool from scratch. */
  pool?: Pool
}

interface LiquidityModalProps {
  target: LiquidityTarget | null
  onClose: () => void
}

/** Mounts only while the dialog is open, so the tab and form fields reset on every open. */
function LiquidityContent({ target, onClose }: { target: LiquidityTarget; onClose: () => void }) {
  const [mode, setMode] = useState<'add' | 'remove'>(target.mode)
  const pool = target.pool
  const canRemove = !!pool && pool.lpBalance > 0n
  const title = !pool ? 'New pool' : `${pool.token0.symbol} / ${pool.token1.symbol}`

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="display text-lg font-semibold">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="btn-ghost flex size-10 items-center justify-center rounded-full">
          <X className="size-4" />
        </button>
      </div>

      {canRemove && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: 'rgba(13,27,47,0.55)' }} role="tablist">
          {(['add', 'remove'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`min-h-[40px] rounded-xl text-sm font-semibold capitalize ${mode === m ? 'btn-primary' : ''}`}
              style={mode === m ? undefined : { color: 'var(--muted)' }}
            >
              {m}
            </button>
          ))}
        </div>
      )}

      {mode === 'remove' && pool && canRemove ? (
        <RemoveLiquidityForm pool={pool} />
      ) : (
        <AddLiquidityForm initialA={pool?.token0} initialB={pool?.token1} lockTokens={!!pool} />
      )}
    </>
  )
}

export function LiquidityModal({ target, onClose }: LiquidityModalProps) {
  useEffect(() => {
    if (!target) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, onClose])

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          className="fixed inset-0 z-40 flex items-end justify-center sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label="Liquidity"
            className="card relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl"
            style={{ background: 'rgba(18,45,69,0.96)' }}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            onClick={(event) => event.stopPropagation()}
          >
            <LiquidityContent target={target} onClose={onClose} />
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
