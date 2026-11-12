import { useCallback, useState } from 'react'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { BaseError, decodeErrorResult, encodeFunctionData, type Address, type Hash, type Hex } from 'viem'
import { toast } from 'sonner'
import { erc20MetaAbi, routerAbi } from '@/lib/dex/abi'
import { DEX_CHAIN_ID } from '@/lib/dex/config'

export interface Approval {
  token: Address
  spender: Address
  amount: bigint
  symbol: string
}

export interface TxCall {
  to: Address
  data: Hex
}

export type TxPhase = 'idle' | 'wallet' | 'confirming' | 'success' | 'error'

const REVERT_MESSAGES: Record<string, string> = {
  Expired: 'The transaction deadline passed. Try again.',
  InsufficientOutputAmount: 'The price moved beyond your slippage tolerance. Try again or raise slippage.',
  InsufficientAAmount: 'The price moved beyond your slippage tolerance. Try again or raise slippage.',
  InsufficientBAmount: 'The price moved beyond your slippage tolerance. Try again or raise slippage.',
  ExcessiveInputAmount: 'The price moved beyond your slippage tolerance. Try again or raise slippage.',
  InsufficientLiquidity: 'This pool does not have enough liquidity for that amount.',
  PairNotFound: 'This pair does not exist yet. Add liquidity to create it.',
  InvalidTokens: 'Pick two different tokens.',
  InvalidPath: 'No valid route for this swap.',
  InsufficientAmount: 'Enter an amount greater than zero.',
  InsufficientInputAmount: 'Enter an amount greater than zero.',
}

export function friendlyError(error: unknown): string | null {
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  if (message.includes('user rejected') || message.includes('user denied') || message.includes('rejected the request')) {
    return null
  }
  if (error instanceof BaseError) {
    const withData = error.walk((e) => typeof (e as { data?: unknown }).data === 'string')
    const data = (withData as { data?: string } | null)?.data
    if (data && data.startsWith('0x') && data.length >= 10) {
      try {
        const decoded = decodeErrorResult({ abi: routerAbi, data: data as Hex })
        return REVERT_MESSAGES[decoded.errorName] ?? `Transaction failed: ${decoded.errorName}.`
      } catch {
        // Not a router error. Fall through to generic handling.
      }
    }
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient balance to pay for this transaction.'
  }
  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    return 'Network issue. Check your connection and try again.'
  }
  if (message.includes('transfer amount exceeds balance') || message.includes('erc20insufficientbalance')) {
    return 'Insufficient token balance.'
  }
  return 'The transaction failed. Please try again.'
}

/** Seconds from now, as the router expects. Computed at send time so a slow wallet never expires it. */
export const deadlineFromNow = (minutes = 20) => BigInt(Math.floor(Date.now() / 1000) + minutes * 60)

/**
 * Runs approvals (only when the allowance is too low), then one main call, and reports real wallet and
 * receipt states. Each approval covers exactly the amount the action needs.
 */
export function useTxFlow() {
  const { address, chainId } = useAccount()
  const publicClient = usePublicClient({ chainId: DEX_CHAIN_ID })
  const { sendTransactionAsync } = useSendTransaction()
  const { switchChainAsync } = useSwitchChain()
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<TxPhase>('idle')
  const [stepLabel, setStepLabel] = useState('')
  const [hash, setHash] = useState<Hash | undefined>()
  const [error, setError] = useState<string | undefined>()

  const reset = useCallback(() => {
    setPhase('idle')
    setStepLabel('')
    setHash(undefined)
    setError(undefined)
  }, [])

  const execute = useCallback(
    async (params: { approvals: Approval[]; buildCall: () => TxCall; successMessage: string }): Promise<boolean> => {
      if (!address || !publicClient) return false
      setError(undefined)
      setHash(undefined)
      try {
        if (chainId !== DEX_CHAIN_ID) await switchChainAsync({ chainId: DEX_CHAIN_ID })

        for (const approval of params.approvals) {
          const allowance = await publicClient.readContract({
            address: approval.token,
            abi: erc20MetaAbi,
            functionName: 'allowance',
            args: [address, approval.spender],
          })
          if (allowance >= approval.amount) continue
          setStepLabel(`Allow ${approval.symbol}`)
          setPhase('wallet')
          const approveHash = await sendTransactionAsync({
            to: approval.token,
            data: encodeFunctionData({
              abi: erc20MetaAbi,
              functionName: 'approve',
              args: [approval.spender, approval.amount],
            }),
          })
          setPhase('confirming')
          const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
          if (approveReceipt.status !== 'success') throw new Error('Approval failed')
        }

        const call = params.buildCall()
        // Dry-run first so a revert surfaces as a readable message instead of a wallet gas error.
        await publicClient.call({ account: address, to: call.to, data: call.data })

        setStepLabel('Confirm in wallet')
        setPhase('wallet')
        const txHash = await sendTransactionAsync({ to: call.to, data: call.data })
        setHash(txHash)
        setPhase('confirming')
        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        if (receipt.status !== 'success') throw new Error('Transaction reverted')

        setPhase('success')
        toast.success(params.successMessage)
        await queryClient.invalidateQueries()
        return true
      } catch (err) {
        const message = friendlyError(err)
        if (message === null) {
          reset()
        } else {
          setError(message)
          setPhase('error')
        }
        return false
      }
    },
    [address, chainId, publicClient, queryClient, reset, sendTransactionAsync, switchChainAsync],
  )

  return { phase, stepLabel, hash, error, execute, reset, busy: phase === 'wallet' || phase === 'confirming' }
}
