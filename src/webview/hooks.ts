import { useRef, useCallback, useEffect, useState, type RefObject } from 'react'
import { useChatStore, type ChatMessage, type TodoItem } from './store'
import { useSettingsStore } from './store'
import { useConversationStore } from './store'
import { useMCPStore } from './store'
import { useSkillStore } from './store'
import { useUIStore } from './store'
import { createModuleLogger } from '../shared/logger'
import { parseUsageLimitTimestamp } from './utils'
import { consumeOptimisticUserInput, consumeOptimisticPermission } from './mutations'
import type { UsageData, SkillConfig } from '../shared/types'

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
        const validTypes = ['userInput', 'output', 'thinking', 'toolUse', 'toolResult', 'error', 'sessionInfo', 'compacting', 'compactBoundary', 'permissionRequest', 'diagnostics']
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
    const rawTodos = todosMsg ? (todosMsg.data as { todos: unknown })?.todos : undefined
    const todos = Array.isArray(rawTodos) ? rawTodos as TodoItem[] : undefined

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
    const text = String(msg.data)
    if (msg.partial) {
      // Partial streaming update — single setState: remove loading + update/add output
      useChatStore.setState((state) => {
        const msgs = state.messages.filter((m) => m.type !== 'loading')
        // Find last output to replace
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].type === 'output') {
            const updated = [...msgs]
            updated[i] = { ...msgs[i], data: text }
            return { messages: updated, processStatus: null }
          }
          if (msgs[i].type !== 'loading') break
        }
        // No existing output — add new
        return {
          messages: [...msgs, { type: 'output' as const, data: text, id: `msg-${++messageCounter}-${Date.now()}`, timestamp: new Date().toISOString() }],
          processStatus: null,
        }
      })
    } else {
      // Final/complete message — single setState: remove loading + merge/add
      useChatStore.setState((state) => {
        const msgs = state.messages.filter((m) => m.type !== 'loading')
        // Try to merge into last output
        for (let i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].type === 'output') {
            const updated = [...msgs]
            updated[i] = { ...msgs[i], data: String(msgs[i].data) + '\n\n' + text }
            return { messages: updated, processStatus: null }
          }
          if (msgs[i].type !== 'loading') break
        }
        return {
          messages: [...msgs, { type: 'output' as const, data: text, id: `msg-${++messageCounter}-${Date.now()}`, timestamp: new Date().toISOString() }],
          processStatus: null,
        }
      })
    }
  },

  thinking: (msg) => {
    // Single setState: remove loading + add thinking
    useChatStore.setState((state) => ({
      messages: [
        ...state.messages.filter((m) => m.type !== 'loading'),
        { type: 'thinking' as const, data: msg.data, id: `msg-${++messageCounter}-${Date.now()}`, timestamp: new Date().toISOString() },
      ],
      processStatus: null,
    }))
  },

  loading: (msg) => {
    // Skip if a loading message already exists (optimistic update already added one)
    const hasLoading = useChatStore.getState().messages.some((m) => m.type === 'loading')
    if (!hasLoading) useChatStore.getState().addMessage({ type: 'loading', data: msg.data })
  },
  clearLoading: () => { useChatStore.getState().removeLoading() },

  processStatus: (msg) => {
    useChatStore.getState().setProcessStatus(msg.data as { status: string; detail?: string } | null)
  },

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

  requestResult: (msg) => {
    const { result } = msg.data as { result: 'success' | 'error' }
    const ui = useUIStore.getState()
    const duration = ui.requestStartTime ? Math.floor((Date.now() - ui.requestStartTime) / 1000) : null
    ui.setLastRequestResult(result, duration)
  },

  setProcessing: (msg) => {
    const isProcessing = (msg.data as { isProcessing: boolean }).isProcessing
    const store = useChatStore.getState()
    // Skip if already in the target state (optimistic update already applied)
    if (store.isProcessing === isProcessing) return
    store.setProcessing(isProcessing)
    const ui = useUIStore.getState()
    if (isProcessing) {
      ui.setLastRequestResult(null, null)
    }
    ui.setRequestStartTime(isProcessing ? Date.now() : null)
  },

  sessionCleared: () => {
    useChatStore.setState({ messages: [], processStatus: null, sessionId: null })
    useUIStore.getState().setRequestStartTime(null)
  },

  sessionInfo: (msg) => {
    const info = msg.data as { sessionId: string }
    useChatStore.setState((state) => ({
      sessionId: info.sessionId,
      messages: [...state.messages, { type: 'sessionInfo' as const, data: msg.data, id: `msg-${++messageCounter}-${Date.now()}`, timestamp: new Date().toISOString() }],
    }))
  },

  updateTokens: (msg) => { useChatStore.getState().updateTokens(msg.data as Record<string, number>) },
  updateTotals: (msg) => { useChatStore.getState().updateTotals(msg.data as Record<string, number>) },

  toolUse: (msg) => {
    // Single setState: remove loading + add toolUse
    useChatStore.setState((state) => ({
      messages: [
        ...state.messages.filter((m) => m.type !== 'loading'),
        { type: 'toolUse' as const, data: msg.data, id: `msg-${++messageCounter}-${Date.now()}`, timestamp: new Date().toISOString() },
      ],
      processStatus: null,
    }))
  },

  toolResult: (msg) => {
    const result = msg.data as { hidden?: boolean }
    if (!result.hidden) useChatStore.getState().addMessage({ type: 'toolResult', data: msg.data })
  },

  toolResultDiffUpdate: (msg) => {
    // Async diff update — patch fileContentAfter into the matching toolResult message
    const update = msg.data as { toolUseId: string; fileContentAfter: string }
    if (!update?.toolUseId) return
    useChatStore.setState((state) => {
      const msgs = state.messages
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].type === 'toolResult') {
          const data = msgs[i].data as Record<string, unknown>
          if (data.toolUseId === update.toolUseId) {
            const updated = [...msgs]
            updated[i] = { ...msgs[i], data: { ...data, fileContentAfter: update.fileContentAfter } }
            return { messages: updated }
          }
        }
      }
      return {}
    })
  },

  diagnosticsAfterEdit: (msg) => {
    const data = msg.data as { filePath: string; diagnostics: unknown[] }
    if (data?.diagnostics?.length) {
      useChatStore.getState().addMessage({ type: 'diagnostics', data })
    }
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
  showClaudeMdBanner: () => { useUIStore.getState().setShowClaudeMdBanner(true) },

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
    const data = msg.data as { thinkingIntensity: string; yoloMode: boolean; maxTurns?: number; disallowedTools?: string[]; selectedModel?: string }
    const validModes = ['fast', 'deep', 'precise']
    if (!validModes.includes(data.thinkingIntensity)) data.thinkingIntensity = 'deep'
    useSettingsStore.getState().updateSettings(data)
    if (data.selectedModel) {
      window.dispatchEvent(new CustomEvent('modelRestored', { detail: { model: data.selectedModel } }))
    }
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

  skillsList: (msg) => {
    useSkillStore.getState().setSkills(msg.data as Record<string, SkillConfig>)
  },

  skillSaveError: (msg) => {
    log.error('Skill save error:', { detail: String(msg.data ?? '') })
  },

  usageUpdate: (msg) => { useUIStore.getState().setUsageData(msg.data as UsageData) },
  usageError: () => {},

  accountInfo: (msg) => {
    const info = msg.data as { subscriptionType: 'pro' | 'max' | undefined }
    useUIStore.getState().setAccountType(info.subscriptionType)
  },

  platformInfo: (msg) => {
    useUIStore.getState().setPlatformInfo(msg.data as { platform: string; isWindows: boolean })
  },

  hooksStatus: (msg) => {
    useUIStore.getState().setHooksStatus(msg.data as { activeCount: number; summary: string[] })
  },

  hookExecution: (msg) => {
    const data = msg.data as { event: string; hook: string; status: 'running' | 'completed' | 'failed'; output?: string }
    if (!data) return
    const statusIcon = data.status === 'running' ? '⚡' : data.status === 'completed' ? '✓' : '✗'
    const label = data.hook || data.event || 'hook'
    const short = label.length > 50 ? label.slice(0, 50) + '...' : label
    const text = `${statusIcon} Hook ${data.status}: ${short}${data.output ? `\n${data.output}` : ''}`
    useChatStore.getState().setProcessStatus({
      status: `hook-${data.status}`,
      detail: text,
    })
    // Auto-clear after 3s for non-failures
    if (data.status !== 'failed') {
      setTimeout(() => {
        const current = useChatStore.getState().processStatus
        if (current?.status?.startsWith('hook-')) {
          useChatStore.getState().setProcessStatus(null)
        }
      }, 3000)
    }
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
    const todosData = msg.data as { todos: unknown }
    if (Array.isArray(todosData?.todos)) {
      useChatStore.getState().updateTodos(todosData.todos as Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }>)
    }
  },

  editorSelection: (msg) => {
    const data = msg.data as { filePath: string; startLine: number; endLine: number; text: string } | null
    window.dispatchEvent(new CustomEvent('editorSelection', { detail: data }))
  },

  activeFileChanged: (msg) => {
    const data = msg.data as { filePath: string; languageId: string } | null
    window.dispatchEvent(new CustomEvent('activeFileChanged', { detail: data }))
  },

  hooksData: (msg) => {
    window.dispatchEvent(new CustomEvent('hooksData', { detail: msg.data }))
  },

  hooksSaved: () => {
    window.dispatchEvent(new CustomEvent('hooksSaved'))
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

  // Auto-scroll when content inside the scroll container changes size
  // Use refs to avoid re-creating observers when state changes
  const autoScrollStateRef = useRef({ isAutoScrollEnabled, isNearBottom, scrollToBottom })
  autoScrollStateRef.current = { isAutoScrollEnabled, isNearBottom, scrollToBottom }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const doScroll = () => {
      const { isAutoScrollEnabled: enabled, isNearBottom: near, scrollToBottom: scroll } = autoScrollStateRef.current
      if (enabled && near) scroll({ behavior: 'instant' })
    }
    const observer = new MutationObserver(doScroll)
    observer.observe(container, { childList: true, subtree: true })
    // Observe the container itself for size changes — no need to observe every child
    const resizeObserver = new ResizeObserver(doScroll)
    resizeObserver.observe(container)
    return () => { observer.disconnect(); resizeObserver.disconnect() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    containerRef, isNearBottom, isAutoScrollEnabled,
    scrollToBottom, enableAutoScroll, disableAutoScroll, toggleAutoScroll, checkIsAtBottom,
  }
}

