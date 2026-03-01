import { useMemo, useState, useCallback, useEffect, useRef, memo, type MutableRefObject } from 'react'
import { useChatStore, type ChatMessage } from '../store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'
import { ErrorBoundary } from './ErrorBoundary'

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS = {
  executing: 'rgba(255, 255, 255, 0.4)',
  completed: 'rgba(255, 255, 255, 0.3)',
  failed: '#e74c3c',
} as const

const STATUS_ICONS = {
  executing: '⟳',
  completed: '✓',
  failed: '✗',
} as const

const STEP_INDICATORS = {
  error: '●',
  done: '●',
  pending: '○',
} as const

// Tool verb mappings for compact Cursor-style display
interface ToolVerbMapping {
  active: string   // Present participle: "Reading", "Editing"
  done: string     // Past tense: "Read", "Edited"
  getDetail: (input: Record<string, unknown>) => string
}

const fileName = (fp: string) => fp.split(/[\\/]/).pop() || fp

const TOOL_VERBS: Record<string, ToolVerbMapping> = {
  Read: { active: 'Reading', done: 'Read', getDetail: (i) => fileName(String(i.file_path || '')) },
  Edit: { active: 'Editing', done: 'Edited', getDetail: (i) => fileName(String(i.file_path || '')) },
  MultiEdit: { active: 'Editing', done: 'Edited', getDetail: (i) => fileName(String(i.file_path || '')) },
  Write: { active: 'Writing', done: 'Wrote', getDetail: (i) => fileName(String(i.file_path || '')) },
  NotebookEdit: { active: 'Editing notebook', done: 'Edited notebook', getDetail: (i) => fileName(String(i.notebook_path || '')) },
  Bash: {
    active: 'Running', done: 'Ran',
    getDetail: (i) => { const c = String(i.command || ''); return c.length > 50 ? c.substring(0, 50) + '…' : c },
  },
  Grep: { active: 'Searching', done: 'Searched', getDetail: (i) => i.pattern ? `"${i.pattern}"` : 'files' },
  Glob: { active: 'Finding files', done: 'Found files', getDetail: (i) => i.pattern ? `"${i.pattern}"` : '' },
  WebFetch: {
    active: 'Fetching', done: 'Fetched',
    getDetail: (i) => { try { return new URL(String(i.url)).hostname } catch { return String(i.url || '').substring(0, 30) } },
  },
  WebSearch: { active: 'Searching web', done: 'Searched web', getDetail: (i) => i.query ? `"${i.query}"` : '' },
  TodoWrite: { active: 'Updating todos', done: 'Updated todos', getDetail: () => '' },
}

function getToolDisplay(toolName: string, rawInput: Record<string, unknown> | undefined, hasResult: boolean, hasError: boolean, planCompleted?: boolean) {
  const mapping = TOOL_VERBS[toolName]
  const detail = rawInput && mapping ? mapping.getDetail(rawInput) : ''

  if (hasError) {
    const verb = mapping ? mapping.done : toolName
    return { icon: '✗', label: detail ? `${verb} ${detail}` : verb, color: STATUS_COLORS.failed }
  }
  if (hasResult || planCompleted) {
    const verb = mapping ? mapping.done : toolName
    return { icon: '✓', label: detail ? `${verb} ${detail}` : verb, color: STATUS_COLORS.completed }
  }
  const verb = mapping ? mapping.active : toolName
  return { icon: '⟳', label: detail ? `${verb} ${detail}…` : `${verb}…`, color: STATUS_COLORS.executing }
}

// ============================================================================
// Types
// ============================================================================

interface ToolStep {
  id: string
  toolUse?: ChatMessage
  toolResult?: ChatMessage
}

interface PlanGroup {
  id: string
  kind: 'plan'
  assistantMessage: ChatMessage
  thinkingMessage?: ChatMessage
  steps: ToolStep[]
  status: 'executing' | 'completed' | 'failed'
}

interface MessageItem {
  kind: 'message'
  message: ChatMessage
}

type TimelineItem = PlanGroup | MessageItem

// ============================================================================
// Utils
// ============================================================================

function buildTimelineItems(messages: ChatMessage[], isProcessing: boolean): TimelineItem[] {
  const timeline: TimelineItem[] = []
  let currentPlan: PlanGroup | null = null

  const flushPlan = () => {
    if (currentPlan) {
      if (currentPlan.steps.some((s) => s.toolResult && (s.toolResult.data as Record<string, unknown>)?.isError)) {
        currentPlan.status = 'failed'
      } else {
        currentPlan.status = 'completed'
      }
      timeline.push(currentPlan)
      currentPlan = null
    }
  }

  for (const msg of messages) {
    switch (msg.type) {
      case 'output': {
        flushPlan()
        currentPlan = { id: msg.id, kind: 'plan', assistantMessage: msg, steps: [], status: 'executing' }
        break
      }
      case 'thinking': {
        if (currentPlan) {
          currentPlan.thinkingMessage = msg
        } else {
          currentPlan = { id: msg.id, kind: 'plan', assistantMessage: msg, steps: [], status: 'executing' }
        }
        break
      }
      case 'toolUse': {
        if (!currentPlan) {
          currentPlan = { id: msg.id, kind: 'plan', assistantMessage: msg, steps: [], status: 'executing' }
        }
        currentPlan.steps.push({ id: msg.id, toolUse: msg })
        break
      }
      case 'toolResult': {
        if (currentPlan && currentPlan.steps.length > 0) {
          const lastStep = currentPlan.steps[currentPlan.steps.length - 1]
          if (lastStep && !lastStep.toolResult) {
            lastStep.toolResult = msg
          } else {
            currentPlan.steps.push({ id: msg.id, toolResult: msg })
          }
        } else {
          if (!currentPlan) {
            currentPlan = { id: msg.id, kind: 'plan', assistantMessage: msg, steps: [], status: 'executing' }
          }
          currentPlan.steps.push({ id: msg.id, toolResult: msg })
        }
        break
      }
      case 'userInput':
      case 'error':
      case 'permissionRequest':
      case 'compactBoundary':
      case 'compacting':
      case 'loading': {
        flushPlan()
        timeline.push({ kind: 'message', message: msg })
        break
      }
      case 'sessionInfo':
        break
      default:
        break
    }
  }

  if (currentPlan) {
    if (isProcessing) {
      currentPlan.status = 'executing'
    } else {
      // Not processing — use same logic as flushPlan
      if (currentPlan.steps.some((s) => s.toolResult && (s.toolResult.data as Record<string, unknown>)?.isError)) {
        currentPlan.status = 'failed'
      } else {
        currentPlan.status = 'completed'
      }
    }
    timeline.push(currentPlan)
  }

  return timeline
}

function getPlanSummary(plan: PlanGroup): string {
  if (plan.assistantMessage.type === 'output') return String(plan.assistantMessage.data).substring(0, 100)
  if (plan.assistantMessage.type === 'thinking') return 'Thinking...'
  return 'Working...'
}

// ============================================================================
// Sub-components
// ============================================================================

function StatusIcon({ status }: { status: 'executing' | 'completed' | 'failed' }) {
  return (
    <span
      style={{
        color: STATUS_COLORS[status],
        fontSize: '12px',
        fontWeight: 500,
        animation: status === 'executing' ? 'spin 1.5s linear infinite' : 'none',
        display: 'inline-block',
      }}
    >
      {STATUS_ICONS[status]}
    </span>
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
  const [secondsSinceActivity, setSecondsSinceActivity] = useState(0)
  const lastActivityAtRef = useRef(Date.now()) as MutableRefObject<number>
  const processStatus = useChatStore((s) => s.processStatus)

  // Track when processStatus changes (heartbeat) — use ref to avoid stale closure
  useEffect(() => {
    if (processStatus) {
      lastActivityAtRef.current = Date.now()
      setSecondsSinceActivity(0)
    }
  }, [processStatus])

  useEffect(() => {
    let tick = 0
    const id = setInterval(() => {
      tick++
      setElapsed(tick)
      setSecondsSinceActivity(Math.floor((Date.now() - lastActivityAtRef.current) / 1000))
      // Rotate phrase every 3 seconds
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

  const hasStarted = processStatus?.status === 'started' || processStatus?.status === 'active'
  const isActive = processStatus?.status === 'active'
  const isStale = secondsSinceActivity > 30

  // Determine status label
  let statusLabel: string
  if (!processStatus) {
    statusLabel = 'Starting...'
  } else if (isStale) {
    statusLabel = 'Waiting for response...'
  } else if (isActive) {
    statusLabel = LOADING_PHRASES[phraseIndex] + '...'
  } else if (hasStarted) {
    statusLabel = 'Connecting...'
  } else {
    statusLabel = LOADING_PHRASES[phraseIndex] + '...'
  }

  return (
    <div className="px-3 py-2 text-xs" style={{ opacity: 0.8 }}>
      <div className="flex items-center gap-3">
        {/* Animated sparkle spinner — pulse faster when active */}
        <div
          style={{
            width: '16px',
            height: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            animation: isActive ? 'loadingSpin 1s linear infinite' : 'loadingSpin 2s linear infinite',
            color: isStale ? 'var(--vscode-editorWarning-foreground, #cca700)' : 'var(--chatui-accent)',
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
          {statusLabel}
        </span>
        <span style={{ opacity: 0.35, fontSize: '10px', fontFamily: 'var(--font-mono, monospace)' }}>{formatTime(elapsed)}</span>
        {/* Activity dot — pulses green when stderr heartbeat is recent */}
        {hasStarted && (
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: isStale ? '#cca700' : '#3fb950',
              animation: isActive ? 'pulse 1s ease infinite' : 'none',
              opacity: isStale ? 0.6 : 0.8,
            }}
          />
        )}
      </div>
      {/* Warning when no activity for 30+ seconds */}
      {isStale && (
        <div
          style={{
            marginTop: '4px',
            marginLeft: '28px',
            fontSize: '10px',
            opacity: 0.5,
            color: 'var(--vscode-editorWarning-foreground, #cca700)',
          }}
        >
          No activity for {formatTime(secondsSinceActivity)} — process may be starting up
        </div>
      )}
    </div>
  )
}

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
    default:
      return null
  }
})

// Subagent type badge colors (keep in sync with ToolUseBlock)
const SUBAGENT_COLORS: Record<string, string> = {
  Bash: '#f59e0b',
  Explore: '#3b82f6',
  Plan: '#8b5cf6',
  'general-purpose': '#10b981',
}

const ToolStepItem = memo(function ToolStepItem({ step, isCollapsed, onToggle, planCompleted }: { step: ToolStep; isCollapsed: boolean; onToggle: (id: string) => void; planCompleted?: boolean }) {
  const toolData = step.toolUse?.data as Record<string, unknown> | undefined
  const toolName = (toolData?.toolName as string) || 'Tool'
  const rawInput = toolData?.rawInput as Record<string, unknown> | undefined
  const hasError = step.toolResult && (step.toolResult.data as Record<string, unknown>)?.isError

  const isSubagent = toolName === 'Task'
  const subagentType = isSubagent ? (rawInput?.subagent_type as string) || 'Agent' : ''
  const subagentDesc = isSubagent ? (rawInput?.description as string) || '' : ''
  const subagentColor = SUBAGENT_COLORS[subagentType] || '#6366f1'

  const hasResult = !!step.toolResult

  // Subagent step — special rendering with colored left border
  if (isSubagent) {
    const effectivelyDone = hasResult || planCompleted
    const indicatorColor = hasError ? STATUS_COLORS.failed : effectivelyDone ? STATUS_COLORS.completed : STATUS_COLORS.executing
    const indicator = hasError ? STEP_INDICATORS.error : effectivelyDone ? STEP_INDICATORS.done : STEP_INDICATORS.pending
    return (
      <div style={{ marginBottom: '4px' }}>
        <button
          onClick={() => onToggle(step.id)}
          className="w-full text-left cursor-pointer border-none text-inherit"
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '4px 8px', borderRadius: 'var(--radius-sm)',
            background: `${subagentColor}08`,
            borderLeft: `2px solid ${subagentColor}60`,
            fontSize: '11px', opacity: 0.85,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
        >
          <span style={{ color: indicatorColor, fontSize: '10px' }}>{indicator}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={subagentColor} strokeWidth="2.5" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          <span style={{ color: subagentColor, fontWeight: 500 }}>{subagentType}</span>
          {subagentDesc && (
            <span className="truncate opacity-50" style={{ fontSize: '10px' }}>{subagentDesc}</span>
          )}
          <span style={{ opacity: 0.4, fontSize: '9px' }}>{isCollapsed ? '▸' : '▾'}</span>
        </button>
        {!isCollapsed && (
          <div style={{ paddingLeft: '20px', borderLeft: `2px solid ${subagentColor}20`, marginLeft: '3px' }}>
            {step.toolUse && <ToolUseBlock data={step.toolUse.data as Record<string, unknown>} />}
            {step.toolResult && <ToolResultBlock data={step.toolResult.data as Record<string, unknown>} />}
          </div>
        )}
      </div>
    )
  }

  // Normal tool step — compact Cursor-style display
  const display = getToolDisplay(toolName, rawInput, hasResult, !!hasError, planCompleted)
  const isExecuting = !hasResult && !planCompleted

  return (
    <div style={{ marginBottom: '2px' }}>
      <button
        onClick={() => onToggle(step.id)}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
          background: 'transparent', fontSize: '11px',
          opacity: hasError ? 0.9 : 0.6,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = hasError ? '0.9' : '0.6' }}
      >
        <span style={{
          color: display.color,
          fontSize: '10px',
          display: 'inline-block',
          animation: isExecuting ? 'spin 1.5s linear infinite' : 'none',
        }}>
          {display.icon}
        </span>
        <span className="truncate" style={{
          fontWeight: isExecuting ? 500 : 400,
          color: hasError ? STATUS_COLORS.failed : 'inherit',
        }}>
          {display.label}
        </span>
        <span style={{ opacity: 0.3, fontSize: '9px', marginLeft: 'auto' }}>
          {isCollapsed ? '▸' : '▾'}
        </span>
      </button>
      {!isCollapsed && (
        <div style={{ paddingLeft: '20px' }}>
          {step.toolUse && <ToolUseBlock data={step.toolUse.data as Record<string, unknown>} />}
          {step.toolResult && <ToolResultBlock data={step.toolResult.data as Record<string, unknown>} />}
        </div>
      )}
    </div>
  )
})

const PlanGroupCard = memo(function PlanGroupCard({ plan, isCollapsed, expandedSteps, onTogglePlan, onToggleStep }: {
  plan: PlanGroup; isCollapsed: boolean; expandedSteps: Set<string>;
  onTogglePlan: (id: string) => void; onToggleStep: (id: string) => void;
}) {
  const summaryText = getPlanSummary(plan)

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => onTogglePlan(plan.id)}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          border: '1px solid transparent',
          transition: 'all 0.2s ease', fontSize: '12px',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <StatusIcon status={plan.status} />
        <span className="flex-1 truncate" style={{ opacity: 0.8 }}>
          {isCollapsed ? summaryText : 'Assistant response'}
        </span>
        {plan.steps.length > 0 && (
          <span style={{ opacity: 0.5, fontSize: '11px' }}>
            {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ opacity: 0.4, fontSize: '10px' }}>{isCollapsed ? '▸' : '▾'}</span>
      </button>

      {!isCollapsed && (
        <div style={{ paddingLeft: '12px', borderLeft: '1px solid rgba(255, 255, 255, 0.06)', marginLeft: '10px', marginTop: '4px' }}>
          {plan.assistantMessage.type === 'output' && (
            <AssistantMessage text={String(plan.assistantMessage.data)} timestamp={plan.assistantMessage.timestamp} isStreaming={plan.status === 'executing'} />
          )}
          {plan.thinkingMessage && <ThinkingBlock text={String(plan.thinkingMessage.data)} />}
          {plan.assistantMessage.type === 'thinking' && !plan.thinkingMessage && (
            <ThinkingBlock text={String(plan.assistantMessage.data)} />
          )}
          {plan.steps.map((step) => (
            <ToolStepItem
              key={step.id}
              step={step}
              isCollapsed={!expandedSteps.has(step.id)}
              onToggle={onToggleStep}
              planCompleted={plan.status === 'completed' || plan.status === 'failed'}
            />
          ))}
        </div>
      )}
    </div>
  )
}, (prev, next) => {
  if (prev.plan !== next.plan || prev.isCollapsed !== next.isCollapsed
    || prev.onTogglePlan !== next.onTogglePlan || prev.onToggleStep !== next.onToggleStep) return false
  // Only re-render if expand state of THIS plan's steps changed
  for (const step of prev.plan.steps) {
    if (prev.expandedSteps.has(step.id) !== next.expandedSteps.has(step.id)) return false
  }
  return true
})

// ============================================================================
// Main Component
// ============================================================================

interface Props {
  messages: ChatMessage[]
  isProcessing: boolean
  onEdit?: (userInputIndex: number, text: string, images: string[] | undefined) => void
}

export function JourneyTimeline({ messages, isProcessing, onEdit }: Props) {
  const [collapsedPlans, setCollapsedPlans] = useState<Set<string>>(new Set())
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set())

  const items = useMemo(() => buildTimelineItems(messages, isProcessing), [messages, isProcessing])

  // Map message IDs to their userInput index (0-based count of userInput messages)
  const userInputIndexMap = useMemo(() => {
    const map = new Map<string, number>()
    let idx = 0
    for (const msg of messages) {
      if (msg.type === 'userInput') {
        map.set(msg.id, idx++)
      }
    }
    return map
  }, [messages])

  // After a batchReplay, auto-collapse all completed plan groups for performance
  const itemsRef = useRef(items)
  itemsRef.current = items
  useEffect(() => {
    const handler = () => {
      const completedIds = itemsRef.current
        .filter((it): it is PlanGroup => it.kind === 'plan' && it.status === 'completed')
        .map((it) => it.id)
      if (completedIds.length > 0) setCollapsedPlans(new Set(completedIds))
    }
    window.addEventListener('batchReplayDone', handler)
    return () => window.removeEventListener('batchReplayDone', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const togglePlan = useCallback((id: string) => {
    setCollapsedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  const toggleStep = useCallback((id: string) => {
    setExpandedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="space-y-2">
      {items.map((item) => {
        if (item.kind === 'message') {
          const uiIdx = item.message.type === 'userInput' ? userInputIndexMap.get(item.message.id) : undefined
          return (
            <ErrorBoundary
              key={item.message.id}
              fallback={
                <div className="p-2 text-xs opacity-60" style={{ color: 'var(--vscode-errorForeground)' }}>
                  [Message render error]
                </div>
              }
            >
              <MessageRenderer
                message={item.message}
                userInputIndex={uiIdx}
                onEdit={onEdit}
                isProcessing={isProcessing}
              />
            </ErrorBoundary>
          )
        }
        return (
          <ErrorBoundary
            key={item.id}
            fallback={
              <div className="p-2 text-xs opacity-60" style={{ color: 'var(--vscode-errorForeground)' }}>
                [Plan render error]
              </div>
            }
          >
            <PlanGroupCard
              plan={item}
              isCollapsed={collapsedPlans.has(item.id)}
              expandedSteps={expandedSteps}
              onTogglePlan={togglePlan}
              onToggleStep={toggleStep}
            />
          </ErrorBoundary>
        )
      })}
    </div>
  )
}
