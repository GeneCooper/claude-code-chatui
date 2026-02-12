import { LogoIcon } from './Header'

interface Props {
  onHintClick: (text: string) => void
}

export function WelcomeScreen({ onHintClick: _onHintClick }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        flex: 1,
        minHeight: '50vh',
        padding: '32px 12px',
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
        style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '24px' }}
      >
        Claude Code ChatUI
      </h2>

      <p className="m-0" style={{ fontSize: '13px', opacity: 0.5 }}>
        Type /model to pick the right tool for the job.
      </p>
    </div>
  )
}
