import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import type { ChatMessage } from '../store'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'
import { RestorePoint } from './RestorePoint'

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
      } else if (currentPlan.steps.every((s) => s.toolResult)) {
        currentPlan.status = 'completed'
      } else {
        currentPlan.status = 'executing'
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
      case 'restorePoint':
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

  useEffect(() => {
    let tick = 0
    const id = setInterval(() => {
      tick++
      setElapsed(tick)
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

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 text-xs"
      style={{ opacity: 0.8 }}
    >
      {/* Animated sparkle spinner */}
      <div
        style={{
          width: '16px',
          height: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'loadingSpin 2s linear infinite',
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
  )
}

function MessageRenderer({ message, userInputIndex, onFork, onRewind, isProcessing }: {
  message: ChatMessage
  userInputIndex?: number
  onFork?: (index: number) => void
  onRewind?: (index: number) => void
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
          onFork={userInputIndex !== undefined && onFork ? () => onFork(userInputIndex) : undefined}
          onRewind={userInputIndex !== undefined && onRewind ? () => onRewind(userInputIndex) : undefined}
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
    case 'restorePoint':
      return <RestorePoint data={message.data as { sha: string; message: string; timestamp: string }} />
    default:
      return null
  }
}

function ToolStepItem({ step, isCollapsed, onToggle }: { step: ToolStep; isCollapsed: boolean; onToggle: (id: string) => void }) {
  const toolData = step.toolUse?.data as Record<string, unknown> | undefined
  const toolName = (toolData?.toolName as string) || 'Tool'
  const hasError = step.toolResult && (step.toolResult.data as Record<string, unknown>)?.isError

  const indicatorColor = hasError ? STATUS_COLORS.failed : step.toolResult ? STATUS_COLORS.completed : STATUS_COLORS.executing
  const indicator = hasError ? STEP_INDICATORS.error : step.toolResult ? STEP_INDICATORS.done : STEP_INDICATORS.pending

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => onToggle(step.id)}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '4px 8px', borderRadius: 'var(--radius-sm)',
          background: 'transparent', fontSize: '11px', opacity: 0.7,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
      >
        <span style={{ color: indicatorColor, fontSize: '10px' }}>{indicator}</span>
        <span className="truncate">{toolName}</span>
        <span style={{ opacity: 0.4, fontSize: '9px' }}>{isCollapsed ? '▸' : '▾'}</span>
      </button>
      {!isCollapsed && (
        <div style={{ paddingLeft: '20px' }}>
          {step.toolUse && <ToolUseBlock data={step.toolUse.data as Record<string, unknown>} />}
          {step.toolResult && <ToolResultBlock data={step.toolResult.data as Record<string, unknown>} />}
        </div>
      )}
    </div>
  )
}

function PlanGroupCard({ plan, isCollapsed, collapsedSteps, onTogglePlan, onToggleStep }: {
  plan: PlanGroup; isCollapsed: boolean; collapsedSteps: Set<string>;
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
              isCollapsed={collapsedSteps.has(step.id)}
              onToggle={onToggleStep}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

interface Props {
  messages: ChatMessage[]
  isProcessing: boolean
  onFork?: (userInputIndex: number) => void
  onRewind?: (userInputIndex: number) => void
}

export function JourneyTimeline({ messages, isProcessing, onFork, onRewind }: Props) {
  const [collapsedPlans, setCollapsedPlans] = useState<Set<string>>(new Set())
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set())

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
    setCollapsedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="space-y-4">
      {items.map((item) => {
        if (item.kind === 'message') {
          const uiIdx = item.message.type === 'userInput' ? userInputIndexMap.get(item.message.id) : undefined
          return (
            <MessageRenderer
              key={item.message.id}
              message={item.message}
              userInputIndex={uiIdx}
              onFork={onFork}
              onRewind={onRewind}
              isProcessing={isProcessing}
            />
          )
        }
        return (
          <PlanGroupCard
            key={item.id}
            plan={item}
            isCollapsed={collapsedPlans.has(item.id)}
            collapsedSteps={collapsedSteps}
            onTogglePlan={togglePlan}
            onToggleStep={toggleStep}
          />
        )
      })}
    </div>
  )
}
