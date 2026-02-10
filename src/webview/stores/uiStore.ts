import { create } from 'zustand'
import type { UsageData } from '../../shared/types'

type ActiveView = 'chat' | 'history' | 'settings'

interface UIState {
  activeView: ActiveView
  showSlashPicker: boolean
  showFilePicker: boolean
  showIntensityModal: boolean
  showMCPModal: boolean
  showInstallModal: boolean
  showLoginModal: boolean
  loginErrorMessage: string
  draftText: string
  requestStartTime: number | null
  usageData: UsageData | null

  setActiveView: (view: ActiveView) => void
  setShowSlashPicker: (show: boolean) => void
  setShowFilePicker: (show: boolean) => void
  setShowIntensityModal: (show: boolean) => void
  setShowMCPModal: (show: boolean) => void
  setShowInstallModal: (show: boolean) => void
  setShowLoginModal: (show: boolean) => void
  setLoginErrorMessage: (msg: string) => void
  setDraftText: (text: string) => void
  setRequestStartTime: (time: number | null) => void
  setUsageData: (data: UsageData | null) => void
}

export const useUIStore = create<UIState>((set) => ({
  activeView: 'chat',
  showSlashPicker: false,
  showFilePicker: false,
  showIntensityModal: false,
  showMCPModal: false,
  showInstallModal: false,
  showLoginModal: false,
  loginErrorMessage: '',
  draftText: '',
  requestStartTime: null,
  usageData: null,

  setActiveView: (view) => set({ activeView: view }),
  setShowSlashPicker: (show) => set({ showSlashPicker: show }),
  setShowFilePicker: (show) => set({ showFilePicker: show }),
  setShowIntensityModal: (show) => set({ showIntensityModal: show }),
  setShowMCPModal: (show) => set({ showMCPModal: show }),
  setShowInstallModal: (show) => set({ showInstallModal: show }),
  setShowLoginModal: (show) => set({ showLoginModal: show }),
  setLoginErrorMessage: (msg) => set({ loginErrorMessage: msg }),
  setDraftText: (text) => set({ draftText: text }),
  setRequestStartTime: (time) => set({ requestStartTime: time }),
  setUsageData: (data) => set({ usageData: data }),
}))
