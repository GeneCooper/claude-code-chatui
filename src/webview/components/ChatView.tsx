import { useCallback } from 'react'
import { useChatStore } from '../store'
import { useAutoScroll, postMessage } from '../hooks'
import { JourneyTimeline } from './JourneyTimeline'
import { WelcomeScreen } from './WelcomeScreen'

interface ChatViewProps {
  onHintClick?: (text: string) => void
}

export function ChatView({ onHintClick }: ChatViewProps) {
  const messages = useChatStore((s) => s.messages)
  const isProcessing = useChatStore((s) => s.isProcessing)
  // Use instant scroll during streaming to avoid smooth-scroll "chasing" jitter
  const { containerRef } = useAutoScroll<HTMLDivElement>({
    dependencies: [messages],
    behavior: isProcessing ? 'instant' : 'smooth',
  })

  const handleEdit = useCallback((userInputIndex: number, newText: string) => {
    postMessage({ type: 'editMessage', userInputIndex, newText })
  }, [])

  const handleRegenerate = useCallback(() => {
    postMessage({ type: 'regenerateResponse' })
  }, [])

  return (
    <div
      ref={containerRef}
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 min-h-0"
    >
      {messages.length === 0 && (
        <WelcomeScreen onHintClick={onHintClick || (() => {})} />
      )}

      {messages.length > 0 && (
        <JourneyTimeline
          messages={messages}
          isProcessing={isProcessing}
          onEdit={handleEdit}
          onRegenerate={handleRegenerate}
        />
      )}
    </div>
  )
}
