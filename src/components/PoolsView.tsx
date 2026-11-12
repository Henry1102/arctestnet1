import { useMemo, useState } from 'react'
import { Droplets, Plus, RefreshCw } from 'lucide-react'
import { useAccount } from 'wagmi'
import { usePools, type Pool } from '@/hooks/usePools'
import { formatPercent, formatRate, formatTokenAmount, toNumber } from '@/lib/dex/format'
import { buildAddressExplorerUrl } from '@/onchain-facts'
import { DEX_CHAIN_ID } from '@/lib/dex/config'
import { LiquidityModal, type LiquidityTarget } from './LiquidityModal'
import { TokenPairIcons } from './TokenIcon'

function PoolRow({ pool, onAction }: { pool: Pool; onAction: (target: LiquidityTarget) => void }) {
  const hasPosition = pool.lpBalance > 0n
  const share = pool.totalSupply > 0n ? (Number(pool.lpBalance) / Number(pool.totalSupply)) * 100 : 0
  const price =
    pool.reserve0 > 0n ? toNumber(pool.reserve1, pool.token1.decimals) / toNumber(pool.reserve0, pool.token0.decimals) : undefined

  return (
    <li className="card rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <TokenPairIcons a={pool.token0} b={pool.token1} size={32} />
          <div>
            <a
              href={buildAddressExplorerUrl(DEX_CHAIN_ID, pool.pair)}
              target="_blank"
              rel="noopener noreferrer"
              className="display text-lg font-semibold hover:underline"
            >
              {pool.token0.symbol} / {pool.token1.symbol}
            </a>
            <div className="text-xs" style={{ color: 'var(--subtle)' }}>0.30% fee</div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction({ mode: 'add', pool })}
            className="btn-primary min-h-[44px] rounded-xl px-4 text-sm font-semibold"
          >
            Add
          </button>
          {hasPosition && (
            <button
              type="button"
              onClick={() => onAction({ mode: 'remove', pool })}
              className="btn-ghost min-h-[44px] rounded-xl px-4 text-sm font-semibold"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div className="inner rounded-2xl p-3">
          <dt className="text-xs" style={{ color: 'var(--subtle)' }}>Pooled {pool.token0.symbol}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{formatTokenAmount(pool.reserve0, pool.token0.decimals, 4)}</dd>
        </div>
        <div className="inner rounded-2xl p-3">
          <dt className="text-xs" style={{ color: 'var(--subtle)' }}>Pooled {pool.token1.symbol}</dt>
          <dd className="mt-1 font-semibold tabular-nums">{formatTokenAmount(pool.reserve1, pool.token1.decimals, 4)}</dd>
        </div>
        <div className="inner col-span-2 rounded-2xl p-3 sm:col-span-1">
          <dt className="text-xs" style={{ color: 'var(--subtle)' }}>Price</dt>
          <dd className="mt-1 font-semibold tabular-nums">
            {price !== undefined ? `1 ${pool.token0.symbol} = ${formatRate(price)} ${pool.token1.symbol}` : 'No liquidity'}
          </dd>
        </div>
      </dl>

      {hasPosition && (
        <div className="mt-3 flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: 'var(--surface-strong)' }}>
          <span style={{ color: 'var(--muted)' }}>Your position</span>
          <span className="tabular-nums">
            {formatTokenAmount((pool.reserve0 * pool.lpBalance) / pool.totalSupply, pool.token0.decimals, 4)} {pool.token0.symbol}
            {' + '}
            {formatTokenAmount((pool.reserve1 * pool.lpBalance) / pool.totalSupply, pool.token1.decimals, 4)} {pool.token1.symbol}
            <span className="ml-2" style={{ color: 'var(--subtle)' }}>({formatPercent(share)})</span>
          </span>
        </div>
      )}
    </li>
  )
}

export function PoolsView() {
  const { isConnected } = useAccount()
  const { pools, isLoading, isError } = usePools()
  const [onlyMine, setOnlyMine] = useState(false)
  const [target, setTarget] = useState<LiquidityTarget | null>(null)

  const visible = useMemo(() => (onlyMine ? pools.filter((p) => p.lpBalance > 0n) : pools), [pools, onlyMine])

  return (
    <section className="w-full max-w-3xl" aria-label="Liquidity pools">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="display text-2xl font-semibold">Pools</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--subtle)' }}>
            Supply two tokens to a pool and earn 0.30% of every swap that uses it.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setTarget({ mode: 'add' })}
          className="btn-primary flex min-h-[48px] items-center gap-2 rounded-2xl px-5 text-sm font-semibold"
        >
          <Plus className="size-4" aria-hidden /> New pool
        </button>
      </div>

      <div className="mb-4 inline-grid grid-cols-2 gap-1 rounded-2xl p-1" style={{ background: 'var(--surface)' }} role="tablist" aria-label="Pool filter">
        {[
          { id: false, label: 'All pools' },
          { id: true, label: 'My positions' },
        ].map((tab) => (
          <button
            key={tab.label}
            type="button"
            role="tab"
            aria-selected={onlyMine === tab.id}
            onClick={() => setOnlyMine(tab.id)}
            className={`min-h-[40px] rounded-xl px-4 text-sm font-semibold ${onlyMine === tab.id ? 'btn-primary' : ''}`}
            style={onlyMine === tab.id ? undefined : { color: 'var(--muted)' }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <ul className="flex flex-col gap-3" aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className="card h-40 animate-pulse rounded-3xl" />
          ))}
        </ul>
      ) : isError ? (
        <div className="card flex flex-col items-center gap-3 rounded-3xl p-8 text-center">
          <RefreshCw className="size-6" style={{ color: 'var(--danger)' }} aria-hidden />
          <p className="text-sm">Could not read pools from Arc Testnet. Check your connection and refresh.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 rounded-3xl p-10 text-center">
          <Droplets className="size-8" style={{ color: 'var(--accent)' }} aria-hidden />
          <h2 className="display text-lg font-semibold">
            {onlyMine ? (isConnected ? 'No positions yet' : 'Connect a wallet to see your positions') : 'No pools yet'}
          </h2>
          <p className="max-w-sm text-sm" style={{ color: 'var(--subtle)' }}>
            {onlyMine
              ? 'Add liquidity to a pool and your position appears here.'
              : 'Create the first pool by depositing two tokens. Your deposit sets the starting price.'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((pool) => (
            <PoolRow key={pool.pair} pool={pool} onAction={setTarget} />
          ))}
        </ul>
      )}

      <LiquidityModal target={target} onClose={() => setTarget(null)} />
    </section>
  )
}
