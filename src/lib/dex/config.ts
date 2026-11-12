import { getAddress, isAddress, type Address } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc } from '@/onchain-facts'

/** The DEX runs on Arc Testnet. */
export const DEX_CHAIN = arcTestnet
export const DEX_CHAIN_ID = arcTestnet.id

/** Swap fee charged by every pool, in basis points (0.30%). */
export const SWAP_FEE_BPS = 30

function readAddress(value: string | undefined): Address | undefined {
  const trimmed = value?.trim()
  return trimmed && isAddress(trimmed, { strict: false }) ? getAddress(trimmed) : undefined
}

export const DEX_FACTORY = readAddress(import.meta.env.VITE_DEX_FACTORY)
export const DEX_ROUTER = readAddress(import.meta.env.VITE_DEX_ROUTER)

export const TOKEN_ADDRESSES = {
  tWETH: readAddress(import.meta.env.VITE_TOKEN_TWETH),
  tWBTC: readAddress(import.meta.env.VITE_TOKEN_TWBTC),
  EURC: readAddress(import.meta.env.VITE_TOKEN_EURC),
}

export const USDC_FACT = getUsdc(DEX_CHAIN_ID)

/** Names of the variables a fresh clone must set before the DEX can talk to the chain. */
export function missingConfig(): string[] {
  const missing: string[] = []
  if (!DEX_FACTORY) missing.push('VITE_DEX_FACTORY')
  if (!DEX_ROUTER) missing.push('VITE_DEX_ROUTER')
  return missing
}
