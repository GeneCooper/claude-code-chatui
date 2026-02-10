/**
 * useMutation Hook
 *
 * Core mutation hook providing optimistic updates, rollback, and retry.
 *
 * @module webview/mutations/useMutation
 */

import { useState, useCallback, useRef } from 'react'
import type { MutationOptions, MutationState } from './types'
import { INITIAL_MUTATION_STATE } from './types'

export function useMutation<
  TVariables = void,
  TData = void,
  TError = Error,
  TContext = unknown,
>(options: MutationOptions<TVariables, TData, TError, TContext>) {
  const [state, setState] = useState<MutationState<TData, TError>>(
    INITIAL_MUTATION_STATE as MutationState<TData, TError>,
  )
  const optionsRef = useRef(options)
  optionsRef.current = options

  const mutate = useCallback(async (variables: TVariables) => {
    const opts = optionsRef.current
    const maxAttempts = (opts.retry ?? 0) + 1
    const baseDelay = opts.retryDelay ?? 1000

    let context: TContext | undefined
    let lastError: TError | undefined

    // Optimistic: call onMutate
    try {
      if (opts.onMutate) {
        context = await opts.onMutate(variables)
      }
    } catch {
      // onMutate failed — proceed without context
    }

    setState({
      status: 'pending',
      data: null,
      error: null,
      isLoading: true,
      attemptCount: 0,
    })

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      setState((prev) => ({ ...prev, attemptCount: attempt }))

      try {
        const result = await opts.mutationFn(variables)
        const data = (result ?? null) as TData | null

        setState({
          status: 'success',
          data,
          error: null,
          isLoading: false,
          attemptCount: attempt,
        })

        if (opts.onSuccess) {
          opts.onSuccess(data as TData, variables, context as TContext)
        }
        if (opts.onSettled) {
          opts.onSettled()
        }

        return data
      } catch (err) {
        lastError = err as TError

        // Retry with exponential backoff
        if (attempt < maxAttempts) {
          const delay = baseDelay * Math.pow(2, attempt - 1)
          await new Promise((resolve) => setTimeout(resolve, delay))
          continue
        }

        // All attempts failed
        setState({
          status: 'error',
          data: null,
          error: lastError,
          isLoading: false,
          attemptCount: attempt,
        })

        if (opts.onError) {
          opts.onError(lastError, variables, context as TContext)
        }
        if (opts.onSettled) {
          opts.onSettled()
        }
      }
    }

    return null
  }, [])

  const reset = useCallback(() => {
    setState(INITIAL_MUTATION_STATE as MutationState<TData, TError>)
  }, [])

  return {
    ...state,
    mutate,
    reset,
  }
}
