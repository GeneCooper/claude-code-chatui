import { useCallback } from 'react'
import { useChatStore, useUIStore } from '../store'
import { useAutoScroll } from '../hooks'
import { JourneyTimeline } from './JourneyTimeline'
import { WelcomeScreen } from './WelcomeScreen'
import { ClaudeMdBanner } from './ClaudeMdBanner'

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

  const handleEdit = useCallback((userInputIndex: number, text: string, images: string[] | undefined) => {
    useUIStore.getState().setDraftText(text)
    useUIStore.getState().setEditingContext({ userInputIndex, images: images ?? [] })
  }, [])

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-2 min-h-0"
    >
      {messages.length === 0 && (
        <>
          <ClaudeMdBanner />
          <WelcomeScreen onHintClick={onHintClick || (() => {})} />
        </>
      )}

      {messages.length > 0 && (
        <JourneyTimeline
          messages={messages}
          isProcessing={isProcessing}
          onEdit={handleEdit}
        />
      )}
    </div>
  )
}
