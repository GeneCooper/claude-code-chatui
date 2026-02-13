interface Props {
  onHintClick: (text: string) => void
}

declare global {
  interface Window {
    __ICON_URI__?: string
  }
}

export function WelcomeScreen({ onHintClick }: Props) {
  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        flex: 1,
        minHeight: '60vh',
        padding: '32px 12px',
        animation: 'fadeIn 0.6s ease',
      }}
    >
      {/* Logo */}
      <div style={{ marginBottom: '24px', opacity: 0.9 }}>
        <img
          src={window.__ICON_URI__}
          alt="Logo"
          style={{ width: 64, height: 64 }}
        />
      </div>

      {/* Hint text */}
      <p
        className="m-0"
        style={{
          fontSize: '13px',
          opacity: 0.45,
          fontWeight: 400,
          letterSpacing: '0.01em',
        }}
      >
        Type <span style={{ color: 'var(--chatui-accent)', opacity: 1 }}>/model</span> to pick the right tool for the job.
      </p>
    </div>
  )
}
