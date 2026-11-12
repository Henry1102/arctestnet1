import { ArrowLeftRight } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { shortAddress } from '@/lib/dex/format'

export type Tab = 'swap' | 'pools' | 'faucet'

const TABS: { id: Tab; label: string }[] = [
  { id: 'swap', label: 'Swap' },
  { id: 'pools', label: 'Pools' },
  { id: 'faucet', label: 'Faucet' },
]

interface HeaderProps {
  tab: Tab
  onTab: (tab: Tab) => void
}

export function Header({ tab, onTab }: HeaderProps) {
  return (
    <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'var(--accent)', color: '#0d1b2f' }}>
          <ArrowLeftRight className="size-5" aria-hidden />
        </span>
        <span className="display text-xl font-bold">Arc DEX</span>
        <span className="hidden rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase sm:inline" style={{ background: 'var(--surface-strong)', color: 'var(--subtle)', letterSpacing: '0.08em' }}>
          Testnet
        </span>
      </div>

      <nav aria-label="Main" className="order-3 grid w-full grid-cols-3 gap-1 rounded-2xl p-1 sm:order-none sm:w-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
            className={`min-h-[44px] rounded-xl px-5 text-sm font-semibold transition-colors ${tab === item.id ? 'btn-primary' : 'hover:bg-white/5'}`}
            style={tab === item.id ? undefined : { color: 'var(--muted)' }}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <ConnectKitButton.Custom>
        {({ isConnected, show, address }) => (
          <button
            type="button"
            onClick={show}
            className={`min-h-[44px] rounded-full px-5 text-sm font-semibold ${isConnected ? 'btn-ghost mono' : 'btn-primary'}`}
          >
            {isConnected && address ? shortAddress(address) : 'Connect wallet'}
          </button>
        )}
      </ConnectKitButton.Custom>
    </header>
  )
}
