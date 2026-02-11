import { useCallback, useRef, useState } from 'react'

// ============================================================================
// Lightweight Mutation Hook
// ============================================================================

export type MutationStatus = 'idle' | 'pending' | 'success' | 'error'

export interface MutationState<TData = unknown> {
  status: MutationStatus
  data: TData | null
  error: Error | null
  isPending: boolean
  isSuccess: boolean
  isError: boolean
}

export interface MutationOptions<TInput, TData> {
  /** Called before the mutation fn. Return value is used as rollback context. */
  onMutate?: (input: TInput) => unknown
  /** Called on success */
  onSuccess?: (data: TData, input: TInput) => void
  /** Called on error. Receives rollback context from onMutate. */
  onError?: (error: Error, input: TInput, rollbackCtx: unknown) => void
  /** Called after success or error */
  onSettled?: (data: TData | null, error: Error | null, input: TInput) => void
}

/**
 * Lightweight mutation hook with optimistic update support.
 *
 * Usage:
 * ```ts
 * const { mutate, isPending } = useMutation(
 *   async (text: string) => { postMessage({ type: 'sendMessage', text }) },
 *   {
 *     onMutate: (text) => {
 *       // Optimistic: add message to store immediately
 *       const prev = useChatStore.getState().messages
 *       useChatStore.getState().addMessage({ type: 'userInput', data: { text } })
 *       return prev // rollback context
 *     },
 *     onError: (_err, _input, prevMessages) => {
 *       // Rollback on failure
 *       useChatStore.setState({ messages: prevMessages })
 *     },
 *   }
 * )
 * ```
 */
export function useMutation<TInput = void, TData = void>(
  mutationFn: (input: TInput) => TData | Promise<TData>,
  options: MutationOptions<TInput, TData> = {},
): MutationState<TData> & { mutate: (input: TInput) => void; reset: () => void } {
  const [state, setState] = useState<MutationState<TData>>({
    status: 'idle',
    data: null,
    error: null,
    isPending: false,
    isSuccess: false,
    isError: false,
  })

  // Track current mutation to avoid race conditions
  const mutationIdRef = useRef(0)
  const mountedRef = useRef(true)

  const mutate = useCallback(
    (input: TInput) => {
      const id = ++mutationIdRef.current
      let rollbackCtx: unknown

      // Optimistic update phase
      if (options.onMutate) {
        rollbackCtx = options.onMutate(input)
      }

      setState({
        status: 'pending',
        data: null,
        error: null,
        isPending: true,
        isSuccess: false,
        isError: false,
      })

      // Execute mutation
      try {
        const result = mutationFn(input)

        if (result instanceof Promise) {
          result
            .then((data) => {
              if (!mountedRef.current || id !== mutationIdRef.current) return
              setState({
                status: 'success',
                data,
                error: null,
                isPending: false,
                isSuccess: true,
                isError: false,
              })
              options.onSuccess?.(data, input)
              options.onSettled?.(data, null, input)
            })
            .catch((err: Error) => {
              if (!mountedRef.current || id !== mutationIdRef.current) return
              setState({
                status: 'error',
                data: null,
                error: err,
                isPending: false,
                isSuccess: false,
                isError: true,
              })
              options.onError?.(err, input, rollbackCtx)
              options.onSettled?.(null, err, input)
            })
        } else {
          // Synchronous mutation (fire-and-forget like postMessage)
          if (mountedRef.current && id === mutationIdRef.current) {
            setState({
              status: 'success',
              data: result,
              error: null,
              isPending: false,
              isSuccess: true,
              isError: false,
            })
            options.onSuccess?.(result, input)
            options.onSettled?.(result, null, input)
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err))
        if (mountedRef.current && id === mutationIdRef.current) {
          setState({
            status: 'error',
            data: null,
            error,
            isPending: false,
            isSuccess: false,
            isError: true,
          })
          options.onError?.(error, input, rollbackCtx)
          options.onSettled?.(null, error, input)
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutationFn],
  )

  const reset = useCallback(() => {
    setState({
      status: 'idle',
      data: null,
      error: null,
      isPending: false,
      isSuccess: false,
      isError: false,
    })
  }, [])

  return { ...state, mutate, reset }
}

// ============================================================================
// Optimistic Dedup Tracking
// ============================================================================

// Tracks which messages/actions were done optimistically to avoid duplicates
// when the extension echoes them back

let _pendingOptimisticUserInput = false
const _pendingOptimisticPermissions = new Set<string>()

export function markOptimisticUserInput(): void {
  _pendingOptimisticUserInput = true
}

export function consumeOptimisticUserInput(): boolean {
  if (_pendingOptimisticUserInput) {
    _pendingOptimisticUserInput = false
    return true
  }
  return false
}

export function markOptimisticPermission(id: string): void {
  _pendingOptimisticPermissions.add(id)
}

export function consumeOptimisticPermission(id: string): boolean {
  return _pendingOptimisticPermissions.delete(id)
}
