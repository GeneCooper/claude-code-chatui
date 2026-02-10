import { create } from 'zustand'

export interface CustomSnippet {
  command: string
  description: string
  prompt: string
}

interface SettingsState {
  thinkingIntensity: string
  yoloMode: boolean
  customSnippets: CustomSnippet[]

  updateSettings: (settings: Partial<{ thinkingIntensity: string; yoloMode: boolean }>) => void
  setCustomSnippets: (snippets: CustomSnippet[]) => void
  addCustomSnippet: (snippet: CustomSnippet) => void
  removeCustomSnippet: (command: string) => void
}

export const useSettingsStore = create<SettingsState>((set) => ({
  thinkingIntensity: 'think',
  yoloMode: false,
  customSnippets: [],

  updateSettings: (settings) => set((state) => ({ ...state, ...settings })),
  setCustomSnippets: (snippets) => set({ customSnippets: snippets }),
  addCustomSnippet: (snippet) =>
    set((state) => ({
      customSnippets: [...state.customSnippets.filter((s) => s.command !== snippet.command), snippet],
    })),
  removeCustomSnippet: (command) =>
    set((state) => ({
      customSnippets: state.customSnippets.filter((s) => s.command !== command),
    })),
}))
