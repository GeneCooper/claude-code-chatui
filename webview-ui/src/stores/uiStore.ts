import { create } from 'zustand'

type ActiveView = 'chat' | 'history' | 'settings' | 'mcp'

interface UIState {
  activeView: ActiveView
  showSlashPicker: boolean
  showFilePicker: boolean
  draftText: string
  requestStartTime: number | null

  setActiveView: (view: ActiveView) => void
  setShowSlashPicker: (show: boolean) => void
  setShowFilePicker: (show: boolean) => void
  setDraftText: (text: string) => void
  setRequestStartTime: (time: number | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'chat',
  showSlashPicker: false,
  showFilePicker: false,
  draftText: '',
  requestStartTime: null,

  setActiveView: (view) => set({ activeView: view }),
  setShowSlashPicker: (show) => set({ showSlashPicker: show }),
  setShowFilePicker: (show) => set({ showFilePicker: show }),
  setDraftText: (text) => set({ draftText: text }),
  setRequestStartTime: (time) => set({ requestStartTime: time }),
}))
