import { useMemo, useState, useCallback, useEffect, useRef, memo, type MutableRefObject } from 'react'
import { useChatStore, type ChatMessage } from '../store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'
import { ErrorBoundary } from './ErrorBoundary'
import { DiffView } from './DiffView'
import { SUBAGENT_COLORS, FILE_EDIT_TOOLS } from '../../shared/constants'
import { postMessage } from '../hooks'

// ============================================================================
// Constants
// ============================================================================

const fileName = (fp: string) => fp.split(/[\\/]/).pop() || fp

const TOOL_VERBS: Record<string, { active: string; done: string; getDetail: (i: Record<string, unknown>) => string }> = {
  Read: { active: 'Reading', done: 'Read', getDetail: (i) => fileName(String(i.file_path || '')) },
  Edit: { active: 'Editing', done: 'Edited', getDetail: (i) => fileName(String(i.file_path || '')) },
  MultiEdit: { active: 'Editing', done: 'Edited', getDetail: (i) => fileName(String(i.file_path || '')) },
  Write: { active: 'Writing', done: 'Wrote', getDetail: (i) => fileName(String(i.file_path || '')) },
  NotebookEdit: { active: 'Editing notebook', done: 'Edited notebook', getDetail: (i) => fileName(String(i.notebook_path || '')) },
  Bash: {
    active: 'Running', done: 'Ran',
    getDetail: (i) => { const c = String(i.command || ''); return c.length > 80 ? c.substring(0, 80) + '…' : c },
  },
  Grep: {
    active: 'Searching', done: 'Searched',
    getDetail: (i) => {
      const parts: string[] = []
      if (i.pattern) parts.push(`"${i.pattern}"`)
      if (i.path) parts.push(`in ${fileName(String(i.path))}`)
      return parts.join(' ') || 'files'
    },
  },
  Glob: { active: 'Finding files', done: 'Found files', getDetail: (i) => i.pattern ? `"${i.pattern}"` : '' },
  WebFetch: {
    active: 'Fetching', done: 'Fetched',
    getDetail: (i) => { try { return new URL(String(i.url)).hostname } catch { return String(i.url || '').substring(0, 30) } },
  },
  WebSearch: { active: 'Searching web', done: 'Searched web', getDetail: (i) => i.query ? `"${i.query}"` : '' },
  TodoWrite: { active: 'Updating todos', done: 'Updated todos', getDetail: () => '' },
  TodoRead: { active: 'Reading todos', done: 'Read todos', getDetail: () => '' },
  Agent: { active: 'Running agent', done: 'Agent completed', getDetail: (i) => i.description ? String(i.description) : '' },
  Task: { active: 'Running agent', done: 'Agent completed', getDetail: (i) => i.description ? String(i.description) : '' },
}

// ============================================================================
// Types
// ============================================================================

interface ToolPair {
  kind: 'tool'
  id: string
  toolUse: ChatMessage
  toolResult?: ChatMessage
  duration?: number
}

interface MessageItem {
  kind: 'message'
  message: ChatMessage
}

type ChainItem = ToolPair | MessageItem

// ============================================================================
// Chain Builder — flat linear sequence with tool pairing
// ============================================================================

function buildChainItems(messages: ChatMessage[]): ChainItem[] {
  const chain: ChainItem[] = []

  // Index toolResults by toolUseId for O(1) matching
  const resultMap = new Map<string, ChatMessage>()
  for (const msg of messages) {
    if (msg.type === 'toolResult') {
      const data = msg.data as Record<string, unknown>
      const toolUseId = data?.toolUseId as string | undefined
      if (toolUseId) resultMap.set(toolUseId, msg)
    }
  }

  const matchedResults = new Set<string>()

  for (const msg of messages) {
    switch (msg.type) {
      case 'toolUse': {
        const data = msg.data as Record<string, unknown>
        const toolUseId = data?.toolUseId as string | undefined
        const result = toolUseId ? resultMap.get(toolUseId) : undefined
        if (result) matchedResults.add(result.id)

        let duration: number | undefined
        if (result) {
          const dt = new Date(result.timestamp).getTime() - new Date(msg.timestamp).getTime()
          if (dt >= 0 && dt < 3600000) duration = Math.round(dt / 100) / 10
        }

        chain.push({ kind: 'tool', id: msg.id, toolUse: msg, toolResult: result, duration })
        break
      }
      case 'toolResult': {
        // Orphan result (not matched to any toolUse) — render standalone
        if (!matchedResults.has(msg.id)) {
          chain.push({ kind: 'message', message: msg })
        }
        break
      }
      case 'sessionInfo':
      case 'todosUpdate':
        break
      default:
        chain.push({ kind: 'message', message: msg })
    }
  }

  return chain
}

// ============================================================================
// Search helper
// ============================================================================

function matchesSearch(item: ChainItem, query: string): boolean {
  if (!query) return true
  const q = query.toLowerCase()
  if (item.kind === 'message') {
    const text = String(item.message.data || '')
    if (item.message.type === 'userInput') {
      const ud = item.message.data as { text: string } | string
      const uText = typeof ud === 'string' ? ud : ud.text
      return uText.toLowerCase().includes(q)
    }
    return text.toLowerCase().includes(q)
  }
  if (item.kind === 'tool') {
    const useData = item.toolUse.data as Record<string, unknown>
    const toolName = String(useData?.toolName || '')
    const rawInput = useData?.rawInput as Record<string, unknown> | undefined
    const resultContent = String((item.toolResult?.data as Record<string, unknown>)?.content || '')
    return toolName.toLowerCase().includes(q)
      || JSON.stringify(rawInput || {}).toLowerCase().includes(q)
      || resultContent.toLowerCase().includes(q)
  }
  return true
}

// ============================================================================
// Loading Indicator
// ============================================================================

const LOADING_PHRASES = ['Analyzing', 'Thinking', 'Reasoning', 'Puzzling', 'Pondering', 'Processing', 'Working', 'Considering', 'Exploring', 'Evaluating']

function LoadingIndicator() {
  const [elapsed, setElapsed] = useState(0)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [fadeClass, setFadeClass] = useState(true)
  const [secondsSinceActivity, setSecondsSinceActivity] = useState(0)
  const lastActivityAtRef = useRef(Date.now()) as MutableRefObject<number>
  const processStatus = useChatStore((s) => s.processStatus)

  useEffect(() => {
    if (processStatus) {
      lastActivityAtRef.current = Date.now()
      setSecondsSinceActivity(0)
    }
  }, [processStatus])

  useEffect(() => {
    let tick = 0
    let phraseTimeout: ReturnType<typeof setTimeout> | null = null
    const id = setInterval(() => {
      tick++
      setElapsed(tick)
      setSecondsSinceActivity(Math.floor((Date.now() - lastActivityAtRef.current) / 1000))
      if (tick % 3 === 0) {
        setFadeClass(false)
        phraseTimeout = setTimeout(() => {
          setPhraseIndex((i) => (i + 1) % LOADING_PHRASES.length)
          setFadeClass(true)
        }, 200)
      }
    }, 1000)
    return () => { clearInterval(id); if (phraseTimeout) clearTimeout(phraseTimeout) }
  }, [])

  const formatTime = (s: number) => s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`

  const hasStarted = processStatus?.status === 'started' || processStatus?.status === 'active'
  const isActive = processStatus?.status === 'active'
  const isStale = secondsSinceActivity > 30
  const isHookEvent = processStatus?.status?.startsWith('hook-')
  const hookDetail = isHookEvent ? processStatus?.detail : null

  let statusLabel: string
  if (!processStatus) statusLabel = 'Starting...'
  else if (isStale) statusLabel = 'Waiting for response...'
  else if (isActive) statusLabel = LOADING_PHRASES[phraseIndex] + '...'
  else if (hasStarted) statusLabel = 'Connecting...'
  else statusLabel = LOADING_PHRASES[phraseIndex] + '...'

  return (
    <div className="px-3 py-2 text-xs" style={{ opacity: 0.8 }} role="status" aria-live="polite" aria-label="Processing">
      <div className="flex items-center gap-3">
        <div style={{
          width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: isActive ? 'loadingSpin 1s linear infinite' : 'loadingSpin 2s linear infinite',
          color: isStale ? 'var(--status-warning)' : 'var(--chatui-accent)',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3m0 12v3M5.636 5.636l2.121 2.121m8.486 8.486l2.121 2.121M3 12h3m12 0h3M5.636 18.364l2.121-2.121m8.486-8.486l2.121-2.121" />
          </svg>
        </div>
        <span style={{ minWidth: '100px', transition: 'opacity 0.2s ease', opacity: fadeClass ? 1 : 0, fontWeight: 500, lineHeight: '16px' }}>
          {statusLabel}
        </span>
        <span style={{ opacity: 0.35, fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', lineHeight: '16px' }}>{formatTime(elapsed)}</span>
        {hasStarted && (
          <span style={{
            width: '6px', height: '6px', borderRadius: '50%',
            backgroundColor: isStale ? 'var(--status-warning)' : 'var(--status-success)',
            animation: isActive ? 'pulse 1s ease infinite' : 'none',
            opacity: isStale ? 0.6 : 0.8,
          }} />
        )}
      </div>
      {isStale && (
        <div style={{ marginTop: '4px', marginLeft: '28px', fontSize: '10px', opacity: 0.5, color: 'var(--status-warning)' }}>
          No activity for {formatTime(secondsSinceActivity)} — process may be starting up
        </div>
      )}
      {hookDetail && (
        <div style={{
          marginTop: '4px', marginLeft: '28px', fontSize: '10px', opacity: 0.7,
          color: processStatus?.status === 'hook-failed' ? 'var(--status-error)' : 'var(--status-success)',
          fontFamily: 'var(--vscode-editor-font-family, monospace)', whiteSpace: 'pre-wrap',
        }}>
          {hookDetail}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Live Elapsed Timer — shows real-time duration for executing tools
// ============================================================================

function LiveElapsedTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const start = new Date(startTime).getTime()
    const update = () => setElapsed(Math.floor((Date.now() - start) / 1000))
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [startTime])

  // Only show after 2 seconds to avoid flicker for fast tools
  if (elapsed < 2) return null

  const display = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m${elapsed % 60}s`

  return (
    <span style={{
      opacity: 0.4, fontSize: '9px',
      fontFamily: 'var(--tool-font-mono)',
      lineHeight: '16px',
      fontVariantNumeric: 'tabular-nums',
    }}>
      {display}
    </span>
  )
}

// ============================================================================
// Error Type Detection — classifies errors for specialized rendering
// ============================================================================

type ErrorType = 'generic' | 'permission' | 'file-not-found' | 'command-failed' | 'rate-limit'

function classifyError(errorText: string): ErrorType {
  const lower = errorText.toLowerCase()
  if (/permission denied|not allowed|requires approval|user denied/i.test(lower)) return 'permission'
  if (/no such file|file not found|enoent|does not exist|path not found/i.test(lower)) return 'file-not-found'
  if (/exit code|exited with|command failed|non-zero|returned \d+/i.test(lower)) return 'command-failed'
  if (/rate limit|too many requests|429|quota exceeded|usage limit/i.test(lower)) return 'rate-limit'
  return 'generic'
}

function getErrorIcon(type: ErrorType): string {
  switch (type) {
    case 'permission': return '🔒'
    case 'file-not-found': return '📄'
    case 'command-failed': return '⚠'
    case 'rate-limit': return '⏳'
    default: return '✗'
  }
}

// ============================================================================
// Tool Block — compact inline tool display with optional expansion
// ============================================================================

const ToolBlock = memo(function ToolBlock({ item, isExpanded, onToggle }: {
  item: ToolPair
  isExpanded: boolean
  onToggle: (id: string) => void
}) {
  const useData = item.toolUse.data as Record<string, unknown>
  const toolName = (useData?.toolName as string) || 'Tool'
  const rawInput = useData?.rawInput as Record<string, unknown> | undefined
  const resultData = item.toolResult?.data as Record<string, unknown> | undefined
  const isError = !!resultData?.isError
  const isHidden = !!resultData?.hidden
  const hasResult = !!item.toolResult

  const isSubagent = toolName === 'Task'
  const subagentType = isSubagent ? (rawInput?.subagent_type as string) || 'Agent' : ''
  const subagentDesc = isSubagent ? (rawInput?.description as string) || '' : ''
  const subagentColor = SUBAGENT_COLORS[subagentType] || '#6366f1'

  // Display info
  const mapping = TOOL_VERBS[toolName]
  const detail = rawInput && mapping ? mapping.getDetail(rawInput) : ''
  const verb = hasResult ? (mapping?.done || toolName) : (mapping?.active || toolName)
  const isExecuting = !hasResult
  const errorType = isError ? classifyError(String(resultData?.content || '')) : undefined
  const icon = isError ? getErrorIcon(errorType!) : hasResult ? '✓' : '⟳'
  const iconColor = isError ? 'var(--status-error)' : hasResult ? 'var(--status-icon-done)' : 'var(--status-icon-pending)'

  // Auto-expand errors and edit tools with diffs (always show diff content)
  const isEditWithDiff = FILE_EDIT_TOOLS.includes(toolName) && resultData?.fileContentBefore !== undefined && resultData?.fileContentAfter !== undefined
  const effectiveExpanded = isError || isExpanded || isEditWithDiff

  // Duration display
  const durationStr = item.duration != null ? `${item.duration}s` : null

  // Hidden tools (Read, TodoWrite): ultra-compact one-liner
  if (isHidden && !isError) {
    return (
      <div className="flex items-center gap-1.5" style={{ padding: '1px 8px', fontSize: '11px', opacity: 0.35, lineHeight: '16px' }}>
        <span style={{ color: iconColor, fontSize: '9px' }} className={isExecuting ? 'tool-executing-icon' : undefined}>{icon}</span>
        <span>{verb} {detail}</span>
        {isExecuting && <LiveElapsedTimer startTime={item.toolUse.timestamp} />}
        {durationStr && <span style={{ fontSize: '9px', opacity: 0.6, fontFamily: 'var(--tool-font-mono)', lineHeight: '16px' }}>{durationStr}</span>}
      </div>
    )
  }

  // Subagent tool — colored left border, inline
  if (isSubagent) {
    return (
      <div
        data-error={isError || undefined}
        style={{ marginBottom: '4px', borderLeft: `2px solid ${subagentColor}40`, paddingLeft: '10px' }}
      >
        <button
          onClick={() => onToggle(item.id)}
          className="w-full text-left cursor-pointer border-none text-inherit"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 4px', background: 'transparent',
            fontSize: '11px', opacity: 0.85,
            transition: 'opacity 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
        >
          <span style={{ color: iconColor, fontSize: '10px', display: 'inline-block' }} className={isExecuting ? 'tool-executing-icon' : undefined}>{icon}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={subagentColor} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          <span style={{ color: subagentColor, fontWeight: 500 }}>{subagentType}</span>
          {subagentDesc && <span className="truncate opacity-50" style={{ fontSize: '10px' }}>{subagentDesc}</span>}
          {isExecuting && <LiveElapsedTimer startTime={item.toolUse.timestamp} />}
          {durationStr && <span style={{ opacity: 0.3, fontSize: '9px', fontFamily: 'var(--tool-font-mono)', lineHeight: '16px' }}>{durationStr}</span>}
          <span style={{ opacity: 0.4, fontSize: '9px', marginLeft: 'auto', lineHeight: '16px' }}>{effectiveExpanded ? '▾' : '▸'}</span>
        </button>
        {effectiveExpanded && (
          <div style={{ paddingLeft: '8px' }}>
            <ToolUseBlock data={useData} />
            {item.toolResult && <ToolResultBlock data={resultData!} />}
          </div>
        )}
      </div>
    )
  }

  // Edit tool with diff — render DiffView directly, no wrapper layers
  if (isEditWithDiff && hasResult && resultData) {
    return (
      <div data-error={isError || undefined} style={{ marginBottom: '2px' }}>
        <DiffView
          oldContent={resultData.fileContentBefore as string}
          newContent={resultData.fileContentAfter as string}
          filePath={(rawInput?.file_path as string) || ''}
          startLine={resultData.startLine as number | undefined}
          startLines={resultData.startLines as number[] | undefined}
        />
      </div>
    )
  }

  // Normal tool — compact header + expandable detail
  return (
    <div data-error={isError || undefined} style={{ marginBottom: '2px' }}>
      <button
        onClick={() => onToggle(item.id)}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          background: isError ? 'var(--status-error-bg)' : 'transparent',
          fontSize: '11px', lineHeight: '16px',
          opacity: isError ? 0.9 : 0.6,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = isError ? '0.9' : '0.6' }}
      >
        <span
          style={{ color: iconColor, fontSize: '10px', display: 'inline-block' }}
          className={isExecuting ? 'tool-executing-icon' : (hasResult ? (isError ? 'tool-complete-error' : 'tool-complete-success') : undefined)}
        >{icon}</span>
        <span className="truncate" style={{
          fontWeight: isExecuting ? 500 : 400,
          color: isError ? 'var(--status-error)' : 'inherit',
        }}>
          {verb} {detail}
        </span>
        {isExecuting && <LiveElapsedTimer startTime={item.toolUse.timestamp} />}
        {durationStr && (
          <span style={{ opacity: 0.3, fontSize: '9px', fontFamily: 'var(--tool-font-mono)', lineHeight: '16px' }}>{durationStr}</span>
        )}
        <span style={{ opacity: 0.3, fontSize: '9px', marginLeft: 'auto', lineHeight: '16px' }}>
          {effectiveExpanded ? '▾' : '▸'}
        </span>
      </button>
      {effectiveExpanded && (
        <div style={{ paddingLeft: '20px' }}>
          <ToolUseBlock data={useData} />
          {item.toolResult && <ToolResultBlock data={resultData!} />}
        </div>
      )}
    </div>
  )
})

// ============================================================================
// Message Renderer — handles non-tool message types
// ============================================================================

const MessageRenderer = memo(function MessageRenderer({ message, userInputIndex, onEdit, isProcessing }: {
  message: ChatMessage
  userInputIndex?: number
  onEdit?: (index: number, text: string, images: string[] | undefined) => void
  isProcessing?: boolean
}) {
  switch (message.type) {
    case 'userInput': {
      const ud = message.data as { text: string; images?: string[] } | string
      const uText = typeof ud === 'string' ? ud : ud.text
      const uImages = typeof ud === 'string' ? undefined : ud.images
      return (
        <UserMessage
          text={uText}
          images={uImages}
          onEdit={userInputIndex !== undefined && onEdit ? () => onEdit(userInputIndex, uText, uImages) : undefined}
          isProcessing={isProcessing}
        />
      )
    }
    case 'error': {
      const errorText = String(message.data)
      const errType = classifyError(errorText)
      const errIcon = getErrorIcon(errType)
      // Extract exit code for command failures
      const exitCodeMatch = errType === 'command-failed' ? errorText.match(/(?:exit code|exited with|returned)\s*(\d+)/i) : null
      // Extract file path for file-not-found
      const filePathMatch = errType === 'file-not-found' ? errorText.match(/(?:file|path)[:\s]*["']?([^\s"']+)["']?/i) : null
      return (
        <div
          data-error="true"
          className={`error-block error-block--${errType} px-3 py-2 text-sm`}
        >
          <div className="flex items-start gap-2">
            <span style={{ fontSize: '13px', flexShrink: 0, lineHeight: '20px' }}>{errIcon}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{errorText}</div>
              {errType === 'command-failed' && exitCodeMatch && (
                <div className="flex items-center gap-2 mt-1" style={{ fontSize: '11px', opacity: 0.7 }}>
                  <span style={{
                    padding: '1px 6px', borderRadius: '3px',
                    background: 'var(--status-error-bg)',
                    fontFamily: 'var(--tool-font-mono)',
                    color: 'var(--status-error)',
                  }}>
                    exit {exitCodeMatch[1]}
                  </span>
                </div>
              )}
              {errType === 'file-not-found' && filePathMatch && (
                <button
                  onClick={() => postMessage({ type: 'openFile', filePath: filePathMatch[1] })}
                  className="mt-1.5 cursor-pointer border-none text-[11px]"
                  style={{
                    padding: '2px 8px', borderRadius: '4px',
                    background: 'var(--chatui-accent-subtle)',
                    color: 'var(--chatui-accent)',
                    fontWeight: 500,
                  }}
                >
                  Open path in editor
                </button>
              )}
              {errType === 'rate-limit' && (
                <div className="mt-1" style={{ fontSize: '11px', opacity: 0.7, color: 'var(--status-warning)' }}>
                  Usage limit reached — please wait before retrying
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
    case 'loading':
      return <LoadingIndicator />
    case 'compacting':
      return (message.data as { isCompacting: boolean }).isCompacting ? (
        <div className="text-center text-xs opacity-50 py-1">Compacting conversation...</div>
      ) : null
    case 'compactBoundary': {
      const compactData = message.data as { trigger?: string; preTokens?: number }
      const preTokens = compactData?.preTokens
      const trigger = compactData?.trigger
      return (
        <div className="text-center text-xs py-2 border-t border-dashed border-(--vscode-panel-border)" style={{ opacity: 0.5 }}>
          <span style={{ color: 'var(--chatui-accent, #7c6fe0)' }}>Context compacted</span>
          {preTokens != null && preTokens > 0 && (
            <span style={{ opacity: 0.7 }}>{' · '}{preTokens >= 1000 ? `${(preTokens / 1000).toFixed(1)}K` : preTokens} tokens compressed</span>
          )}
          {trigger && <span style={{ opacity: 0.5 }}>{' · '}{trigger}</span>}
        </div>
      )
    }
    case 'permissionRequest':
      return <PermissionDialog data={message.data as Record<string, unknown>} />
    case 'toolResult':
      // Orphan toolResult (not matched to any toolUse)
      return <ToolResultBlock data={message.data as Record<string, unknown>} />
    default:
      return null
  }
})

// ============================================================================
// Main Component
// ============================================================================

interface Props {
  messages: ChatMessage[]
  isProcessing: boolean
  onEdit?: (userInputIndex: number, text: string, images: string[] | undefined) => void
  searchQuery?: string
}

const VISIBLE_WINDOW_SIZE = 50

export function JourneyTimeline({ messages, isProcessing, onEdit, searchQuery = '' }: Props) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [showAll, setShowAll] = useState(false)

  const items = useMemo(() => buildChainItems(messages), [messages])

  const visibleItems = useMemo(() => {
    if (showAll || items.length <= VISIBLE_WINDOW_SIZE) return items
    return items.slice(-VISIBLE_WINDOW_SIZE)
  }, [items, showAll])

  // Find the last output message ID for streaming detection
  const lastOutputId = useMemo(() => {
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i]
      if (it.kind === 'message' && it.message.type === 'output') return it.message.id
    }
    return null
  }, [items])

  // Map message IDs to userInput index
  const userInputIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const msg of messages) {
      if (msg.type === 'userInput') map.set(msg.id, idx++)
    }
    return map
  }, [messages])

  const toggleItem = useCallback((id: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const hiddenCount = items.length - visibleItems.length
  const normalizedSearch = searchQuery.trim().toLowerCase()

  return (
    <div className="space-y-2">
      {hiddenCount > 0 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full text-center cursor-pointer border-none"
          style={{
            padding: '6px 12px', fontSize: '11px',
            color: 'var(--vscode-textLink-foreground)',
            background: 'rgba(128, 128, 128, 0.08)',
            borderRadius: '6px', opacity: 0.8,
          }}
        >
          Show {hiddenCount} earlier messages
        </button>
      )}

      {visibleItems.map((item) => {
        const dimmed = normalizedSearch && !matchesSearch(item, normalizedSearch)

        if (item.kind === 'tool') {
          return (
            <ErrorBoundary
              key={item.id}
              fallback={<div className="p-2 text-xs opacity-60" style={{ color: 'var(--vscode-errorForeground)' }}>[Tool render error]</div>}
            >
              <div style={{ opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}>
                <ToolBlock item={item} isExpanded={expandedItems.has(item.id)} onToggle={toggleItem} />
              </div>
            </ErrorBoundary>
          )
        }

        const msg = item.message

        // Output (assistant text) — render directly with streaming detection
        if (msg.type === 'output') {
          return (
            <ErrorBoundary
              key={msg.id}
              fallback={<div className="p-2 text-xs opacity-60" style={{ color: 'var(--vscode-errorForeground)' }}>[Message render error]</div>}
            >
              <div style={{ opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}>
                <AssistantMessage text={String(msg.data)} timestamp={msg.timestamp} isStreaming={isProcessing && msg.id === lastOutputId} />
              </div>
            </ErrorBoundary>
          )
        }

        // Thinking — render directly
        if (msg.type === 'thinking') {
          return (
            <ErrorBoundary
              key={msg.id}
              fallback={<div className="p-2 text-xs opacity-60" style={{ color: 'var(--vscode-errorForeground)' }}>[Thinking render error]</div>}
            >
              <div style={{ opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}>
                <ThinkingBlock text={String(msg.data)} />
              </div>
            </ErrorBoundary>
          )
        }

        // Other message types
        const uiIdx = msg.type === 'userInput' ? userInputIndexMap.get(msg.id) : undefined
        return (
          <ErrorBoundary
            key={msg.id}
            fallback={<div className="p-2 text-xs opacity-60" style={{ color: 'var(--vscode-errorForeground)' }}>[Message render error]</div>}
          >
            <div style={{ opacity: dimmed ? 0.15 : 1, transition: 'opacity 0.2s' }}>
              <MessageRenderer message={msg} userInputIndex={uiIdx} onEdit={onEdit} isProcessing={isProcessing} />
            </div>
          </ErrorBoundary>
        )
      })}
    </div>
  )
}
