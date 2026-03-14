import { useCallback, useState, useEffect, useRef, useMemo, memo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useChatStore, useUIStore, useDiscussionStore } from '../store'
import { useAutoScroll } from '../hooks'
import { JourneyTimeline } from './JourneyTimeline'
import { WelcomeScreen } from './WelcomeScreen'
import { DiscussionPanel } from './DiscussionPanel'

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

  // Count errors
  const errorCount = useMemo(() => {
    return messages.filter(m =>
      m.type === 'error' ||
      (m.type === 'toolResult' && (m.data as Record<string, unknown>)?.isError),
    ).length
  }, [messages])

  const scrollToLastError = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const errorElements = container.querySelectorAll('[data-error="true"]')
    if (errorElements.length > 0) {
      errorElements[errorElements.length - 1].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [containerRef])

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

      {/* Scroll container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 min-h-0"
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

        {/* Discussion panel — shown when discussion mode is active */}
        <DiscussionPanelWrapper />
      </div>

      {/* Error jump banner */}
      {errorCount > 0 && !isProcessing && (
        <button
          onClick={scrollToLastError}
          className="cursor-pointer border-none"
          style={{
            position: 'absolute',
            bottom: '8px',
            right: '16px',
            padding: '4px 12px',
            borderRadius: '12px',
            background: 'rgba(231, 76, 60, 0.9)',
            color: 'white',
            fontSize: '11px',
            fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 10,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(231, 76, 60, 1)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(231, 76, 60, 0.9)' }}
        >
          {errorCount} error{errorCount > 1 ? 's' : ''} — click to jump
        </button>
      )}
    </div>
  )
})

/** Only renders DiscussionPanel when there are roles to show */
function DiscussionPanelWrapper() {
  const hasRoles = useDiscussionStore((s) => s.roles.length > 0)
  if (!hasRoles) return null
  return <DiscussionPanel />
}
