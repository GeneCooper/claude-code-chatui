import type { ChatMessage } from '../../stores/chatStore'
import { UserMessage } from '../UserMessage'
import { PermissionDialog } from '../PermissionDialog'
import { RestorePoint } from '../RestorePoint'

interface Props {
  message: ChatMessage
}

export function MessageRenderer({ message }: Props) {
  switch (message.type) {
    case 'userInput':
      return <UserMessage text={String(message.data)} />

    case 'error':
      return (
        <div className="px-3 py-2 rounded-lg border text-sm" style={{ backgroundColor: 'var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1))', borderColor: 'var(--vscode-inputValidation-errorBorder, #be1100)' }}>
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

    case 'compacting':
      return (message.data as { isCompacting: boolean }).isCompacting ? (
        <div className="text-center text-xs opacity-50 py-1">Compacting conversation...</div>
      ) : null

    case 'compactBoundary':
      return (
        <div className="text-center text-xs opacity-40 py-1 border-t border-dashed border-(--vscode-panel-border)">
          Conversation compacted
        </div>
      )

    case 'permissionRequest':
      return <PermissionDialog data={message.data as Record<string, unknown>} />

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
