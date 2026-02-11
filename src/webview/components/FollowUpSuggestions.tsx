import { postMessage } from '../hooks'
import { useChatStore } from '../store'
import { markOptimisticUserInput } from '../mutations'
import { useUIStore } from '../store'
import { t } from '../i18n'

function generateSuggestions(text: string): string[] {
  const suggestions: string[] = []

  const hasCode = /```/.test(text)
  const hasTodo = /TODO|FIXME/i.test(text)
  const hasError = /error|exception|bug|fix/i.test(text)
  const hasTest = /test|spec|assert/i.test(text)
  const isLong = text.length > 2000

  if (hasCode && !hasTest) {
    suggestions.push(t('suggestion.writeTests'))
  }
  if (hasCode) {
    suggestions.push(t('suggestion.explainStep'))
  }
  if (hasError) {
    suggestions.push(t('suggestion.edgeCases'))
  }
  if (hasTodo) {
    suggestions.push(t('suggestion.addressTodos'))
  }
  if (isLong) {
    suggestions.push(t('suggestion.summarize'))
  }

  // Generic fallbacks
  if (suggestions.length < 2) {
    suggestions.push(t('suggestion.explainMore'))
    suggestions.push(t('suggestion.alternatives'))
  }

  return suggestions.slice(0, 3)
}

interface Props {
  lastAssistantText: string
}

export function FollowUpSuggestions({ lastAssistantText }: Props) {
  const isProcessing = useChatStore((s) => s.isProcessing)
  const suggestions = generateSuggestions(lastAssistantText)

  if (isProcessing || suggestions.length === 0) return null

  const handleClick = (text: string) => {
    const store = useChatStore.getState()
    markOptimisticUserInput()
    store.addMessage({ type: 'userInput', data: { text } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())
    postMessage({ type: 'sendMessage', text })
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-1" style={{ animation: 'fadeIn 0.3s ease' }}>
      {suggestions.map((s) => (
        <button
          key={s}
          onClick={() => handleClick(s)}
          className="cursor-pointer border-none text-xs"
          style={{
            padding: '4px 10px',
            borderRadius: '12px',
            border: '1px solid var(--vscode-panel-border)',
            background: 'rgba(128, 128, 128, 0.05)',
            color: 'inherit',
            opacity: 0.6,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--chatui-accent)'
            e.currentTarget.style.opacity = '1'
            e.currentTarget.style.color = 'var(--chatui-accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
            e.currentTarget.style.opacity = '0.6'
            e.currentTarget.style.color = 'inherit'
          }}
        >
          {s}
        </button>
      ))}
    </div>
  )
}
