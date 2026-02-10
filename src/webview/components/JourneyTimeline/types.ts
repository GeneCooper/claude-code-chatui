import type { ChatMessage } from '../../stores/chatStore'

export interface ToolStep {
  id: string
  toolUse?: ChatMessage
  toolResult?: ChatMessage
}

export interface PlanGroup {
  id: string
  kind: 'plan'
  assistantMessage: ChatMessage
  thinkingMessage?: ChatMessage
  steps: ToolStep[]
  status: 'executing' | 'completed' | 'failed'
}

export interface MessageItem {
  kind: 'message'
  message: ChatMessage
}

export type TimelineItem = PlanGroup | MessageItem
