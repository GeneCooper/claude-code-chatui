/**
 * Settings Mutations
 *
 * Mutations for settings operations with optimistic updates.
 *
 * @module webview/mutations/useSettingsMutations
 */

import { useMutation } from './useMutation'
import { postMessage } from '../lib/vscode'
import { useSettingsStore } from '../stores/settingsStore'

/**
 * Mutation for updating settings with optimistic UI update.
 */
export function useUpdateSettings() {
  return useMutation<
    Record<string, unknown>,
    void,
    Error,
    { previousSettings: ReturnType<typeof useSettingsStore.getState> }
  >({
    onMutate: (newSettings) => {
      const previousSettings = { ...useSettingsStore.getState() }

      // Optimistically update settings
      useSettingsStore.getState().updateSettings(
        newSettings as { thinkingIntensity?: string; yoloMode?: boolean },
      )

      return { previousSettings }
    },

    mutationFn: (settings) => {
      postMessage({ type: 'updateSettings', settings })
    },

    onError: (_error, _variables, context) => {
      // Rollback to previous settings
      if (context?.previousSettings) {
        useSettingsStore.getState().updateSettings({
          thinkingIntensity: context.previousSettings.thinkingIntensity,
          yoloMode: context.previousSettings.yoloMode,
        })
      }
    },
  })
}

/**
 * Mutation for toggling a specific mode (plan, yolo, thinking).
 */
export function useToggleMode() {
  return useMutation<
    { mode: 'planMode' | 'thinkingMode'; enabled: boolean },
    void,
    Error
  >({
    mutationFn: (variables) => {
      if (variables.mode === 'thinkingMode') {
        postMessage({
          type: 'updateSettings',
          settings: { thinkingMode: variables.enabled },
        })
      }
    },
  })
}
