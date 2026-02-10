import { useChatStore } from '../stores/chatStore'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { JourneyTimeline } from './JourneyTimeline'
import { WelcomeScreen } from './WelcomeScreen'

interface ChatViewProps {
  onHintClick?: (text: string) => void
}

export function ChatView({ onHintClick }: ChatViewProps) {
  const messages = useChatStore((s) => s.messages)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const scrollRef = useAutoScroll<HTMLDivElement>([messages])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {messages.length === 0 && (
        <WelcomeScreen onHintClick={onHintClick || (() => {})} />
      )}

      {messages.length > 0 && (
        <JourneyTimeline messages={messages} isProcessing={isProcessing} />
      )}
    </div>
  )
}
