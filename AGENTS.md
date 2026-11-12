# Arc DEX

> Built with Arc Studio - money-powered apps in minutes

This is the **project memory** - what Arc Studio remembers about building this app. It helps future agents (or humans) understand and extend the project.

---

## What This App Does

A Uniswap-V2-style DEX on Arc Testnet: swap ERC-20 tokens (with automatic two-hop routing), browse pools, create pairs, add and remove liquidity. 0.30% fee per pool. USDC is used as an ERC-20 (6 decimals); there is no WETH because USDC is also the gas token.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, unit tests in `contracts/test/*.t.sol`. Build with `bun run contracts:build` (`forge build`), test with `bun run contracts:test` (`forge test`).
- Wallet: injected (MetaMask, etc.)
- Chain: Arc Testnet (Chain ID: 5042002, imported from `viem/chains`)
- Token: USDC (6 decimals) (Address: 0x3600000000000000000000000000000000000000, Chain: Arc Testnet)
- Toasts: Sonner

## Key Files

- `src/App.tsx` - Tab shell (Swap, Pools, Faucet)
- `src/lib/dex/` - config (env addresses), ABIs, token list, number formatting
- `src/hooks/` - pools, swap quote and routing, balances, transaction flow (approve then action)
- `contracts/` - DexFactory, DexPair, DexRouter, TestToken (+ Foundry tests in `contracts/test/`)
- `src/components/` - UI components
- `src/config.ts` - wagmi config (chains, connectors, transports)

## Share links

- Starter apps already ship `getShareBase`, `buildShareLink` and `installShareSync` in `src/lib/share.ts`; import them instead of rewriting them.
- Keep shareable state in the URL path or query, not in the `#fragment`.
- Never put a secret (private key, claim secret, seed phrase, session token, API key) in the URL path or query, encoded or not: every in-app path and query is mirrored to the visitor's studio.arc.io address bar and browser history and reaches servers. A bearer claim secret goes only in the `#fragment` appended to the share link (`` `${await buildShareLink('/claim')}#${secret}` ``) and is read from `location.hash` on load. A link to the app's own share URL shown inside the app must be copy-only or open in a new tab with `target="_blank" rel="noopener noreferrer"`.
- Build every link a user copies or sends with `buildShareLink()` from `src/lib/share.ts`.
- Keep the `installShareSync()` call in `src/main.tsx` when editing it; it keeps the Studio address bar in step with in-app navigation.
- Navigate inside the app with relative links.

## To Run

```bash
bun install
bun run dev
```

## Deployed contracts (Arc Testnet, chain 5042002)

Addresses live in `.env` as `VITE_*` keys; `.env.example` is committed so clones work.

- DexFactory: `0xe629764ab9de04009ab46e0095d60457749b1dd4`
- DexRouter: `0x41c893ace2e2fa4e5e3ffb7c87adad70493e79e8` (factory is the address above)
- tWETH (TestToken, 18 decimals): `0x52c9f8b4d19bbd1540ca20813c3a6443af637d6b`
- tWBTC (TestToken, 8 decimals): `0x1d5a6e7b7ef0123f45b3c73b4eacb44f5b20b461`
- EURC (Arc Testnet): `0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a`

## Decisions

- Router is ERC-20 only. No ETH/WETH path, no native-USDC swap (native and ERC-20 USDC are the same funds).
- Fee-on-transfer and rebasing tokens are unsupported (documented in the router).
- Router `addLiquidity` treats a pair with zero LP supply as uninitialized, so one-sided donations plus `sync()` cannot block the first deposit.
- Approvals are for the exact amount of each action, not unlimited.
- Review found no open issues; 76 Foundry tests pass.
