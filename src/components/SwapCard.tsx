import { useMemo, useState } from 'react'
import { ArrowDown, Info } from 'lucide-react'
import { useAccount } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { routerAbi } from '@/lib/dex/abi'
import { DEX_ROUTER, SWAP_FEE_BPS } from '@/lib/dex/config'
import { formatPercent, formatRate, formatTokenAmount, parseTokenAmount, toInputValue, toNumber } from '@/lib/dex/format'
import { sameAddress, type Token } from '@/lib/dex/tokens'
import { useTokenBalances } from '@/hooks/useBalances'
import { useDebounced, useSwapQuote } from '@/hooks/useSwapQuote'
import { useTokens } from '@/hooks/useTokens'
import { deadlineFromNow, useTxFlow } from '@/hooks/useTxFlow'
import { ActionButton } from './ActionButton'
import { AmountField } from './AmountField'
import { SlippageControl } from './SlippageControl'
import { TokenSelectModal } from './TokenSelectModal'
import { TxStatus } from './TxStatus'

const MAX_IMPACT_PERCENT = 30
const WARN_IMPACT_PERCENT = 5

function Row({ label, children, tone }: { label: string; children: React.ReactNode; tone?: 'warn' | 'danger' }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'warn' ? 'var(--warning)' : 'var(--ink-2)'
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span style={{ color: 'var(--subtle)' }}>{label}</span>
      <span className="text-right tabular-nums" style={{ color }}>{children}</span>
    </div>
  )
}

export function SwapCard() {
  const { address } = useAccount()
  const { tokens, findToken } = useTokens()
  // Default pair: the first two listed tokens (USDC and EURC on Arc Testnet).
  const [tokenIn, setTokenIn] = useState<Token | undefined>(() => tokens[0])
  const [tokenOut, setTokenOut] = useState<Token | undefined>(() => tokens[1])
  const [amountIn, setAmountIn] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [picker, setPicker] = useState<'in' | 'out' | null>(null)
  const flow = useTxFlow()

  const parsedIn = useMemo(() => (tokenIn ? parseTokenAmount(amountIn, tokenIn.decimals) : undefined), [amountIn, tokenIn])
  const debouncedIn = useDebounced(parsedIn)
  const settled = debouncedIn === parsedIn

  const { quote, isLoading: quoting, noRoute } = useSwapQuote(tokenIn, tokenOut, debouncedIn, tokens)
  const { balances } = useTokenBalances(useMemo(() => [tokenIn, tokenOut].filter((t): t is Token => !!t), [tokenIn, tokenOut]))

  const balanceIn = tokenIn ? balances[tokenIn.address.toLowerCase()] : undefined
  const balanceOut = tokenOut ? balances[tokenOut.address.toLowerCase()] : undefined

  const amountOut = settled ? quote?.amountOut : undefined
  const minReceived = amountOut !== undefined ? (amountOut * BigInt(10_000 - slippageBps)) / 10_000n : undefined
  const hops = quote ? quote.path.length - 1 : 0
  const impact = settled && quote ? quote.priceImpact : 0
  const impactTone = impact >= WARN_IMPACT_PERCENT ? (impact >= 15 ? 'danger' : 'warn') : undefined

  const rate = useMemo(() => {
    if (!tokenIn || !tokenOut || !parsedIn || amountOut === undefined) return undefined
    const inN = toNumber(parsedIn, tokenIn.decimals)
    return inN > 0 ? toNumber(amountOut, tokenOut.decimals) / inN : undefined
  }, [tokenIn, tokenOut, parsedIn, amountOut])

  const routeSymbols = quote ? quote.path.map((a) => findToken(a)?.symbol ?? 'TOKEN').join(' > ') : ''

  let disabledLabel: string | undefined
  if (!tokenIn || !tokenOut) disabledLabel = 'Select a token'
  else if (!parsedIn) disabledLabel = 'Enter an amount'
  else if (balanceIn !== undefined && parsedIn > balanceIn) disabledLabel = `Insufficient ${tokenIn.symbol} balance`
  else if (!settled || quoting) disabledLabel = 'Finding best route...'
  else if (noRoute || !quote) disabledLabel = 'No route. Add liquidity first'
  else if (impact >= MAX_IMPACT_PERCENT) disabledLabel = 'Price impact too high'

  const flip = () => {
    setTokenIn(tokenOut)
    setTokenOut(tokenIn)
    setAmountIn(amountOut !== undefined && tokenOut ? toInputValue(amountOut, tokenOut.decimals) : '')
    flow.reset()
  }

  const onSwap = async () => {
    if (!tokenIn || !parsedIn || !quote || minReceived === undefined || !address || !DEX_ROUTER) return
    const router = DEX_ROUTER
    const path = quote.path
    const ok = await flow.execute({
      approvals: [{ token: tokenIn.address, spender: router, amount: parsedIn, symbol: tokenIn.symbol }],
      buildCall: () => ({
        to: router,
        data: encodeFunctionData({
          abi: routerAbi,
          functionName: 'swapExactTokensForTokens',
          args: [parsedIn, minReceived, path, address, deadlineFromNow()],
        }),
      }),
      successMessage: 'Swap confirmed',
    })
    if (ok) setAmountIn('')
  }

  const selectToken = (side: 'in' | 'out', token: Token) => {
    const other = side === 'in' ? tokenOut : tokenIn
    if (sameAddress(other?.address, token.address)) {
      // Picking the token from the other side swaps the two sides.
      if (side === 'in') setTokenOut(tokenIn)
      else setTokenIn(tokenOut)
    }
    if (side === 'in') setTokenIn(token)
    else setTokenOut(token)
    flow.reset()
  }

  return (
    <section className="card w-full max-w-[480px] rounded-3xl p-4 sm:p-5" aria-label="Swap">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="display text-xl font-semibold">Swap</h1>
        <SlippageControl valueBps={slippageBps} onChange={setSlippageBps} />
      </div>

      <div className="relative flex flex-col gap-1.5">
        <AmountField
          label="You pay"
          token={tokenIn}
          value={amountIn}
          onChange={(v) => {
            setAmountIn(v)
            if (flow.phase !== 'idle') flow.reset()
          }}
          onTokenClick={() => setPicker('in')}
          balance={balanceIn}
          showMax
        />
        <div className="relative z-10 -my-4 flex justify-center">
          <button
            type="button"
            onClick={flip}
            aria-label="Flip tokens"
            className="flex size-11 items-center justify-center rounded-xl transition-transform hover:rotate-180"
            style={{ background: 'var(--surface-muted)', border: '4px solid var(--bg)', color: 'var(--accent)' }}
          >
            <ArrowDown className="size-4" />
          </button>
        </div>
        <AmountField
          label="You receive"
          token={tokenOut}
          value={amountOut !== undefined && tokenOut ? toInputValue(amountOut, tokenOut.decimals) : ''}
          onTokenClick={() => setPicker('out')}
          balance={balanceOut}
          readOnly
          loading={!!parsedIn && (!settled || quoting)}
        />
      </div>

      {tokenIn && tokenOut && quote && amountOut !== undefined && minReceived !== undefined && (
        <div className="inner mt-3 flex flex-col gap-2 rounded-2xl p-3.5">
          {rate !== undefined && (
            <Row label="Rate">
              1 {tokenIn.symbol} = {formatRate(rate)} {tokenOut.symbol}
            </Row>
          )}
          <Row label="Price impact" tone={impactTone}>{formatPercent(impact)}</Row>
          <Row label="Minimum received">
            {formatTokenAmount(minReceived, tokenOut.decimals, 6)} {tokenOut.symbol}
          </Row>
          <Row label="Pool fee">{formatPercent((SWAP_FEE_BPS * hops) / 100)}{hops > 1 ? ` (${hops} pools)` : ''}</Row>
          <Row label="Route">{routeSymbols}</Row>
        </div>
      )}

      {impact >= WARN_IMPACT_PERCENT && settled && quote && (
        <div className="mt-3 flex items-start gap-2 rounded-2xl px-3.5 py-3 text-sm" style={{ background: 'rgba(240,198,116,0.12)', color: 'var(--warning)' }}>
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>This trade moves the pool price by {formatPercent(impact, 1)}. You may get a much worse rate than the market.</span>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        <ActionButton
          label="Swap"
          onClick={onSwap}
          disabled={!!disabledLabel}
          disabledLabel={disabledLabel}
          busy={flow.busy}
          busyLabel={flow.stepLabel || 'Working...'}
          variant={impact >= 15 ? 'danger' : 'primary'}
        />
        <TxStatus phase={flow.phase} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} successText="Swap confirmed" />
      </div>

      <TokenSelectModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={(token) => picker && selectToken(picker, token)}
        disabledToken={picker === 'in' ? tokenOut : tokenIn}
      />
    </section>
  )
}
