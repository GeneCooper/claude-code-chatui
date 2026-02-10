import { create } from 'zustand'

export interface PermissionRequest {
  id: string
  tool: string
  input: Record<string, unknown>
  pattern?: string
  suggestions?: string[]
  decisionReason?: string
  blockedPath?: string
  status: 'pending' | 'approved' | 'denied'
}

interface PermissionState {
  pendingRequests: PermissionRequest[]
  approvedPatterns: Record<string, string[]>

  addRequest: (request: PermissionRequest) => void
  updateRequestStatus: (id: string, status: 'approved' | 'denied') => void
  clearRequests: () => void
  setApprovedPatterns: (patterns: Record<string, string[]>) => void
  addApprovedPattern: (toolName: string, pattern: string) => void
  removeApprovedPattern: (toolName: string, pattern: string) => void
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  pendingRequests: [],
  approvedPatterns: {},

  addRequest: (request) => {
    set({ pendingRequests: [...get().pendingRequests, request] })
  },

  updateRequestStatus: (id, status) => {
    set({
      pendingRequests: get().pendingRequests.map((r) =>
        r.id === id ? { ...r, status } : r,
      ),
    })
  },

  clearRequests: () => set({ pendingRequests: [] }),

  setApprovedPatterns: (patterns) => set({ approvedPatterns: patterns }),

  addApprovedPattern: (toolName, pattern) => {
    const current = get().approvedPatterns
    const existing = current[toolName] || []
    if (!existing.includes(pattern)) {
      set({
        approvedPatterns: {
          ...current,
          [toolName]: [...existing, pattern],
        },
      })
    }
  },

  removeApprovedPattern: (toolName, pattern) => {
    const current = get().approvedPatterns
    const existing = current[toolName] || []
    set({
      approvedPatterns: {
        ...current,
        [toolName]: existing.filter((p) => p !== pattern),
      },
    })
  },
}))
