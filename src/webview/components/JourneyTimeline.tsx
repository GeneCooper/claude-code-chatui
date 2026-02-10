import { useMemo, useState, useCallback } from 'react'
import type { ChatMessage } from '../stores/chatStore'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'
import { RestorePoint } from './RestorePoint'

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
// Grouping algorithm
// ============================================================================

function buildTimelineItems(messages: ChatMessage[], isProcessing: boolean): TimelineItem[] {
  const timeline: TimelineItem[] = []
  let currentPlan: PlanGroup | null = null

  const flushPlan = () => {
    if (currentPlan) {
      // Determine status
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
        currentPlan = {
          id: msg.id,
          kind: 'plan',
          assistantMessage: msg,
          steps: [],
          status: 'executing',
        }
        break
      }

      case 'thinking': {
        if (currentPlan) {
          currentPlan.thinkingMessage = msg
        } else {
          currentPlan = {
            id: msg.id,
            kind: 'plan',
            assistantMessage: msg,
            steps: [],
            status: 'executing',
          }
        }
        break
      }

      case 'toolUse': {
        if (!currentPlan) {
          currentPlan = {
            id: msg.id,
            kind: 'plan',
            assistantMessage: msg,
            steps: [],
            status: 'executing',
          }
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
            currentPlan = {
              id: msg.id,
              kind: 'plan',
              assistantMessage: msg,
              steps: [],
              status: 'executing',
            }
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
        // Don't render
        break

      default:
        break
    }
  }

  // Flush the last plan - if processing, it stays executing
  if (currentPlan) {
    if (isProcessing) {
      currentPlan.status = 'executing'
    } else if (currentPlan.steps.some((s) => s.toolResult && (s.toolResult.data as Record<string, unknown>)?.isError)) {
      currentPlan.status = 'failed'
    } else if (currentPlan.steps.length === 0 || currentPlan.steps.every((s) => s.toolResult)) {
      currentPlan.status = 'completed'
    }
    timeline.push(currentPlan)
  }

  return timeline
}

// ============================================================================
// Component
// ============================================================================

interface Props {
  messages: ChatMessage[]
  isProcessing: boolean
}

export function JourneyTimeline({ messages, isProcessing }: Props) {
  const [collapsedPlans, setCollapsedPlans] = useState<Set<string>>(new Set())
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set())

  const items = useMemo(() => buildTimelineItems(messages, isProcessing), [messages, isProcessing])

  const togglePlan = useCallback((id: string) => {
    setCollapsedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleStep = useCallback((id: string) => {
    setCollapsedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === 'message') {
          return <MessageRenderer key={item.message.id} message={item.message} />
        }

        // PlanGroup
        const plan = item
        const isCollapsed = collapsedPlans.has(plan.id)
        const statusIcon = plan.status === 'executing'
          ? '⟳'
          : plan.status === 'completed'
            ? '✓'
            : '✗'
        const statusColor = plan.status === 'executing'
          ? '#ff9500'
          : plan.status === 'completed'
            ? '#00d26a'
            : '#ff453a'

        // Summary for collapsed view
        const summaryText = plan.assistantMessage.type === 'output'
          ? String(plan.assistantMessage.data).substring(0, 100)
          : plan.assistantMessage.type === 'thinking'
            ? 'Thinking...'
            : 'Working...'

        return (
          <div key={plan.id} style={{ marginBottom: '4px' }}>
            {/* Plan header */}
            <button
              onClick={() => togglePlan(plan.id)}
              className="w-full text-left cursor-pointer border-none text-inherit"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(128, 128, 128, 0.06)',
                border: `1px solid ${plan.status === 'executing' ? 'rgba(255, 149, 0, 0.2)' : 'transparent'}`,
                transition: 'all 0.2s ease',
                fontSize: '12px',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(128, 128, 128, 0.12)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(128, 128, 128, 0.06)' }}
            >
              <span
                style={{
                  color: statusColor,
                  fontSize: '14px',
                  fontWeight: 600,
                  animation: plan.status === 'executing' ? 'spin 1.5s linear infinite' : 'none',
                  display: 'inline-block',
                }}
              >
                {statusIcon}
              </span>
              <span className="flex-1 truncate" style={{ opacity: 0.8 }}>
                {isCollapsed ? summaryText : 'Assistant response'}
              </span>
              {plan.steps.length > 0 && (
                <span style={{ opacity: 0.5, fontSize: '11px' }}>
                  {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
                </span>
              )}
              <span style={{ opacity: 0.4, fontSize: '10px' }}>
                {isCollapsed ? '▸' : '▾'}
              </span>
            </button>

            {/* Plan content */}
            {!isCollapsed && (
              <div style={{ paddingLeft: '12px', borderLeft: `2px solid ${statusColor}20`, marginLeft: '10px', marginTop: '4px' }}>
                {/* Assistant text */}
                {plan.assistantMessage.type === 'output' && (
                  <AssistantMessage text={String(plan.assistantMessage.data)} />
                )}

                {/* Thinking */}
                {plan.thinkingMessage && (
                  <ThinkingBlock text={String(plan.thinkingMessage.data)} />
                )}
                {plan.assistantMessage.type === 'thinking' && !plan.thinkingMessage && (
                  <ThinkingBlock text={String(plan.assistantMessage.data)} />
                )}

                {/* Tool steps */}
                {plan.steps.map((step) => {
                  const isStepCollapsed = collapsedSteps.has(step.id)
                  const toolData = step.toolUse?.data as Record<string, unknown> | undefined
                  const toolName = (toolData?.toolName as string) || 'Tool'
                  const hasError = step.toolResult && (step.toolResult.data as Record<string, unknown>)?.isError

                  return (
                    <div key={step.id} style={{ marginBottom: '4px' }}>
                      <button
                        onClick={() => toggleStep(step.id)}
                        className="w-full text-left cursor-pointer border-none text-inherit"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 8px',
                          borderRadius: 'var(--radius-sm)',
                          background: 'transparent',
                          fontSize: '11px',
                          opacity: 0.7,
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
                      >
                        <span style={{ color: hasError ? '#ff453a' : step.toolResult ? '#00d26a' : '#ff9500', fontSize: '10px' }}>
                          {hasError ? '●' : step.toolResult ? '●' : '○'}
                        </span>
                        <span className="truncate">{toolName}</span>
                        <span style={{ opacity: 0.4, fontSize: '9px' }}>
                          {isStepCollapsed ? '▸' : '▾'}
                        </span>
                      </button>
                      {!isStepCollapsed && (
                        <div style={{ paddingLeft: '20px' }}>
                          {step.toolUse && <ToolUseBlock data={step.toolUse.data as Record<string, unknown>} />}
                          {step.toolResult && <ToolResultBlock data={step.toolResult.data as Record<string, unknown>} />}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ============================================================================
// Standalone message renderer (for non-plan items)
// ============================================================================

function MessageRenderer({ message }: { message: ChatMessage }) {
  switch (message.type) {
    case 'userInput':
      return <UserMessage text={String(message.data)} />

    case 'error':
      return (
        <div className="px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))', borderColor: 'var(--vscode-inputValidation-errorBorder, #be1100)' }}>
          {String(message.data)}
        </div>
      )

    case 'loading':
      return (
        <div className="flex items-center gap-2 px-3 py-2 text-sm opacity-60">
          <LoadingDots />
          {String(message.data)}
        </div>
      )

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

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
    </span>
  )
}
