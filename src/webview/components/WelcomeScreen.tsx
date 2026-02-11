import { LogoIcon } from './Header'

const HINTS = [
  { icon: '🐛', label: 'Fix a bug', prompt: 'Help me fix a bug in ' },
  { icon: '🧪', label: 'Write tests', prompt: 'Write comprehensive tests for ' },
  { icon: '📖', label: 'Explain code', prompt: 'Explain how this code works: ' },
  { icon: '✨', label: 'Refactor', prompt: 'Refactor this code for better readability: ' },
  { icon: '🔍', label: 'Code review', prompt: 'Review this code for issues and improvements: ' },
  { icon: '🚀', label: 'Add feature', prompt: 'Help me implement ' },
]

const TIPS = [
  { key: '/', desc: 'Slash commands' },
  { key: 'Drop', desc: 'Attach files' },
  { key: 'Think', desc: 'Deep reasoning mode' },
  { key: 'Plan', desc: 'Plan before executing' },
  { key: 'YOLO', desc: 'Skip permissions' },
  { key: 'Shift+Enter', desc: 'New line' },
]

interface Props {
  onHintClick: (text: string) => void
}

export function WelcomeScreen({ onHintClick }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        flex: 1,
        minHeight: '50vh',
        padding: '32px 12px',
        animation: 'fadeIn 0.5s ease',
        overflow: 'hidden',
      }}
    >
      <div
        className="mb-3"
        style={{
          opacity: 0.9,
          filter: 'drop-shadow(0 4px 12px rgba(237, 110, 29, 0.3))',
        }}
      >
        <LogoIcon size={40} />
      </div>

      <h2
        className="m-0"
        style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '6px' }}
      >
        Claude Code ChatUI
      </h2>

      <p className="m-0" style={{ fontSize: '12px', opacity: 0.7, marginBottom: '20px' }}>
        AI-powered coding assistant
      </p>

      {/* Task hints */}
      <div
        className="grid grid-cols-2 gap-1.5 w-full"
        style={{ maxWidth: '480px', margin: '0 auto', marginBottom: '20px' }}
      >
        {HINTS.map((hint) => (
          <button
            key={hint.label}
            onClick={() => onHintClick(hint.prompt)}
            className="flex items-center gap-2 text-left cursor-pointer text-inherit"
            style={{
              padding: '8px 10px',
              border: '1px solid var(--vscode-panel-border)',
              background: 'rgba(128, 128, 128, 0.05)',
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.2s ease',
              minWidth: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--chatui-accent)'
              e.currentTarget.style.color = 'var(--chatui-accent)'
              e.currentTarget.style.background = 'rgba(237, 110, 29, 0.06)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
              e.currentTarget.style.color = 'inherit'
              e.currentTarget.style.background = 'rgba(128, 128, 128, 0.05)'
            }}
          >
            <span style={{ fontSize: '13px', flexShrink: 0 }}>{hint.icon}</span>
            <span className="truncate" style={{ fontWeight: 500, fontSize: '12px' }}>{hint.label}</span>
          </button>
        ))}
      </div>

      {/* Feature tips */}
      <div style={{ width: '100%' }}>
        <div
          className="flex flex-wrap items-center justify-center gap-1.5"
          style={{ opacity: 0.5, fontSize: '10px' }}
        >
          {TIPS.map((tip, i) => (
            <span key={tip.key} className="flex items-center gap-0.5">
              {i > 0 && <span style={{ margin: '0 1px', opacity: 0.3 }}>&middot;</span>}
              <kbd
                style={{
                  padding: '1px 4px',
                  borderRadius: '3px',
                  border: '1px solid var(--vscode-panel-border)',
                  background: 'rgba(128, 128, 128, 0.1)',
                  fontFamily: 'inherit',
                  fontSize: '9px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {tip.key}
              </kbd>
              <span style={{ whiteSpace: 'nowrap' }}>{tip.desc}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
