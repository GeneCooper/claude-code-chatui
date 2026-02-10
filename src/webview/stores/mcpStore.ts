import { create } from 'zustand'

interface MCPServerConfig {
  type: 'stdio' | 'http' | 'sse'
  command?: string
  url?: string
  args?: string[]
  headers?: Record<string, string>
}

interface MCPState {
  servers: Record<string, MCPServerConfig>
  editingServer: string | null

  setServers: (servers: Record<string, MCPServerConfig>) => void
  setEditingServer: (name: string | null) => void
  removeServer: (name: string) => void
}

export const useMCPStore = create<MCPState>((set) => ({
  servers: {},
  editingServer: null,

  setServers: (servers) => set({ servers }),

  setEditingServer: (name) => set({ editingServer: name }),

  removeServer: (name) =>
    set((state) => {
      const { [name]: _, ...rest } = state.servers
      return { servers: rest }
    }),
}))
