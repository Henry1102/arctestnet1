import { useState } from 'react'
import { useAccount } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { routerAbi } from '@/lib/dex/abi'
import { DEX_ROUTER } from '@/lib/dex/config'
import { formatPercent, formatTokenAmount } from '@/lib/dex/format'
import type { Pool } from '@/hooks/usePools'
import { deadlineFromNow, useTxFlow } from '@/hooks/useTxFlow'
import { ActionButton } from './ActionButton'
import { SlippageControl } from './SlippageControl'
import { TokenIcon } from './TokenIcon'
import { TxStatus } from './TxStatus'

const CHIPS = [25, 50, 75, 100]

export function RemoveLiquidityForm({ pool, onDone }: { pool: Pool; onDone?: () => void }) {
  const { address } = useAccount()
  const [percent, setPercent] = useState(50)
  const [slippageBps, setSlippageBps] = useState(50)
  const flow = useTxFlow()

  const liquidity = percent === 100 ? pool.lpBalance : (pool.lpBalance * BigInt(percent)) / 100n
  const out0 = pool.totalSupply > 0n ? (liquidity * pool.reserve0) / pool.totalSupply : 0n
  const out1 = pool.totalSupply > 0n ? (liquidity * pool.reserve1) / pool.totalSupply : 0n
  const sharePct = pool.totalSupply > 0n ? (Number(pool.lpBalance) / Number(pool.totalSupply)) * 100 : 0

  const submit = async () => {
    if (!address || !DEX_ROUTER || liquidity === 0n) return
    const router = DEX_ROUTER
    const keep = BigInt(10_000 - slippageBps)
    const ok = await flow.execute({
      approvals: [{ token: pool.pair, spender: router, amount: liquidity, symbol: 'LP token' }],
      buildCall: () => ({
        to: router,
        data: encodeFunctionData({
          abi: routerAbi,
          functionName: 'removeLiquidity',
          args: [pool.token0.address, pool.token1.address, liquidity, (out0 * keep) / 10_000n, (out1 * keep) / 10_000n, address, deadlineFromNow()],
        }),
      }),
      successMessage: 'Liquidity removed',
    })
    if (ok) onDone?.()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="inner rounded-2xl p-4">
        <div className="mb-1 flex items-center justify-between text-xs" style={{ color: 'var(--subtle)' }}>
          <span className="font-medium uppercase" style={{ letterSpacing: '0.08em' }}>Amount to remove</span>
          <SlippageControl valueBps={slippageBps} onChange={setSlippageBps} />
        </div>
        <div className="display text-5xl font-semibold tabular-nums">{percent}%</div>
        <input
          type="range"
          min={1}
          max={100}
          value={percent}
          onChange={(event) => {
            setPercent(Number(event.target.value))
            flow.reset()
          }}
          aria-label="Percent of your position to remove"
          className="mt-3 w-full accent-[#acc6e9]"
        />
        <div className="mt-3 grid grid-cols-4 gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setPercent(chip)
                flow.reset()
              }}
              className={`min-h-[40px] rounded-xl text-sm font-semibold ${percent === chip ? 'btn-primary' : 'btn-ghost'}`}
            >
              {chip === 100 ? 'Max' : `${chip}%`}
            </button>
          ))}
        </div>
      </div>

      <div className="inner flex flex-col gap-3 rounded-2xl p-4">
        <div className="text-xs font-medium uppercase" style={{ color: 'var(--subtle)', letterSpacing: '0.08em' }}>You receive</div>
        {[
          { token: pool.token0, amount: out0 },
          { token: pool.token1, amount: out1 },
        ].map(({ token, amount }) => (
          <div key={token.address} className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold">
              <TokenIcon token={token} size={24} /> {token.symbol}
            </span>
            <span className="display text-xl tabular-nums">{formatTokenAmount(amount, token.decimals, 6)}</span>
          </div>
        ))}
        <div className="flex justify-between border-t pt-3 text-xs" style={{ borderColor: 'var(--border)', color: 'var(--subtle)' }}>
          <span>Your pool share</span>
          <span className="tabular-nums">{formatPercent(sharePct)}</span>
        </div>
      </div>

      <ActionButton
        label="Remove liquidity"
        onClick={submit}
        disabled={liquidity === 0n}
        disabledLabel="Nothing to remove"
        busy={flow.busy}
        busyLabel={flow.stepLabel || 'Working...'}
      />
      <TxStatus phase={flow.phase} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} successText="Liquidity removed" />
    </div>
  )
}
