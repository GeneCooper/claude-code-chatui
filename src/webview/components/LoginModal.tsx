import { useUIStore } from '../stores/uiStore'
import { postMessage } from '../lib/vscode'

export function LoginModal() {
  const show = useUIStore((s) => s.showLoginModal)
  const setShow = useUIStore((s) => s.setShowLoginModal)
  const errorMessage = useUIStore((s) => s.loginErrorMessage)

  if (!show) return null

  const handleOpenTerminal = () => {
    postMessage({ type: 'executeSlashCommand', command: 'login' })
    setShow(false)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) setShow(false) }}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          width: 'calc(100% - 32px)',
          maxWidth: '380px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          animation: 'installFadeIn 0.2s ease-out',
        }}
      >
        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0 0' }}>
          <button
            onClick={() => setShow(false)}
            style={{ background: 'none', border: 'none', color: 'var(--vscode-foreground)', cursor: 'pointer', fontSize: '16px', padding: '4px', opacity: 0.6 }}
          >
            {'\u2715'}
          </button>
        </div>

        <div style={{ padding: '0 32px 32px', textAlign: 'center' }}>
          {/* Icon */}
          <div style={{ marginBottom: '16px' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--chatui-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>

          <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>
            Authentication Required
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '12px', opacity: 0.6, lineHeight: 1.5 }}>
            Please log in to Claude Code to continue
          </p>

          {/* Error detail */}
          {errorMessage && (
            <div
              style={{
                padding: '8px 12px',
                marginBottom: '16px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                fontSize: '11px',
                lineHeight: 1.4,
                color: 'var(--vscode-errorForeground)',
                textAlign: 'left',
                wordBreak: 'break-word',
                maxHeight: '80px',
                overflowY: 'auto',
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Login button */}
          <button
            onClick={handleOpenTerminal}
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--chatui-accent)',
              color: '#fff',
              cursor: 'pointer',
              transition: 'opacity 0.2s',
              marginBottom: '12px',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            Open Login in Terminal
          </button>

          <p style={{ margin: 0, fontSize: '11px', opacity: 0.5 }}>
            Or run <code style={{ background: 'rgba(128,128,128,0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>claude auth login</code> manually
          </p>
        </div>
      </div>
    </div>
  )
}
