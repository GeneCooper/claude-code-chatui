/**
 * Mutation Types
 *
 * Type definitions for the mutation pattern (optimistic updates with rollback).
 *
 * @module webview/mutations/types
 */

export type MutationStatus = 'idle' | 'pending' | 'success' | 'error'

export interface MutationState<TData = unknown, TError = Error> {
  status: MutationStatus
  data: TData | null
  error: TError | null
  isLoading: boolean
  attemptCount: number
}

export interface MutationOptions<TVariables = void, TData = void, TError = Error, TContext = unknown> {
  /** The async function that performs the mutation */
  mutationFn: (variables: TVariables) => Promise<TData> | void

  /** Called before the mutation. Return a context object for rollback. */
  onMutate?: (variables: TVariables) => TContext | Promise<TContext>

  /** Called on success */
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void

  /** Called on error. Use context to roll back optimistic updates. */
  onError?: (error: TError, variables: TVariables, context: TContext) => void

  /** Called after success or error */
  onSettled?: () => void

  /** Number of retry attempts (default: 0) */
  retry?: number

  /** Base delay between retries in ms (default: 1000) */
  retryDelay?: number
}

export const INITIAL_MUTATION_STATE: MutationState = {
  status: 'idle',
  data: null,
  error: null,
  isLoading: false,
  attemptCount: 0,
}
