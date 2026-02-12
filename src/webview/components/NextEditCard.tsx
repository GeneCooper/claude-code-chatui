import { postMessage } from '../hooks'
import { useChatStore } from '../store'

export function NextEditCard() {
  const suggestions = useChatStore((s) => s.nextEditSuggestions)
  const dismiss = useChatStore((s) => s.dismissNextEditSuggestion)

  if (suggestions.length === 0) return null

  return (
    <div className="space-y-2" style={{ animation: 'fadeIn 0.3s ease' }}>
      {suggestions.map((suggestion) => (
        <div
          key={suggestion.id}
          style={{
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            border: `1px solid ${suggestion.severity === 'warning' ? 'rgba(234, 179, 8, 0.3)' : 'rgba(59, 130, 246, 0.3)'}`,
            background: suggestion.severity === 'warning' ? 'rgba(234, 179, 8, 0.06)' : 'rgba(59, 130, 246, 0.06)',
            fontSize: '12px',
          }}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={suggestion.severity === 'warning' ? '#eab308' : '#3b82f6'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span
                  className="font-medium truncate cursor-pointer"
                  style={{ color: 'var(--vscode-textLink-foreground)' }}
                  onClick={() => postMessage({ type: 'openFile', filePath: suggestion.filePath })}
                  title={suggestion.filePath}
                >
                  {suggestion.filePath}
                </span>
              </div>
              <p style={{ opacity: 0.7, margin: 0, lineHeight: 1.4 }}>
                {suggestion.reason}
              </p>
              {suggestion.changedSymbols.length > 0 && (
                <div className="flex gap-1 flex-wrap mt-1">
                  {suggestion.changedSymbols.map((sym) => (
                    <span
                      key={sym}
                      style={{
                        padding: '1px 5px',
                        borderRadius: '3px',
                        background: 'rgba(128, 128, 128, 0.15)',
                        fontSize: '10px',
                        fontFamily: 'var(--font-mono, monospace)',
                      }}
                    >
                      {sym}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => postMessage({ type: 'openFile', filePath: suggestion.filePath })}
                className="cursor-pointer border-none"
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(128, 128, 128, 0.1)',
                  color: 'inherit',
                  fontSize: '11px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(128, 128, 128, 0.2)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)' }}
                title="Open"
              >
                Open
              </button>
              <button
                onClick={() => {
                  postMessage({
                    type: 'sendMessage',
                    text: `Please update ${suggestion.filePath} to reflect the changes to: ${suggestion.changedSymbols.join(', ')}`,
                  })
                  dismiss(suggestion.id)
                }}
                className="cursor-pointer border-none"
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  color: '#3b82f6',
                  fontSize: '11px',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)' }}
              >
                Fix
              </button>
              <button
                onClick={() => {
                  dismiss(suggestion.id)
                  postMessage({ type: 'dismissSuggestion', suggestionId: suggestion.id })
                }}
                className="cursor-pointer border-none"
                style={{
                  padding: '2px 4px',
                  background: 'transparent',
                  color: 'inherit',
                  opacity: 0.4,
                  fontSize: '14px',
                  lineHeight: 1,
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
