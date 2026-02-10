import type { ChatMessage } from '../../stores/chatStore'
import type { PlanGroup, TimelineItem } from './types'

/**
 * Build timeline items from flat chat messages.
 * Groups assistant output, thinking, toolUse, and toolResult into PlanGroups.
 */
export function buildTimelineItems(messages: ChatMessage[], isProcessing: boolean): TimelineItem[] {
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
        break

      default:
        break
    }
  }

  // Flush the last plan
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

/**
 * Get a summary text for a collapsed plan.
 */
export function getPlanSummary(plan: PlanGroup): string {
  if (plan.assistantMessage.type === 'output') {
    return String(plan.assistantMessage.data).substring(0, 100)
  }
  if (plan.assistantMessage.type === 'thinking') {
    return 'Thinking...'
  }
  return 'Working...'
}
