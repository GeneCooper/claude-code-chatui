import { create } from 'zustand'

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
