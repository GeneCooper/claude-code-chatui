import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage } from '../store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'


// ============================================================================
// Types
// ============================================================================

interface TimelineEntryBase {
  id: string
  timestamp: string
}

interface ThinkingEntry extends TimelineEntryBase {
  kind: 'thinking'
  message: ChatMessage
}

interface OutputEntry extends TimelineEntryBase {
  kind: 'output'
  message: ChatMessage
  isStreaming: boolean
}

interface ToolEntry extends TimelineEntryBase {
  kind: 'tool'
  toolUse: ChatMessage
  toolResult?: ChatMessage
  toolName: string
  summary: string
  isRunning: boolean
  isError: boolean
}

interface StandaloneEntry extends TimelineEntryBase {
  kind: 'standalone'
  message: ChatMessage
}

type TimelineEntry = ThinkingEntry | OutputEntry | ToolEntry | StandaloneEntry

// ============================================================================
// Utils
// ============================================================================

function getToolSummary(toolName: string, rawInput?: Record<string, unknown>): string {
  if (!rawInput) return ''
  if (rawInput.command) return String(rawInput.command)
  if (rawInput.file_path) return String(rawInput.file_path)
  if (rawInput.pattern) return String(rawInput.pattern)
  if (rawInput.query) return String(rawInput.query)
  if (rawInput.url) return String(rawInput.url)
  return ''
}

function buildFlatTimeline(messages: ChatMessage[], isProcessing: boolean): TimelineEntry[] {
  const entries: TimelineEntry[] = []
  const pendingTools: ToolEntry[] = []

  for (const msg of messages) {
    switch (msg.type) {
      case 'thinking':
        entries.push({ id: msg.id, kind: 'thinking', timestamp: msg.timestamp, message: msg })
        break

      case 'output':
        entries.push({ id: msg.id, kind: 'output', timestamp: msg.timestamp, message: msg, isStreaming: false })
        break

      case 'toolUse': {
        const toolData = msg.data as Record<string, unknown>
        const toolName = (toolData.toolName as string) || 'Tool'
        const rawInput = toolData.rawInput as Record<string, unknown> | undefined
        const summary = getToolSummary(toolName, rawInput)
        const entry: ToolEntry = {
          id: msg.id, kind: 'tool', timestamp: msg.timestamp,
          toolUse: msg, toolResult: undefined,
          toolName, summary, isRunning: true, isError: false,
        }
        entries.push(entry)
        pendingTools.push(entry)
        break
      }

      case 'toolResult': {
        const resultData = msg.data as Record<string, unknown>
        const isHidden = !!resultData.hidden
        let matched = false
        for (let i = pendingTools.length - 1; i >= 0; i--) {
          if (!pendingTools[i].toolResult) {
            pendingTools[i].toolResult = isHidden ? undefined : msg
            pendingTools[i].isRunning = false
            pendingTools[i].isError = !!resultData.isError
            pendingTools.splice(i, 1)
            matched = true
            break
          }
        }
        if (!matched && !isHidden) {
          entries.push({ id: msg.id, kind: 'standalone', timestamp: msg.timestamp, message: msg })
        }
        break
      }

      case 'sessionInfo':
      case 'todosUpdate':
        break

      default:
        entries.push({ id: msg.id, kind: 'standalone', timestamp: msg.timestamp, message: msg })
        break
    }
  }

  // Patch streaming state
  if (isProcessing) {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]
      if (entry.kind === 'output') {
        entry.isStreaming = true
        break
      }
      if (entry.kind === 'standalone' && entry.message.type === 'loading') continue
      break
    }
  } else {
    // Safety net: when not processing, no tool should show as running
    for (const entry of entries) {
      if (entry.kind === 'tool' && entry.isRunning) {
        entry.isRunning = false
      }
    }
  }

  return entries
}

function getIndicatorStatus(entry: TimelineEntry): 'running' | 'completed' | 'error' | 'neutral' {
  if (entry.kind === 'tool') {
    if (entry.isRunning) return 'running'
    if (entry.isError) return 'error'
    return 'completed'
  }
  if (entry.kind === 'output') return entry.isStreaming ? 'running' : 'completed'
  if (entry.kind === 'thinking') return 'neutral'
  if (entry.kind === 'standalone') {
    if (entry.message.type === 'error') return 'error'
    if (entry.message.type === 'loading') return 'running'
    if (entry.message.type === 'permissionRequest') return 'running'
  }
  return 'neutral'
}

// ============================================================================
// Sub-components
// ============================================================================

const INDICATOR_COLORS = {
  running: 'var(--chatui-accent, #ed6e1d)',
  completed: '#4ade80',
  error: '#e74c3c',
  neutral: 'rgba(255, 255, 255, 0.25)',
} as const

function TimelineIndicator({ status, isLast }: { status: 'running' | 'completed' | 'error' | 'neutral'; isLast: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '20px',
        flexShrink: 0,
        paddingTop: '8px',
      }}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: INDICATOR_COLORS[status],
          flexShrink: 0,
          boxShadow: status === 'running'
            ? `0 0 6px ${INDICATOR_COLORS.running}, 0 0 12px rgba(237, 110, 29, 0.3)`
            : status === 'completed'
              ? `0 0 4px ${INDICATOR_COLORS.completed}`
              : status === 'error'
                ? `0 0 4px ${INDICATOR_COLORS.error}`
                : 'none',
          animation: status === 'running' ? 'indicatorPulse 2s ease-in-out infinite' : 'none',
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
      />
      {!isLast && (
        <div
          style={{
            width: '1px',
            flex: 1,
            minHeight: '8px',
            background: 'rgba(255, 255, 255, 0.08)',
            marginTop: '4px',
          }}
        />
      )}
    </div>
  )
}

function ToolElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [])
  if (elapsed < 2) return null
  const fmt = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`
  return (
    <span style={{ opacity: 0.4, fontSize: '10px', fontFamily: 'var(--font-mono, monospace)', flexShrink: 0 }}>
      {fmt}
    </span>
  )
}

function TimelineToolEntry({ entry, isCollapsed, onToggle }: {
  entry: ToolEntry; isCollapsed: boolean; onToggle: (id: string) => void
}) {
  return (
    <div style={{ animation: 'fadeIn 0.15s ease' }}>
      <button
        onClick={() => onToggle(entry.id)}
        aria-expanded={!isCollapsed}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--chatui-surface-1)',
          border: entry.isRunning
            ? '1px solid rgba(237, 110, 29, 0.2)'
            : entry.isError
              ? '1px solid rgba(231, 76, 60, 0.2)'
              : '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '12px',
          transition: 'all 0.15s ease',
          position: 'relative',
          overflow: 'hidden',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--chatui-surface-2)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--chatui-surface-1)' }}
      >
        {/* Animated progress bar at bottom */}
        {entry.isRunning ? (
          <span
            className="tool-running-bar"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              height: '2px',
            }}
          />
        ) : (entry.toolResult) && (
          <span
            className={entry.isError ? 'tool-error-flash' : 'tool-complete-flash'}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: '100%',
              background: entry.isError ? '#e74c3c' : '#4ade80',
            }}
          />
        )}
        {entry.isRunning && (
          <span
            style={{
              width: '14px', height: '14px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'loadingSpin 1.2s linear infinite',
              color: 'var(--chatui-accent)',
              flexShrink: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 3v3m0 12v3M5.636 5.636l2.121 2.121m8.486 8.486l2.121 2.121M3 12h3m12 0h3M5.636 18.364l2.121-2.121m8.486-8.486l2.121-2.121" />
            </svg>
          </span>
        )}
        <span style={{ fontWeight: 600, fontSize: '12px', opacity: 0.9, flexShrink: 0 }}>
          {entry.toolName}
        </span>
        {entry.summary && (
          <span
            className="truncate"
            style={{
              opacity: 0.45,
              fontFamily: 'var(--font-mono, monospace)',
              fontSize: '11px',
              flex: 1,
              minWidth: 0,
            }}
          >
            {entry.summary}
          </span>
        )}
        {entry.isRunning && <ToolElapsedTimer />}
        <span style={{ opacity: 0.4, fontSize: '9px', flexShrink: 0 }}>
          {isCollapsed ? '\u25B8' : '\u25BE'}
        </span>
      </button>

      {!isCollapsed && (
        <div style={{ paddingLeft: '4px', marginTop: '4px' }}>
          <ToolUseBlock data={entry.toolUse.data as Record<string, unknown>} hideHeader />
          {entry.toolResult && (
            <div style={{ marginTop: '4px' }}>
              <ToolResultBlock data={entry.toolResult.data as Record<string, unknown>} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function TimelineThinkingEntry({ entry, isCollapsed, onToggle }: {
  entry: ThinkingEntry; isCollapsed: boolean; onToggle: (id: string) => void
}) {
  const text = String(entry.message.data)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="overflow-hidden"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <button
        onClick={() => onToggle(entry.id)}
        aria-expanded={!isCollapsed}
        className="flex items-center gap-2 w-full text-left cursor-pointer border-none text-inherit"
        style={{
          padding: '8px 12px',
          background: 'var(--chatui-surface-1)',
          fontSize: '12px',
          opacity: 0.7,
        }}
      >
        <span className={`transition-transform ${!isCollapsed ? 'rotate-90' : ''}`} style={{ fontSize: '10px' }}>&#9654;</span>
        <span style={{ fontStyle: 'italic' }}>Thinking...</span>
        <span className="ml-auto text-[10px] opacity-50">
          {text.length > 100 ? `${Math.ceil(text.length / 4)} words` : ''}
        </span>
      </button>
      {!isCollapsed && (
        <div className="relative" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <button
            onClick={handleCopy}
            className="absolute right-2 top-1 opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px] z-10"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <div
            className="text-xs whitespace-pre-wrap max-h-60 overflow-y-auto"
            style={{ padding: '8px 12px', opacity: 0.7, fontStyle: 'italic' }}
          >
            {text}
          </div>
        </div>
      )}
    </div>
  )
}

const LOADING_PHRASES = [
  'Analyzing',
  'Thinking',
  'Reasoning',
  'Puzzling',
  'Pondering',
  'Processing',
  'Working',
  'Considering',
  'Exploring',
  'Evaluating',
]

function LoadingIndicator() {
  const [elapsed, setElapsed] = useState(0)
  const [phraseIndex, setPhraseIndex] = useState(0)
  const [fadeClass, setFadeClass] = useState(true)

  useEffect(() => {
    let tick = 0
    const id = setInterval(() => {
      tick++
      setElapsed(tick)
      if (tick % 3 === 0) {
        setFadeClass(false)
        setTimeout(() => {
          setPhraseIndex((i) => (i + 1) % LOADING_PHRASES.length)
          setFadeClass(true)
        }, 200)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [])

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        background: 'var(--chatui-surface-1)',
        border: '1px solid rgba(237, 110, 29, 0.2)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div className="flex items-center gap-3 px-3 py-2 text-xs" style={{ opacity: 0.8 }}>
        <div
          style={{
            width: '16px', height: '16px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'loadingSpin 1.2s linear infinite',
            color: 'var(--chatui-accent)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v3m0 12v3M5.636 5.636l2.121 2.121m8.486 8.486l2.121 2.121M3 12h3m12 0h3M5.636 18.364l2.121-2.121m8.486-8.486l2.121-2.121" />
          </svg>
        </div>
        <span
          style={{
            minWidth: '100px',
            transition: 'opacity 0.2s ease',
            opacity: fadeClass ? 1 : 0,
            fontWeight: 500,
          }}
        >
          {LOADING_PHRASES[phraseIndex]}...
        </span>
        <span style={{ opacity: 0.35, fontSize: '10px', fontFamily: 'var(--font-mono, monospace)' }}>{formatTime(elapsed)}</span>
      </div>
      {/* Animated progress bar at bottom — same style as tool entries */}
      <span
        className="tool-running-bar"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: '2px',
        }}
      />
    </div>
  )
}

function MessageRenderer({ message, userInputIndex, onEdit, isProcessing }: {
  message: ChatMessage
  userInputIndex?: number
  onEdit?: (index: number, newText: string) => void
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
          onEdit={userInputIndex !== undefined && onEdit ? (newText: string) => onEdit(userInputIndex, newText) : undefined}
          isProcessing={isProcessing}
        />
      )
    }
    case 'error':
      return (
        <div className="px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))', borderColor: 'var(--vscode-inputValidation-errorBorder, #be1100)' }}>
          {String(message.data)}
        </div>
      )
    case 'loading':
      return <LoadingIndicator />
    case 'compacting':
      return (message.data as { isCompacting: boolean }).isCompacting ? (
        <div className="text-center text-xs opacity-50 py-1">Compacting conversation...</div>
      ) : null
    case 'compactBoundary':
      return (
        <div className="text-center text-xs opacity-40 py-1 border-t border-dashed border-(--vscode-panel-border)">
          Conversation compacted
        </div>
      )
    case 'permissionRequest':
      return <PermissionDialog data={message.data as Record<string, unknown>} />
    default:
      return null
  }
}

// ============================================================================
// Main Component
// ============================================================================

interface Props {
  messages: ChatMessage[]
  isProcessing: boolean
  onEdit?: (userInputIndex: number, newText: string) => void
}

export function JourneyTimeline({ messages, isProcessing, onEdit }: Props) {
  const [collapsedEntries, setCollapsedEntries] = useState<Set<string>>(new Set())
  const manuallyExpandedRef = useRef<Set<string>>(new Set())

  const entries = useMemo(() => buildFlatTimeline(messages, isProcessing), [messages, isProcessing])

  const userInputIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const msg of messages) {
      if (msg.type === 'userInput') map.set(msg.id, idx++)
    }
    return map
  }, [messages])

  // Auto-collapse on batchReplayDone
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  useEffect(() => {
    const handler = () => {
      const idsToCollapse = entriesRef.current
        .filter((e) => {
          if (e.kind === 'tool' && !e.isRunning) return true
          if (e.kind === 'thinking') return true
          return false
        })
        .map((e) => e.id)
      if (idsToCollapse.length > 0) setCollapsedEntries(new Set(idsToCollapse))
    }
    window.addEventListener('batchReplayDone', handler)
    return () => window.removeEventListener('batchReplayDone', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  const toggleEntry = useCallback((id: string) => {
    setCollapsedEntries((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        manuallyExpandedRef.current.add(id)
      } else {
        next.add(id)
        manuallyExpandedRef.current.delete(id)
      }
      return next
    })
  }, [])

  function renderEntry(entry: TimelineEntry) {
    switch (entry.kind) {
      case 'thinking':
        return (
          <TimelineThinkingEntry
            entry={entry}
            isCollapsed={collapsedEntries.has(entry.id)}
            onToggle={toggleEntry}
          />
        )
      case 'output':
        return (
          <AssistantMessage
            text={String(entry.message.data)}
            timestamp={entry.message.timestamp}
            isStreaming={entry.isStreaming}
          />
        )
      case 'tool':
        return (
          <TimelineToolEntry
            entry={entry}
            isCollapsed={collapsedEntries.has(entry.id)}
            onToggle={toggleEntry}
          />
        )
      case 'standalone':
        return (
          <MessageRenderer
            message={entry.message}
            userInputIndex={entry.message.type === 'userInput' ? userInputIndexMap.get(entry.message.id) : undefined}
            onEdit={onEdit}
            isProcessing={isProcessing}
          />
        )
    }
  }

  // Show bottom loading when processing but nothing is actively streaming or running
  const showBottomLoading = useMemo(() => {
    if (!isProcessing) return false
    // Don't show if there's already a loading standalone entry visible
    const lastEntry = entries[entries.length - 1]
    if (!lastEntry) return true
    if (lastEntry.kind === 'standalone' && lastEntry.message.type === 'loading') return false
    if (lastEntry.kind === 'output' && lastEntry.isStreaming) return false
    if (lastEntry.kind === 'tool' && lastEntry.isRunning) return false
    return true
  }, [isProcessing, entries])

  return (
    <div className="space-y-1">
      {entries.map((entry, index) => {
        const isLast = index === entries.length - 1 && !showBottomLoading

        // UserInput renders without timeline indicator (right-aligned bubble)
        if (entry.kind === 'standalone' && entry.message.type === 'userInput') {
          return (
            <div key={entry.id} style={{ paddingLeft: '28px', paddingTop: '8px', paddingBottom: '4px' }}>
              <MessageRenderer
                message={entry.message}
                userInputIndex={userInputIndexMap.get(entry.message.id)}
                onEdit={onEdit}
                isProcessing={isProcessing}
              />
            </div>
          )
        }

        const indicatorStatus = getIndicatorStatus(entry)

        return (
          <div key={entry.id} style={{ display: 'flex', gap: '8px', minHeight: '28px' }}>
            <TimelineIndicator status={indicatorStatus} isLast={isLast} />
            <div style={{ flex: 1, minWidth: 0, paddingBottom: '4px' }}>
              {renderEntry(entry)}
            </div>
          </div>
        )
      })}

      {showBottomLoading && (
        <div style={{ display: 'flex', gap: '8px', minHeight: '28px' }}>
          <TimelineIndicator status="running" isLast />
          <div style={{ flex: 1, minWidth: 0, paddingBottom: '4px' }}>
            <LoadingIndicator />
          </div>
        </div>
      )}
    </div>
  )
}
