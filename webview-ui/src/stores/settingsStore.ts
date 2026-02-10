import { create } from 'zustand'

interface SettingsState {
  thinkingIntensity: string
  yoloMode: boolean

  updateSettings: (settings: Partial<{ thinkingIntensity: string; yoloMode: boolean }>) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  thinkingIntensity: 'think',
  yoloMode: false,

  updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
}))
