/**
 * Chat Mutations
 *
 * Mutations for chat operations with optimistic updates.
 *
 * @module webview/mutations/useChatMutations
 */

import { useMutation } from './useMutation'
import { postMessage } from '../lib/vscode'
import { useChatStore } from '../stores/chatStore'

/**
 * Mutation for sending a message with optimistic user message display.
 */
export function useSendMessage() {
  return useMutation<
    { text: string; model?: string; planMode?: boolean; thinkingMode?: boolean; images?: string[] },
    void,
    Error,
    { previousMessages: ReturnType<typeof useChatStore.getState>['messages'] }
  >({
    onMutate: (variables) => {
      // Save current messages for rollback
      const previousMessages = [...useChatStore.getState().messages]

      // Optimistically add user message
      useChatStore.getState().addMessage({ type: 'userInput', data: variables.text })

      return { previousMessages }
    },

    mutationFn: (variables) => {
      postMessage({
        type: 'sendMessage',
        text: variables.text,
        model: variables.model,
        planMode: variables.planMode,
        thinkingMode: variables.thinkingMode,
        images: variables.images,
      })
    },

    onError: (_error, _variables, context) => {
      // Rollback on error — not typical for fire-and-forget postMessage
      if (context?.previousMessages) {
        // In practice, the extension handles errors via error messages
      }
    },
  })
}

/**
 * Mutation for clearing the chat session.
 */
export function useClearChat() {
  return useMutation<void, void, Error, { previousMessages: ReturnType<typeof useChatStore.getState>['messages'] }>({
    onMutate: () => {
      const previousMessages = [...useChatStore.getState().messages]
      return { previousMessages }
    },

    mutationFn: () => {
      postMessage({ type: 'newSession' })
    },

    onError: (_error, _variables, context) => {
      // Rollback: restore messages if clear fails
      if (context?.previousMessages) {
        // Messages will be restored via sessionCleared message from extension
      }
    },
  })
}

/**
 * Mutation for stopping the current generation.
 */
export function useStopGeneration() {
  return useMutation<void, void, Error>({
    mutationFn: () => {
      postMessage({ type: 'stopRequest' })
      useChatStore.getState().setProcessing(false)
    },
  })
}
