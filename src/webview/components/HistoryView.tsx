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
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--vscode-widget-border, var(--vscode-panel-border))',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Conversation History</h3>
        <button
          onClick={() => setActiveView('chat')}
          className="cursor-pointer bg-transparent border-none text-inherit"
          style={{
            fontSize: '13px',
            opacity: 0.6,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
        >
          {'\u2190'} Back to Chat
        </button>
      </div>

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '8px' }}
      >
        {conversations.length === 0 ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--vscode-descriptionForeground)',
            fontStyle: 'italic',
            opacity: 0.6,
            fontSize: '14px',
          }}>
            No conversation history
          </div>
        ) : (
          conversations.map((conv) => (
            <button
              key={conv.filename}
              onClick={() => {
                postMessage({ type: 'loadConversation', filename: conv.filename })
                setActiveView('chat')
              }}
              className="w-full text-left cursor-pointer border-none text-inherit"
              style={{
                display: 'block',
                padding: '12px',
                margin: '4px 0',
                border: '1px solid var(--vscode-widget-border, var(--vscode-panel-border))',
                borderRadius: 'var(--radius-md)',
                background: 'var(--vscode-list-inactiveSelectionBackground, transparent)',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--vscode-list-inactiveSelectionBackground, transparent)'
                e.currentTarget.style.borderColor = 'var(--vscode-widget-border, var(--vscode-panel-border))'
              }}
            >
              {/* Meta info */}
              <div
                className="flex items-center justify-between"
                style={{ marginBottom: '4px' }}
              >
                <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                  {formatDate(conv.startTime)} {formatTime(conv.startTime)}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', opacity: 0.8 }}>
                  {conv.messageCount} msgs {formatCost(conv.totalCost)}
                </span>
              </div>

              {/* Title / first message */}
              <div style={{ fontWeight: 500, marginBottom: '4px', fontSize: '14px' }}>
                {conv.firstUserMessage || 'No message'}
              </div>

              {/* Preview */}
              {conv.lastUserMessage && conv.lastUserMessage !== conv.firstUserMessage && (
                <div style={{
                  fontSize: '11px',
                  color: 'var(--vscode-descriptionForeground)',
                  opacity: 0.8,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginTop: '4px',
                }}>
                  Last: {conv.lastUserMessage}
                </div>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  )
}
