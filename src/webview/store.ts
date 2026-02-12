import { create } from 'zustand'
import type { TodoItem, MCPServerConfig, RateLimitData } from '../shared/types'

export type { TodoItem }

// ============================================================================
// Chat Store
// ============================================================================

export interface ChatMessage {
  id: string
  type: 'userInput' | 'output' | 'thinking' | 'toolUse' | 'toolResult' | 'error' | 'sessionInfo' | 'loading' | 'compacting' | 'compactBoundary' | 'permissionRequest' | 'todosUpdate' | 'backup'
  data: unknown
  timestamp: string
}

interface TokenState {
  totalTokensInput: number
  totalTokensOutput: number
  currentInputTokens: number
  currentOutputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

interface TotalsState {
  totalCost: number
  totalTokensInput: number
  totalTokensOutput: number
  requestCount: number
}

interface ChatState {
  messages: ChatMessage[]
  isProcessing: boolean
  sessionId: string | null
  tokens: TokenState
  totals: TotalsState
  todos: TodoItem[]
  rateLimit: RateLimitData | null

  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  appendToLastOutput: (text: string) => boolean
  clearMessages: () => void
  removeLoading: () => void
  setProcessing: (isProcessing: boolean) => void
  setSessionId: (id: string | null) => void
  updateTokens: (tokens: Partial<TokenState>) => void
  updateTotals: (totals: Partial<TotalsState>) => void
  updatePermissionStatus: (id: string, status: string) => void
  updateTodos: (todos: TodoItem[]) => void
  updateRateLimit: (data: RateLimitData) => void
  restoreState: (state: { messages?: ChatMessage[]; sessionId?: string; totalCost?: number }) => void
}

let messageCounter = 0

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isProcessing: false,
  sessionId: null,
  todos: [],
  tokens: {
    totalTokensInput: 0, totalTokensOutput: 0,
    currentInputTokens: 0, currentOutputTokens: 0,
    cacheCreationTokens: 0, cacheReadTokens: 0,
  },
  totals: { totalCost: 0, totalTokensInput: 0, totalTokensOutput: 0, requestCount: 0 },
  rateLimit: null,

  addMessage: (msg) =>
    set((state) => ({
      messages: [...state.messages, { ...msg, id: `msg-${++messageCounter}-${Date.now()}`, timestamp: new Date().toISOString() }],
    })),

  appendToLastOutput: (text) => {
    let merged = false
    set((state) => {
      const msgs = state.messages
      // Find the last output message (skip any loading messages at the end)
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (m.type === 'loading') continue
        if (m.type === 'output') {
          // Merge text into existing output
          const updated = [...msgs]
          updated[i] = { ...m, data: String(m.data) + '\n\n' + text }
          merged = true
          return { messages: updated }
        }
        break // Stop if we hit any non-loading, non-output message
      }
      return {} // no change
    })
    return merged
  },

  clearMessages: () => set({ messages: [] }),

  removeLoading: () =>
    set((state) => ({ messages: state.messages.filter((m) => m.type !== 'loading') })),

  setProcessing: (isProcessing) => set({ isProcessing }),
  setSessionId: (sessionId) => set({ sessionId }),

  updateTokens: (tokens) =>
    set((state) => ({ tokens: { ...state.tokens, ...tokens } })),

  updateTotals: (totals) =>
    set((state) => ({ totals: { ...state.totals, ...totals } })),

  updatePermissionStatus: (id, status) =>
    set((state) => ({
      messages: state.messages.map((m) => {
        if (m.type === 'permissionRequest') {
          const data = m.data as Record<string, unknown>
          if (data.id === id) return { ...m, data: { ...data, status } }
        }
        return m
      }),
    })),

  updateTodos: (todos) => set({ todos }),
  updateRateLimit: (data) => set({ rateLimit: data }),

  restoreState: (restored) =>
    set((state) => ({
      messages: restored.messages !== undefined ? restored.messages : state.messages,
      sessionId: restored.sessionId || null,
      totals: { totalCost: restored.totalCost || 0, totalTokensInput: 0, totalTokensOutput: 0, requestCount: 0 },
    })),
}))

// ============================================================================
// Conversation Store
// ============================================================================

interface ConversationEntry {
  filename: string
  sessionId: string
  startTime: string
  endTime: string
  messageCount: number
  totalCost: number
  firstUserMessage: string
  lastUserMessage: string
}

interface ConversationState {
  conversations: ConversationEntry[]
  setConversations: (list: ConversationEntry[]) => void
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  setConversations: (list) => set({ conversations: list }),
}))

// ============================================================================
// MCP Store
// ============================================================================

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

// ============================================================================
// Settings Store
// ============================================================================

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
  thinkingIntensity: 'think-hard',
  yoloMode: true,
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

// ============================================================================
// UI Store
// ============================================================================

type ActiveView = 'chat' | 'history' | 'settings'
type NotificationType = 'info' | 'success' | 'warning' | 'error'

interface Notification {
  id: string
  type: NotificationType
  title: string
  message?: string
  timestamp: number
}

interface UIState {
  activeView: ActiveView
  showSlashPicker: boolean

  showIntensityModal: boolean
  showMCPModal: boolean
  showInstallModal: boolean
  showLoginModal: boolean
  loginErrorMessage: string
  draftText: string
  requestStartTime: number | null
  platformInfo: { platform: string; isWindows: boolean } | null
  notifications: Notification[]

  setActiveView: (view: ActiveView) => void
  setShowSlashPicker: (show: boolean) => void

  setShowIntensityModal: (show: boolean) => void
  setShowMCPModal: (show: boolean) => void
  setShowInstallModal: (show: boolean) => void
  setShowLoginModal: (show: boolean) => void
  setLoginErrorMessage: (msg: string) => void
  setDraftText: (text: string) => void
  setRequestStartTime: (time: number | null) => void
  setPlatformInfo: (info: { platform: string; isWindows: boolean } | null) => void
  showNotification: (type: NotificationType, title: string, message?: string, timeout?: number) => void
  dismissNotification: (id: string) => void
}

let notifCounter = 0

export const useUIStore = create<UIState>((set, get) => ({
  activeView: 'chat',
  showSlashPicker: false,

  showIntensityModal: false,
  showMCPModal: false,
  showInstallModal: false,
  showLoginModal: false,
  loginErrorMessage: '',
  draftText: '',
  requestStartTime: null,
  platformInfo: null,
  notifications: [],

  setActiveView: (view) => set({ activeView: view }),
  setShowSlashPicker: (show) => set({ showSlashPicker: show }),

  setShowIntensityModal: (show) => set({ showIntensityModal: show }),
  setShowMCPModal: (show) => set({ showMCPModal: show }),
  setShowInstallModal: (show) => set({ showInstallModal: show }),
  setShowLoginModal: (show) => set({ showLoginModal: show }),
  setLoginErrorMessage: (msg) => set({ loginErrorMessage: msg }),
  setDraftText: (text) => set({ draftText: text }),
  setRequestStartTime: (time) => set({ requestStartTime: time }),
  setPlatformInfo: (info) => set({ platformInfo: info }),

  showNotification: (type, title, message, timeout = 5000) => {
    const id = `notif-${++notifCounter}`
    const notification: Notification = { id, type, title, message, timestamp: Date.now() }
    set({ notifications: [...get().notifications, notification] })
    if (timeout > 0) setTimeout(() => get().dismissNotification(id), timeout)
  },

  dismissNotification: (id) => {
    set({ notifications: get().notifications.filter((n) => n.id !== id) })
  },
}))

