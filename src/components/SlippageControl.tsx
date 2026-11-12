import { useState } from 'react'
import { Settings2 } from 'lucide-react'

interface SlippageControlProps {
  /** Slippage tolerance in basis points (50 = 0.5%). */
  valueBps: number
  onChange: (bps: number) => void
}

const PRESETS = [10, 50, 100]
const MAX_BPS = 5000

export function SlippageControl({ valueBps, onChange }: SlippageControlProps) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const isPreset = PRESETS.includes(valueBps)

  const applyCustom = (raw: string) => {
    const cleaned = raw.replace(/[^0-9.]/g, '')
    setCustom(cleaned)
    const pct = Number(cleaned)
    if (cleaned !== '' && Number.isFinite(pct) && pct > 0) {
      onChange(Math.min(MAX_BPS, Math.round(pct * 100)))
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Slippage settings"
        className="btn-ghost flex min-h-[44px] items-center gap-1.5 rounded-full px-3 text-xs font-semibold tabular-nums"
      >
        <Settings2 className="size-4" aria-hidden />
        {(valueBps / 100).toFixed(valueBps % 100 === 0 ? 0 : 2)}%
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-20 mt-2 w-72 rounded-2xl p-4" style={{ background: 'rgba(18,45,69,0.98)' }}>
          <div className="mb-2 text-sm font-semibold">Slippage tolerance</div>
          <p className="mb-3 text-xs" style={{ color: 'var(--subtle)' }}>
            Your swap reverts if the price moves against you by more than this.
          </p>
          <div className="flex items-center gap-2">
            {PRESETS.map((bps) => (
              <button
                key={bps}
                type="button"
                onClick={() => {
                  setCustom('')
                  onChange(bps)
                }}
                className={`min-h-[40px] flex-1 rounded-xl text-sm font-semibold tabular-nums ${valueBps === bps ? 'btn-primary' : 'btn-ghost'}`}
              >
                {bps / 100}%
              </button>
            ))}
            <label className="inner flex min-h-[40px] w-20 items-center gap-1 rounded-xl px-2">
              <input
                inputMode="decimal"
                aria-label="Custom slippage percent"
                value={isPreset && custom === '' ? '' : custom || String(valueBps / 100)}
                onChange={(event) => applyCustom(event.target.value)}
                placeholder="Custom"
                className="w-full bg-transparent text-right text-sm tabular-nums outline-none"
              />
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>%</span>
            </label>
          </div>
          {valueBps > 500 && (
            <p className="mt-3 text-xs" style={{ color: 'var(--warning)' }}>
              High slippage can let others trade against you at a worse price.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
