import { useEffect } from 'react'
import { postMessage } from '../lib/vscode'
import { useConversationStore } from '../stores/conversationStore'
import { useUIStore } from '../stores/uiStore'

export function HistoryView() {
  const conversations = useConversationStore((s) => s.conversations)
  const setActiveView = useUIStore((s) => s.setActiveView)

  useEffect(() => {
    postMessage({ type: 'getConversationList' })
  }, [])

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr)
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }

  const formatCost = (cost: number) => {
    if (cost === 0) return ''
    return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <span className="font-medium text-sm">Conversation History</span>
        <button
          onClick={() => setActiveView('chat')}
          className="text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit"
        >
          Back to Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex items-center justify-center h-full opacity-40 text-sm">
            No conversation history
          </div>
        ) : (
          <div className="divide-y divide-[var(--vscode-panel-border)]">
            {conversations.map((conv) => (
              <button
                key={conv.filename}
                onClick={() => {
                  postMessage({ type: 'loadConversation', filename: conv.filename })
                  setActiveView('chat')
                }}
                className="w-full text-left px-3 py-2.5 hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer bg-transparent border-none text-inherit block"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs opacity-50">
                    {formatDate(conv.startTime)} {formatTime(conv.startTime)}
                  </span>
                  <span className="text-[10px] opacity-40">
                    {conv.messageCount} msgs {formatCost(conv.totalCost)}
                  </span>
                </div>
                <div className="text-sm truncate">
                  {conv.firstUserMessage || 'No message'}
                </div>
                {conv.lastUserMessage && conv.lastUserMessage !== conv.firstUserMessage && (
                  <div className="text-xs opacity-40 truncate mt-0.5">
                    Last: {conv.lastUserMessage}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
