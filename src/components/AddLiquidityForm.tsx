import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { useAccount } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { routerAbi } from '@/lib/dex/abi'
import { DEX_ROUTER } from '@/lib/dex/config'
import { formatPercent, formatRate, parseTokenAmount, toInputValue, toNumber } from '@/lib/dex/format'
import { sameAddress, type Token } from '@/lib/dex/tokens'
import { useTokenBalances } from '@/hooks/useBalances'
import { usePairState } from '@/hooks/usePairState'
import { deadlineFromNow, useTxFlow } from '@/hooks/useTxFlow'
import { useTokens } from '@/hooks/useTokens'
import { ActionButton } from './ActionButton'
import { AmountField } from './AmountField'
import { SlippageControl } from './SlippageControl'
import { TokenSelectModal } from './TokenSelectModal'
import { TxStatus } from './TxStatus'

interface AddLiquidityFormProps {
  initialA?: Token
  initialB?: Token
  /** Locks both tokens when adding to an existing pool from the list. */
  lockTokens?: boolean
  onDone?: () => void
}

export function AddLiquidityForm({ initialA, initialB, lockTokens, onDone }: AddLiquidityFormProps) {
  const { address } = useAccount()
  const { tokens } = useTokens()
  const [tokenA, setTokenA] = useState<Token | undefined>(initialA ?? tokens[0])
  const [tokenB, setTokenB] = useState<Token | undefined>(initialB)
  const [amountA, setAmountA] = useState('')
  const [amountB, setAmountB] = useState('')
  const [slippageBps, setSlippageBps] = useState(50)
  const [picker, setPicker] = useState<'A' | 'B' | null>(null)
  const flow = useTxFlow()

  const state = usePairState(tokenA, tokenB)
  const { balances } = useTokenBalances(useMemo(() => [tokenA, tokenB].filter((t): t is Token => !!t), [tokenA, tokenB]))
  const balanceA = tokenA ? balances[tokenA.address.toLowerCase()] : undefined
  const balanceB = tokenB ? balances[tokenB.address.toLowerCase()] : undefined

  const parsedA = tokenA ? parseTokenAmount(amountA, tokenA.decimals) : undefined
  const parsedB = tokenB ? parseTokenAmount(amountB, tokenB.decimals) : undefined

  // In an existing pool the two amounts must keep the pool ratio, so editing one fills the other.
  const editA = (value: string) => {
    setAmountA(value)
    flow.reset()
    if (!state.isNew && tokenA && tokenB) {
      const raw = parseTokenAmount(value, tokenA.decimals)
      setAmountB(raw && state.reserveA > 0n ? toInputValue((raw * state.reserveB) / state.reserveA, tokenB.decimals) : '')
    }
  }
  const editB = (value: string) => {
    setAmountB(value)
    flow.reset()
    if (!state.isNew && tokenA && tokenB) {
      const raw = parseTokenAmount(value, tokenB.decimals)
      setAmountA(raw && state.reserveB > 0n ? toInputValue((raw * state.reserveA) / state.reserveB, tokenA.decimals) : '')
    }
  }

  const price = useMemo(() => {
    if (!tokenA || !tokenB) return undefined
    if (!state.isNew && state.reserveA > 0n) {
      return toNumber(state.reserveB, tokenB.decimals) / toNumber(state.reserveA, tokenA.decimals)
    }
    if (parsedA && parsedB) return toNumber(parsedB, tokenB.decimals) / toNumber(parsedA, tokenA.decimals)
    return undefined
  }, [tokenA, tokenB, state.isNew, state.reserveA, state.reserveB, parsedA, parsedB])

  const shareOfPool = useMemo(() => {
    if (state.isNew) return parsedA && parsedB ? 100 : undefined
    if (!parsedA || state.reserveA === 0n) return undefined
    return (Number(parsedA) / (Number(state.reserveA) + Number(parsedA))) * 100
  }, [state.isNew, state.reserveA, parsedA, parsedB])

  let disabledLabel: string | undefined
  if (!tokenA || !tokenB) disabledLabel = 'Select both tokens'
  else if (sameAddress(tokenA.address, tokenB.address)) disabledLabel = 'Pick two different tokens'
  else if (state.isLoading) disabledLabel = 'Loading pool...'
  else if (!parsedA || !parsedB) disabledLabel = 'Enter amounts'
  else if (balanceA !== undefined && parsedA > balanceA) disabledLabel = `Insufficient ${tokenA.symbol} balance`
  else if (balanceB !== undefined && parsedB > balanceB) disabledLabel = `Insufficient ${tokenB.symbol} balance`

  const submit = async () => {
    if (!tokenA || !tokenB || !parsedA || !parsedB || !address || !DEX_ROUTER) return
    const router = DEX_ROUTER
    const keep = BigInt(10_000 - slippageBps)
    // A brand-new pool takes both amounts exactly, so the minimums equal the deposit.
    const minA = state.isNew ? parsedA : (parsedA * keep) / 10_000n
    const minB = state.isNew ? parsedB : (parsedB * keep) / 10_000n
    const ok = await flow.execute({
      approvals: [
        { token: tokenA.address, spender: router, amount: parsedA, symbol: tokenA.symbol },
        { token: tokenB.address, spender: router, amount: parsedB, symbol: tokenB.symbol },
      ],
      buildCall: () => ({
        to: router,
        data: encodeFunctionData({
          abi: routerAbi,
          functionName: 'addLiquidity',
          args: [tokenA.address, tokenB.address, parsedA, parsedB, minA, minB, address, deadlineFromNow()],
        }),
      }),
      successMessage: state.isNew ? 'Pool created' : 'Liquidity added',
    })
    if (ok) {
      setAmountA('')
      setAmountB('')
      onDone?.()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: 'var(--subtle)' }}>
          {tokenA && tokenB ? `${tokenA.symbol} / ${tokenB.symbol} pool` : 'Choose a pair'}
        </span>
        {!state.isNew && <SlippageControl valueBps={slippageBps} onChange={setSlippageBps} />}
      </div>

      <AmountField
        label="Deposit"
        token={tokenA}
        value={amountA}
        onChange={editA}
        onTokenClick={() => setPicker('A')}
        tokenLocked={lockTokens}
        balance={balanceA}
        showMax
      />
      <AmountField
        label="Deposit"
        token={tokenB}
        value={amountB}
        onChange={editB}
        onTokenClick={() => setPicker('B')}
        tokenLocked={lockTokens}
        balance={balanceB}
        showMax
      />

      {tokenA && tokenB && !state.isLoading && state.isNew && !sameAddress(tokenA.address, tokenB.address) && (
        <div className="flex items-start gap-2 rounded-2xl px-3.5 py-3 text-sm" style={{ background: 'rgba(172,198,233,0.12)', color: 'var(--accent)' }}>
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {state.pair ? 'This pool is empty.' : 'No pool exists for this pair yet.'} Your deposit creates it and sets the starting price, so use amounts at a fair market ratio.
          </span>
        </div>
      )}

      {price !== undefined && tokenA && tokenB && (
        <div className="inner flex flex-col gap-2 rounded-2xl p-3.5 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--subtle)' }}>Price</span>
            <span className="tabular-nums">1 {tokenA.symbol} = {formatRate(price)} {tokenB.symbol}</span>
          </div>
          {shareOfPool !== undefined && (
            <div className="flex justify-between">
              <span style={{ color: 'var(--subtle)' }}>Share of pool</span>
              <span className="tabular-nums">{formatPercent(shareOfPool)}</span>
            </div>
          )}
        </div>
      )}

      <ActionButton
        label={state.isNew ? 'Create pool and add liquidity' : 'Add liquidity'}
        onClick={submit}
        disabled={!!disabledLabel}
        disabledLabel={disabledLabel}
        busy={flow.busy}
        busyLabel={flow.stepLabel || 'Working...'}
      />
      <TxStatus phase={flow.phase} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} successText={state.isNew ? 'Pool created' : 'Liquidity added'} />

      <TokenSelectModal
        open={picker !== null}
        onClose={() => setPicker(null)}
        onSelect={(token) => {
          if (picker === 'A') setTokenA(token)
          else setTokenB(token)
          setAmountA('')
          setAmountB('')
          flow.reset()
        }}
        disabledToken={picker === 'A' ? tokenB : tokenA}
      />
    </div>
  )
}
