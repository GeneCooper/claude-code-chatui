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

  const handleFork = useCallback((userInputIndex: number) => {
    postMessage({ type: 'forkFromMessage', userInputIndex })
  }, [])

  const handleRewind = useCallback((userInputIndex: number) => {
    postMessage({ type: 'rewindToMessage', userInputIndex })
  }, [])

  return (
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
          onFork={handleFork}
          onRewind={handleRewind}
        />
      )}
    </div>
  )
}
