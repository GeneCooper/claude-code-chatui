import { useChatStore, type ChatMessage } from '../stores/chatStore'
import { useAutoScroll } from '../hooks/useAutoScroll'
import { UserMessage } from './UserMessage'
import { AssistantMessage } from './AssistantMessage'
import { ThinkingBlock } from './ThinkingBlock'
import { ToolUseBlock } from './ToolUseBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { PermissionDialog } from './PermissionDialog'
import { RestorePoint } from './RestorePoint'
import { WelcomeScreen } from './WelcomeScreen'

interface ChatViewProps {
  onHintClick?: (text: string) => void
}

export function ChatView({ onHintClick }: ChatViewProps) {
  const messages = useChatStore((s) => s.messages)
  const scrollRef = useAutoScroll<HTMLDivElement>([messages])

  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-3 py-4 space-y-3"
    >
      {messages.length === 0 && (
        <WelcomeScreen onHintClick={onHintClick || (() => {})} />
      )}

      {messages.map((msg) => (
        <MessageRenderer key={msg.id} message={msg} />
      ))}
    </div>
  )
}

function MessageRenderer({ message }: { message: ChatMessage }) {
  switch (message.type) {
    case 'userInput':
      return <UserMessage text={String(message.data)} />

    case 'output':
      return <AssistantMessage text={String(message.data)} />

    case 'thinking':
      return <ThinkingBlock text={String(message.data)} />

    case 'toolUse':
      return <ToolUseBlock data={message.data as Record<string, unknown>} />

    case 'toolResult':
      return <ToolResultBlock data={message.data as Record<string, unknown>} />

    case 'permissionRequest':
      return <PermissionDialog data={message.data as Record<string, unknown>} />

    case 'error':
      return (
        <div className="px-3 py-2 rounded-lg bg-[var(--vscode-inputValidation-errorBackground,rgba(255,0,0,0.1))] border border-[var(--vscode-inputValidation-errorBorder,#be1100)] text-sm">
          {String(message.data)}
        </div>
      )

    case 'loading':
      return (
        <div className="flex items-center gap-2 px-3 py-2 text-sm opacity-60">
          <LoadingDots />
          {String(message.data)}
        </div>
      )

    case 'sessionInfo':
      return null

    case 'compacting':
      return (message.data as { isCompacting: boolean }).isCompacting ? (
        <div className="text-center text-xs opacity-50 py-1">Compacting conversation...</div>
      ) : null

    case 'compactBoundary':
      return (
        <div className="text-center text-xs opacity-40 py-1 border-t border-dashed border-[var(--vscode-panel-border)]">
          Conversation compacted
        </div>
      )

    case 'restorePoint':
      return <RestorePoint data={message.data as { sha: string; message: string; timestamp: string }} />

    default:
      return null
  }
}

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
      <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
    </span>
  )
}
