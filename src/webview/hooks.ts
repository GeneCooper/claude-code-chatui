import { useRef, useCallback, useEffect, useState, type RefObject } from 'react'
import { useChatStore, type ChatMessage, type TodoItem } from './store'
import { useSettingsStore } from './store'
import { useConversationStore } from './store'
import { useMCPStore } from './store'
import { useUIStore } from './store'
import { createModuleLogger } from '../shared/logger'
import { parseUsageLimitTimestamp } from './utils'
import { consumeOptimisticUserInput, consumeOptimisticPermission } from './mutations'
import type { UsageData } from '../shared/types'

// ============================================================================
// VS Code API Bridge
// ============================================================================

interface VSCodeApi {
  postMessage(message: unknown): void
  getState(): unknown
  setState(state: unknown): void
}

const vscode: VSCodeApi | undefined =
  typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : undefined

export function postMessage(message: { type: string; [key: string]: unknown }): void {
  vscode?.postMessage(message)
}

export function getState<T>(): T | undefined {
  return vscode?.getState() as T | undefined
}

export function setState<T>(state: T): void {
  vscode?.setState(state)
}

function onMessage(handler: (message: Record<string, unknown>) => void): () => void {
  const listener = (event: MessageEvent) => handler(event.data)
  window.addEventListener('message', listener)
  return () => window.removeEventListener('message', listener)
}

declare function acquireVsCodeApi(): VSCodeApi

// ============================================================================
// Extension Message Handlers
// ============================================================================

const log = createModuleLogger('MessageHandlers')

type ExtensionMessage = { type: string; data?: unknown; state?: unknown; [key: string]: unknown }
type WebviewMessageHandler = (msg: ExtensionMessage) => void

let messageCounter = 0

const webviewMessageHandlers: Record<string, WebviewMessageHandler> = {
  ready: () => {},

  batchReplay: (msg) => {
    const data = msg.data as {
      messages: Array<{ type: string; data: unknown }>
      sessionId?: string
      totalCost?: number
      isProcessing?: boolean
    }
    if (!data?.messages) return

    // Build all messages at once, then set state in a single update
    const now = new Date().toISOString()
    const chatMessages = data.messages
      .filter((m) => {
        // Only include message types that go into the messages array
        const validTypes = ['userInput', 'output', 'thinking', 'toolUse', 'toolResult', 'error', 'sessionInfo', 'compacting', 'compactBoundary', 'permissionRequest', 'restorePoint']
        return validTypes.includes(m.type)
      })
      .map((m) => ({
        id: `msg-${++messageCounter}-${Date.now()}`,
        type: m.type as ChatMessage['type'],
        data: m.data,
        timestamp: now,
      }))

    // Extract todos from todosUpdate messages
    const todosMsg = data.messages.filter((m) => m.type === 'todosUpdate').pop()
    const todos = todosMsg ? (todosMsg.data as { todos: TodoItem[] })?.todos : undefined

    // Single state update for all messages
    useChatStore.setState((state) => ({
      messages: chatMessages,
      sessionId: data.sessionId || state.sessionId,
      isProcessing: data.isProcessing || false,
      totals: { ...state.totals, totalCost: data.totalCost || 0 },
      ...(todos ? { todos } : {}),
    }))

    if (data.isProcessing) {
      useUIStore.getState().setRequestStartTime(Date.now())
      useChatStore.getState().addMessage({ type: 'loading', data: 'Claude is working...' })
    }

    // Signal that this is a replay so the timeline can auto-collapse old groups
    window.dispatchEvent(new CustomEvent('batchReplayDone', { detail: { messageCount: chatMessages.length } }))
  },

  userInput: (msg) => {
    if (consumeOptimisticUserInput()) return // Already added optimistically
    useChatStore.getState().addMessage({ type: 'userInput', data: msg.data })
  },

  output: (msg) => {
    const store = useChatStore.getState()
    store.removeLoading()
    // Try to merge with last output message (consecutive output chunks from same response)
    const merged = store.appendToLastOutput(String(msg.data))
    if (!merged) {
      store.addMessage({ type: 'output', data: msg.data })
    }
  },

  thinking: (msg) => {
    useChatStore.getState().removeLoading()
    useChatStore.getState().addMessage({ type: 'thinking', data: msg.data })
  },

  loading: (msg) => {
    // Skip if a loading message already exists (optimistic update already added one)
    const hasLoading = useChatStore.getState().messages.some((m) => m.type === 'loading')
    if (!hasLoading) useChatStore.getState().addMessage({ type: 'loading', data: msg.data })
  },
  clearLoading: () => { useChatStore.getState().removeLoading() },

  error: (msg) => {
    useChatStore.getState().removeLoading()
    const text = typeof msg.data === 'string' ? msg.data : ''
    const usageLimit = parseUsageLimitTimestamp(text)
    if (usageLimit) {
      useChatStore.getState().addMessage({ type: 'error', data: `${usageLimit.message}. Resets ${usageLimit.resetDate}` })
    } else {
      useChatStore.getState().addMessage({ type: 'error', data: msg.data })
    }
  },

  setProcessing: (msg) => {
    const isProcessing = (msg.data as { isProcessing: boolean }).isProcessing
    const store = useChatStore.getState()
    // Skip if already in the target state (optimistic update already applied)
    if (store.isProcessing === isProcessing) return
    store.setProcessing(isProcessing)
    useUIStore.getState().setRequestStartTime(isProcessing ? Date.now() : null)
  },

  sessionCleared: () => {
    useChatStore.getState().clearMessages()
    useChatStore.getState().setSessionId(null)
    useUIStore.getState().setRequestStartTime(null)
  },

  sessionInfo: (msg) => {
    const info = msg.data as { sessionId: string }
    useChatStore.getState().setSessionId(info.sessionId)
    useChatStore.getState().addMessage({ type: 'sessionInfo', data: msg.data })
  },

  updateTokens: (msg) => { useChatStore.getState().updateTokens(msg.data as Record<string, number>) },
  updateTotals: (msg) => { useChatStore.getState().updateTotals(msg.data as Record<string, number>) },

  toolUse: (msg) => {
    useChatStore.getState().removeLoading()
    useChatStore.getState().addMessage({ type: 'toolUse', data: msg.data })
  },

  toolResult: (msg) => {
    const result = msg.data as { hidden?: boolean }
    if (!result.hidden) useChatStore.getState().addMessage({ type: 'toolResult', data: msg.data })
  },

  permissionRequest: (msg) => { useChatStore.getState().addMessage({ type: 'permissionRequest', data: msg.data }) },

  updatePermissionStatus: (msg) => {
    const perm = msg.data as { id: string; status: string }
    if (consumeOptimisticPermission(perm.id)) return // Already updated optimistically
    useChatStore.getState().updatePermissionStatus(perm.id, perm.status)
  },

  compacting: (msg) => { useChatStore.getState().addMessage({ type: 'compacting', data: msg.data }) },
  compactBoundary: (msg) => { useChatStore.getState().addMessage({ type: 'compactBoundary', data: msg.data }) },

  restoreState: (msg) => {
    useChatStore.getState().restoreState(msg.state as { messages?: []; sessionId?: string; totalCost?: number })
  },

  showInstallModal: () => { useUIStore.getState().setShowInstallModal(true) },

  showLoginRequired: (msg) => {
    const loginData = msg.data as { message: string }
    useUIStore.getState().setLoginErrorMessage(loginData.message || '')
    useUIStore.getState().setShowLoginModal(true)
  },

  installComplete: (msg) => {
    const installResult = msg.data as { success: boolean; error?: string }
    const cb = (window as unknown as { __installCallback?: (success: boolean, error?: string) => void }).__installCallback
    if (cb) cb(installResult.success, installResult.error)
  },

  settingsData: (msg) => {
    useSettingsStore.getState().updateSettings(msg.data as { thinkingIntensity: string; yoloMode: boolean })
  },

  conversationList: (msg) => {
    useConversationStore.getState().setConversations(msg.data as Array<{
      filename: string; sessionId: string; startTime: string; endTime: string;
      messageCount: number; totalCost: number; firstUserMessage: string; lastUserMessage: string;
    }>)
  },

  mcpServers: (msg) => {
    useMCPStore.getState().setServers(
      msg.data as Record<string, { type: 'stdio' | 'http' | 'sse'; command?: string; url?: string; args?: string[] }>,
    )
  },

  mcpServerSaved: () => { postMessage({ type: 'loadMCPServers' }) },

  mcpServerDeleted: (msg) => { useMCPStore.getState().removeServer((msg.data as { name: string }).name) },

  mcpServerError: (msg) => {
    useChatStore.getState().addMessage({ type: 'error', data: (msg.data as { error: string }).error })
  },

  restorePoint: (msg) => { useChatStore.getState().addMessage({ type: 'restorePoint', data: msg.data }) },

  usageUpdate: (msg) => { useUIStore.getState().setUsageData(msg.data as UsageData) },
  usageError: () => {},

  accountInfo: (msg) => {
    const info = msg.data as { subscriptionType: 'pro' | 'max' | undefined }
    useUIStore.getState().setAccountType(info.subscriptionType)
  },

  platformInfo: (msg) => {
    useUIStore.getState().setPlatformInfo(msg.data as { platform: string; isWindows: boolean })
  },

  imageFilePicked: (msg) => {
    window.dispatchEvent(new CustomEvent('imageFilePicked', { detail: msg.data }))
  },

  clipboardContent: (msg) => {
    window.dispatchEvent(new CustomEvent('clipboardContent', { detail: msg.data }))
  },

  attachFileContext: (msg) => {
    const data = msg.data as { filePath: string }
    if (data?.filePath) {
      window.dispatchEvent(new CustomEvent('attachFileContext', { detail: data }))
    }
  },

  fileDropped: (msg) => {
    const data = msg.data as { filePath: string }
    if (data?.filePath) {
      window.dispatchEvent(new CustomEvent('attachFileContext', { detail: data }))
    }
  },

  todosUpdate: (msg) => {
    const todosData = msg.data as { todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }> }
    useChatStore.getState().updateTodos(todosData.todos)
  },

  editorSelection: (msg) => {
    const data = msg.data as { filePath: string; startLine: number; endLine: number; text: string } | null
    window.dispatchEvent(new CustomEvent('editorSelection', { detail: data }))
  },
}

function handleExtensionMessage(msg: ExtensionMessage): void {
  const handler = webviewMessageHandlers[msg.type]
  if (handler) handler(msg)
  else log.warn('Unhandled message type', { type: msg.type })
}

// ============================================================================
// useVSCode Hook
// ============================================================================

export function useVSCode(): void {
  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      handleExtensionMessage(msg as { type: string; data?: unknown; state?: unknown })
    })
    postMessage({ type: 'ready' })
    return unsubscribe
  }, [])
}

// ============================================================================
// useAutoScroll Hook
// ============================================================================

interface UseAutoScrollOptions {
  threshold?: number
  enabled?: boolean
  behavior?: ScrollBehavior
  dependencies?: unknown[]
  onScrollAway?: () => void
  onScrollToBottom?: () => void
}

interface UseAutoScrollReturn<T extends HTMLElement> {
  containerRef: RefObject<T | null>
  isNearBottom: boolean
  isAutoScrollEnabled: boolean
  scrollToBottom: (options?: { behavior?: ScrollBehavior }) => void
  enableAutoScroll: () => void
  disableAutoScroll: () => void
  toggleAutoScroll: () => void
  checkIsAtBottom: () => boolean
}

export function useAutoScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseAutoScrollOptions = {},
): UseAutoScrollReturn<T> {
  const {
    threshold = 100,
    enabled = true,
    behavior = 'smooth',
    dependencies = [],
    onScrollAway,
    onScrollToBottom,
  } = options

  const containerRef = useRef<T>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(enabled)
  const isScrollingRef = useRef(false)
  const lastScrollTopRef = useRef(0)

  const checkIsAtBottom = useCallback((): boolean => {
    const container = containerRef.current
    if (!container) return true
    const { scrollTop, scrollHeight, clientHeight } = container
    return scrollHeight - scrollTop - clientHeight <= threshold
  }, [threshold])

  const scrollToBottom = useCallback(
    (scrollOptions?: { behavior?: ScrollBehavior }): void => {
      const container = containerRef.current
      if (!container) return
      isScrollingRef.current = true
      container.scrollTo({ top: container.scrollHeight, behavior: scrollOptions?.behavior ?? behavior })
      requestAnimationFrame(() => {
        requestAnimationFrame(() => { isScrollingRef.current = false; setIsNearBottom(true) })
      })
    },
    [behavior],
  )

  const enableAutoScroll = useCallback((): void => { setIsAutoScrollEnabled(true) }, [])
  const disableAutoScroll = useCallback((): void => { setIsAutoScrollEnabled(false) }, [])
  const toggleAutoScroll = useCallback((): void => { setIsAutoScrollEnabled((prev) => !prev) }, [])

  const handleScroll = useCallback((): void => {
    if (isScrollingRef.current) return
    const container = containerRef.current
    if (!container) return

    const { scrollTop } = container
    const wasNearBottom = isNearBottom
    const nowNearBottom = checkIsAtBottom()
    const isScrollingUp = scrollTop < lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop

    setIsNearBottom(nowNearBottom)
    if (wasNearBottom && !nowNearBottom && isScrollingUp) onScrollAway?.()
    else if (!wasNearBottom && nowNearBottom) onScrollToBottom?.()
  }, [isNearBottom, checkIsAtBottom, onScrollAway, onScrollToBottom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  useEffect(() => {
    if (isAutoScrollEnabled && isNearBottom) {
      requestAnimationFrame(() => { scrollToBottom({ behavior }) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, isAutoScrollEnabled, isNearBottom])

  useEffect(() => {
    if (isAutoScrollEnabled) scrollToBottom({ behavior: 'instant' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    containerRef, isNearBottom, isAutoScrollEnabled,
    scrollToBottom, enableAutoScroll, disableAutoScroll, toggleAutoScroll, checkIsAtBottom,
  }
}

