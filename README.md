# Arc DEX

A decentralized exchange on Arc Testnet. Swap ERC-20 tokens, browse liquidity pools, create new pairs, and add or remove liquidity from your wallet. Every pool charges a 0.30% fee that goes to its liquidity providers.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Swap any two tokens that share a pool, with automatic routing through an intermediate token when no direct pool exists
- Slippage control, price impact warning, and minimum received shown before you sign
- Pools list with reserves, price, and your own position
- Create a pool for any token pair, add liquidity, and remove liquidity by percentage
- Import any ERC-20 token on Arc Testnet by pasting its address
- Built-in faucet for the test tokens (tWETH, tWBTC)
- USDC is used as a normal ERC-20 token. On Arc it is also the gas token, so there is no wrapped version

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS
- wagmi v2, viem, ConnectKit
- Solidity 0.8.28 and Foundry (constant-product pools, factory, router)
- OpenZeppelin Contracts 5

## Contracts (Arc Testnet, chain ID 5042002)

| Contract | Address |
| --- | --- |
| DexFactory | `0xe629764ab9de04009ab46e0095d60457749b1dd4` |
| DexRouter | `0x41c893ace2e2fa4e5e3ffb7c87adad70493e79e8` |
| tWETH (test token) | `0x52c9f8b4d19bbd1540ca20813c3a6443af637d6b` |
| tWBTC (test token) | `0x1d5a6e7b7ef0123f45b3c73b4eacb44f5b20b461` |

Source code is in `contracts/`. Fee-on-transfer and rebasing tokens are not supported. These contracts are unaudited testnet software.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://book.getfoundry.sh) (only needed for the contracts).

```bash
bun install
cp .env.example .env
bun run dev
```

The app opens on `http://localhost:5173`. Connect a wallet on Arc Testnet and get test USDC from [faucet.circle.com](https://faucet.circle.com).

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_DEX_FACTORY` | DexFactory address the app reads pools from |
| `VITE_DEX_ROUTER` | DexRouter address used for swaps and liquidity |
| `VITE_TOKEN_TWETH` | Test token shown in the token list and faucet |
| `VITE_TOKEN_TWBTC` | Test token shown in the token list and faucet |
| `VITE_TOKEN_EURC` | EURC token on Arc Testnet |

`.env.example` holds working values for the deployment above. Set your own addresses if you redeploy the contracts.

### Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the dev server |
| `bun run check` | Lint and typecheck |
| `bun run contracts:build` | Compile the contracts with Foundry |
| `bun run contracts:test` | Run the Foundry tests |

## Deploying your own copy of the contracts

Deploy `DexFactory` first, then `DexRouter` with the factory address as its only constructor argument. Put both addresses in `.env`. Pools are created from the app or by calling the router's add-liquidity function.
