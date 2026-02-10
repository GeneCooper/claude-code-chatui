import { LogoIcon } from './Header'

const HINTS = [
  { icon: '🐛', label: 'Fix a bug', prompt: 'Help me fix a bug in ' },
  { icon: '🧪', label: 'Write tests', prompt: 'Write comprehensive tests for ' },
  { icon: '📖', label: 'Explain code', prompt: 'Explain how this code works: ' },
  { icon: '✨', label: 'Refactor', prompt: 'Refactor this code for better readability: ' },
]

interface Props {
  onHintClick: (text: string) => void
}

export function WelcomeScreen({ onHintClick }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 text-center"
      style={{
        flex: 1,
        minHeight: '50vh',
        padding: '60px 24px',
        animation: 'fadeIn 0.5s ease',
      }}
    >
      <div
        className="mb-4"
        style={{
          opacity: 0.9,
          filter: 'drop-shadow(0 4px 12px rgba(237, 110, 29, 0.3))',
        }}
      >
        <LogoIcon size={48} />
      </div>

      <h2
        className="m-0"
        style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '8px' }}
      >
        Claude Code ChatUI
      </h2>

      <p className="m-0" style={{ fontSize: '13px', opacity: 0.7, marginBottom: '32px' }}>
        AI-powered coding assistant
      </p>

      <div
        className="grid grid-cols-2 gap-3 w-full"
        style={{ maxWidth: '440px', margin: '0 auto' }}
      >
        {HINTS.map((hint) => (
          <button
            key={hint.label}
            onClick={() => onHintClick(hint.prompt)}
            className="flex items-center gap-3 text-left cursor-pointer text-inherit"
            style={{
              padding: '16px 20px',
              border: '1px solid var(--vscode-panel-border)',
              background: 'rgba(128, 128, 128, 0.05)',
              borderRadius: 'var(--radius-lg)',
              transition: 'all 0.2s ease',
              fontSize: '14px',
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
            <span style={{ fontSize: '18px' }}>{hint.icon}</span>
            <span style={{ fontWeight: 500, fontSize: '14px' }}>{hint.label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
