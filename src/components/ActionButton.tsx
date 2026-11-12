import { Loader2 } from 'lucide-react'
import { useAccount, useSwitchChain } from 'wagmi'
import { useModal } from 'connectkit'
import { DEX_CHAIN, DEX_CHAIN_ID } from '@/lib/dex/config'

interface ActionButtonProps {
  label: string
  onClick: () => void | Promise<unknown>
  /** Disables the main action (invalid input, no route, and so on). Connect and network prompts still work. */
  disabled?: boolean
  /** Short reason shown instead of the label while disabled, e.g. "Enter an amount". */
  disabledLabel?: string
  busy?: boolean
  busyLabel?: string
  variant?: 'primary' | 'danger'
}

/** One primary CTA that walks the user through connect, network and the action itself. */
export function ActionButton({ label, onClick, disabled, disabledLabel, busy, busyLabel, variant = 'primary' }: ActionButtonProps) {
  const { isConnected, chainId } = useAccount()
  const { setOpen } = useModal()
  const { switchChain, isPending: switching } = useSwitchChain()

  let text = label
  let handler = onClick
  let isDisabled = false

  if (!isConnected) {
    text = 'Connect wallet'
    handler = () => setOpen(true)
  } else if (chainId !== DEX_CHAIN_ID) {
    text = switching ? 'Switching network...' : `Switch to ${DEX_CHAIN.name}`
    handler = () => switchChain({ chainId: DEX_CHAIN_ID })
    isDisabled = switching
  } else if (busy) {
    isDisabled = true
  } else if (disabled) {
    text = disabledLabel ?? label
    isDisabled = true
  }

  const showSpinner = isConnected && chainId === DEX_CHAIN_ID && busy
  const style = variant === 'danger' ? { background: 'var(--danger)', color: '#0d1b2f' } : undefined

  return (
    <button
      type="button"
      onClick={() => void handler()}
      disabled={isDisabled}
      className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-base font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 ${variant === 'primary' ? 'btn-primary' : ''}`}
      style={style}
    >
      {showSpinner && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {showSpinner ? (busyLabel ?? 'Working...') : text}
    </button>
  )
}
