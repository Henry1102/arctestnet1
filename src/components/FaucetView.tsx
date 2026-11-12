import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { useAccount, useReadContract } from 'wagmi'
import { encodeFunctionData } from 'viem'
import { testTokenAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID, TOKEN_ADDRESSES } from '@/lib/dex/config'
import { formatTokenAmount } from '@/lib/dex/format'
import type { Token } from '@/lib/dex/tokens'
import { useTokens } from '@/hooks/useTokens'
import { useTxFlow } from '@/hooks/useTxFlow'
import { ActionButton } from './ActionButton'
import { TokenIcon } from './TokenIcon'
import { TxStatus } from './TxStatus'

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function FaucetRow({ token }: { token: Token }) {
  const { address } = useAccount()
  const flow = useTxFlow()
  const now = useNow()

  const amount = useReadContract({
    address: token.address,
    abi: testTokenAbi,
    functionName: 'faucetAmount',
    chainId: DEX_CHAIN_ID,
  })
  const next = useReadContract({
    address: token.address,
    abi: testTokenAbi,
    functionName: 'nextFaucetAt',
    args: address ? [address] : undefined,
    chainId: DEX_CHAIN_ID,
    query: { enabled: !!address },
  })

  const waitSeconds = next.data !== undefined ? Math.max(0, Number(next.data) - now) : 0
  const claim = () =>
    flow.execute({
      approvals: [],
      buildCall: () => ({ to: token.address, data: encodeFunctionData({ abi: testTokenAbi, functionName: 'faucet' }) }),
      successMessage: `${token.symbol} claimed`,
    })

  return (
    <li className="card flex flex-col gap-4 rounded-3xl p-5">
      <div className="flex items-center gap-3">
        <TokenIcon token={token} size={36} />
        <div>
          <div className="display text-lg font-semibold">{token.symbol}</div>
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>{token.name}</div>
        </div>
        <div className="ml-auto text-right text-sm tabular-nums">
          {amount.data !== undefined ? formatTokenAmount(amount.data, token.decimals, 2) : '...'}
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>per claim, hourly</div>
        </div>
      </div>
      <ActionButton
        label={`Claim ${token.symbol}`}
        onClick={claim}
        disabled={waitSeconds > 0}
        disabledLabel={`Next claim in ${formatCountdown(waitSeconds)}`}
        busy={flow.busy}
        busyLabel={flow.stepLabel || 'Working...'}
      />
      <TxStatus phase={flow.phase} stepLabel={flow.stepLabel} hash={flow.hash} error={flow.error} successText={`${token.symbol} claimed`} />
    </li>
  )
}

export function FaucetView() {
  const { tokens } = useTokens()
  const testTokens = tokens.filter(
    (t) => t.address === TOKEN_ADDRESSES.tWETH || t.address === TOKEN_ADDRESSES.tWBTC,
  )

  return (
    <section className="w-full max-w-xl" aria-label="Test token faucet">
      <h1 className="display text-2xl font-semibold">Faucet</h1>
      <p className="mb-5 mt-1 text-sm" style={{ color: 'var(--subtle)' }}>
        Free test tokens for trying the DEX on Arc Testnet. They have no real value.
      </p>

      <ul className="flex flex-col gap-3">
        {testTokens.map((token) => (
          <FaucetRow key={token.address} token={token} />
        ))}
        <li className="card flex flex-col gap-3 rounded-3xl p-5">
          <div className="flex items-center gap-3">
            <TokenIcon token={{ symbol: 'USDC' }} size={36} />
            <div>
              <div className="display text-lg font-semibold">USDC and EURC</div>
              <div className="text-xs" style={{ color: 'var(--subtle)' }}>Also pays for gas on Arc</div>
            </div>
          </div>
          <a
            href="https://faucet.circle.com"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ghost flex min-h-[48px] items-center justify-center gap-2 rounded-2xl text-sm font-semibold"
          >
            Open Circle faucet <ExternalLink className="size-4" aria-hidden />
          </a>
        </li>
      </ul>
    </section>
  )
}
