import { create } from 'zustand'

type ActiveView = 'chat' | 'history' | 'settings' | 'mcp'

interface UIState {
  activeView: ActiveView
  showSlashPicker: boolean
  showFilePicker: boolean

  setActiveView: (view: ActiveView) => void
  setShowSlashPicker: (show: boolean) => void
  setShowFilePicker: (show: boolean) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'chat',
  showSlashPicker: false,
  showFilePicker: false,

  setActiveView: (view) => set({ activeView: view }),
  setShowSlashPicker: (show) => set({ showSlashPicker: show }),
  setShowFilePicker: (show) => set({ showFilePicker: show }),
}))
