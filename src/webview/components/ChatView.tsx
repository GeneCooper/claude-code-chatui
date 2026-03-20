import { useCallback, useState, useEffect, useRef, useMemo, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChatStore, useUIStore, type ChatMessage } from '../store'
import { useAutoScroll } from '../hooks'
import { JourneyTimeline } from './JourneyTimeline'
import { WelcomeScreen } from './WelcomeScreen'

// ============================================================================
// Mini Navigator — shows message distribution + click to jump
// ============================================================================

interface NavSegment {
  type: 'user' | 'assistant' | 'tool' | 'error'
  position: number // 0..1 relative position
  messageIndex: number
}

function buildNavSegments(messages: ChatMessage[]): NavSegment[] {
  if (messages.length === 0) return []
  const segments: NavSegment[] = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    const position = i / messages.length
    if (msg.type === 'userInput') segments.push({ type: 'user', position, messageIndex: i })
    else if (msg.type === 'output') segments.push({ type: 'assistant', position, messageIndex: i })
    else if (msg.type === 'error') segments.push({ type: 'error', position, messageIndex: i })
    else if (msg.type === 'toolUse') segments.push({ type: 'tool', position, messageIndex: i })
  }
  return segments
}

const NAV_COLORS: Record<string, string> = {
  user: 'var(--chatui-accent)',
  assistant: 'var(--status-success)',
  tool: 'rgba(255, 255, 255, 0.2)',
  error: 'var(--status-error)',
}

const NAV_HEIGHTS: Record<string, number> = {
  user: 8,
  assistant: 4,
  tool: 2,
  error: 6,
}

function MiniNavigator({ messages, containerRef }: { messages: ChatMessage[]; containerRef: React.RefObject<HTMLDivElement | null> }) {
  const segments = useMemo(() => buildNavSegments(messages), [messages])

  const handleClick = useCallback((position: number) => {
    const container = containerRef.current
    if (!container) return
    const targetScroll = position * container.scrollHeight
    container.scrollTo({ top: targetScroll, behavior: 'smooth' })
  }, [containerRef])

  if (segments.length < 5) return null // Only show for conversations with enough messages

  return (
    <div className="chat-navigator">
      {segments.map((seg, i) => (
        <div
          key={i}
          className="chat-nav-segment"
          style={{
            top: `${seg.position * 100}%`,
            height: `${NAV_HEIGHTS[seg.type]}px`,
            background: NAV_COLORS[seg.type],
          }}
          onClick={() => handleClick(seg.position)}
          title={`${seg.type} message`}
        />
      ))}
    </div>
  )
}

interface ChatViewProps {
  onHintClick?: (text: string) => void
}

export const ChatView = memo(function ChatView({ onHintClick }: ChatViewProps) {
  const { messages, isProcessing } = useChatStore(useShallow((s) => ({ messages: s.messages, isProcessing: s.isProcessing })))
  const { containerRef } = useAutoScroll<HTMLDivElement>({
    dependencies: [messages],
    behavior: isProcessing ? 'instant' : 'smooth',
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const handleEdit = useCallback((userInputIndex: number, text: string, images: string[] | undefined) => {
    useUIStore.getState().setDraftText(text)
    useUIStore.getState().setEditingContext({ userInputIndex, images: images ?? [] })
  }, [])

  // Ctrl+F to toggle search, Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        setShowSearch(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSearch])

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Search bar */}
      {showSearch && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: '4px 12px',
            borderBottom: '1px solid var(--chatui-glass-border)',
            background: 'var(--chatui-glass-bg)',
            flexShrink: 0,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search messages..."
            style={{
              flex: 1,
              padding: '3px 8px',
              fontSize: '12px',
              background: 'var(--vscode-input-background)',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: '4px',
              color: 'inherit',
              outline: 'none',
              fontFamily: 'inherit',
            }}
          />
          <button
            onClick={() => { setShowSearch(false); setSearchQuery('') }}
            className="cursor-pointer bg-transparent border-none text-inherit"
            style={{ padding: '2px 4px', fontSize: '12px', opacity: 0.5 }}
            aria-label="Close search"
          >
            ✕
          </button>
        </div>
      )}

      {/* Scroll container with mini navigator */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div
          ref={containerRef}
          className="chat-scroll-container flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 min-h-0"
          style={{ position: 'relative', zIndex: 0, height: '100%' }}
        >
          {messages.length === 0 && (
            <WelcomeScreen onHintClick={onHintClick || (() => {})} />
          )}

          {messages.length > 0 && (
            <JourneyTimeline
              messages={messages}
              isProcessing={isProcessing}
              onEdit={handleEdit}
              searchQuery={searchQuery}
            />
          )}
        </div>

        {/* Mini navigator — right edge color bar for quick jumping */}
        {messages.length > 0 && (
          <MiniNavigator messages={messages} containerRef={containerRef} />
        )}
      </div>

    </div>
  )
})

