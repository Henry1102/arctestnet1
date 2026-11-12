import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { FaucetView } from '@/components/FaucetView'
import { Header, type Tab } from '@/components/Header'
import { PoolsView } from '@/components/PoolsView'
import { SwapCard } from '@/components/SwapCard'
import { missingConfig } from '@/lib/dex/config'

const TABS: Tab[] = ['swap', 'pools', 'faucet']

function readTab(): Tab {
  const value = new URLSearchParams(window.location.search).get('tab')
  return TABS.includes(value as Tab) ? (value as Tab) : 'swap'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(readTab)
  const missing = missingConfig()

  // Keep the tab in the query string so a link opens on the same view.
  const changeTab = useCallback((next: Tab) => {
    setTab(next)
    const url = new URL(window.location.href)
    if (next === 'swap') url.searchParams.delete('tab')
    else url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url)
  }, [])

  useEffect(() => {
    const onPop = () => setTab(readTab())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <div className="min-h-dvh">
      <Header tab={tab} onTab={changeTab} />
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
        {missing.length > 0 ? (
          <div className="card flex max-w-lg flex-col gap-3 rounded-3xl p-6" role="alert">
            <div className="flex items-center gap-2 font-semibold" style={{ color: 'var(--warning)' }}>
              <AlertTriangle className="size-5" aria-hidden /> Contracts not configured
            </div>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Copy <code className="mono">.env.example</code> to <code className="mono">.env</code> and set
              {' '}{missing.join(', ')}, then restart the dev server.
            </p>
          </div>
        ) : (
          <>
            {tab === 'swap' && <SwapCard />}
            {tab === 'pools' && <PoolsView />}
            {tab === 'faucet' && <FaucetView />}
          </>
        )}
      </main>
    </div>
  )
}
