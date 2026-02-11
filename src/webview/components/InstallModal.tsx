import { useState } from 'react'
import { postMessage } from '../hooks'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useUIStore } from '../store'
import { t } from '../i18n'

type Stage = 'prompt' | 'installing' | 'success' | 'error'

export function InstallModal() {
  const show = useUIStore((s) => s.showInstallModal)
  const setShow = useUIStore((s) => s.setShowInstallModal)
  const [stage, setStage] = useState<Stage>('prompt')
  const [errorMsg, setErrorMsg] = useState('')

  const handleClose = () => {
    setShow(false)
    setStage('prompt')
    setErrorMsg('')
  }

  const focusTrapRef = useFocusTrap<HTMLDivElement>(show, handleClose)

  if (!show) return null

  const handleInstall = () => {
    setStage('installing')
    postMessage({ type: 'runInstallCommand' })
  }

  // Listen for install result
  ;(window as unknown as { __installCallback?: (success: boolean, error?: string) => void }).__installCallback = (success, error) => {
    if (success) {
      setStage('success')
    } else {
      setStage('error')
      setErrorMsg(error || 'Installation failed. Try installing manually.')
    }
  }

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget && stage !== 'installing') handleClose() }}
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
        {stage !== 'installing' && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 12px 0 0' }}>
            <button
              onClick={handleClose}
              style={{ background: 'none', border: 'none', color: 'var(--vscode-foreground)', cursor: 'pointer', fontSize: '16px', padding: '4px', opacity: 0.6 }}
            >
              {'✕'}
            </button>
          </div>
        )}

        <div style={{ padding: '0 32px 32px', textAlign: 'center' }}>
          {/* Prompt stage */}
          {stage === 'prompt' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--chatui-accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15" />
                  <path d="M12 3V15M12 15L7 10M12 15L17 10" />
                </svg>
              </div>
              <h3 id="install-modal-title" style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 600 }}>
                {t('install.title')}
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: '12px', opacity: 0.6, lineHeight: 1.5 }}>
                {t('install.required')}
              </p>
              <button
                onClick={handleInstall}
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
                {t('install.installNow')}
              </button>
              <a
                href="https://docs.anthropic.com/en/docs/claude-code"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: 'var(--chatui-accent)', opacity: 0.8, textDecoration: 'none' }}
              >
                {t('install.viewDocs')}
              </a>
            </>
          )}

          {/* Installing stage */}
          {stage === 'installing' && (
            <div style={{ padding: '20px 0' }}>
              <div className="loading-dots" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'center', gap: '4px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--chatui-accent)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0s' }} />
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--chatui-accent)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.16s' }} />
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--chatui-accent)', animation: 'bounce 1.4s infinite ease-in-out both', animationDelay: '0.32s' }} />
              </div>
              <p style={{ margin: 0, fontSize: '13px', fontWeight: 500 }}>{t('install.installing')}</p>
              <p style={{ margin: '4px 0 0', fontSize: '11px', opacity: 0.5 }}>{t('install.mayTakeMinute')}</p>
            </div>
          )}

          {/* Success stage */}
          {stage === 'success' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>{t('install.installed')}</p>
              <p style={{ margin: '0 0 20px', fontSize: '12px', opacity: 0.5 }}>
                {t('install.nowRun')} <code style={{ background: 'rgba(128,128,128,0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>claude auth login</code> {t('install.inTerminal')}
              </p>
              <button
                onClick={handleClose}
                style={{
                  padding: '8px 20px',
                  fontSize: '12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--vscode-panel-border)',
                  background: 'transparent',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                {t('install.close')}
              </button>
            </>
          )}

          {/* Error stage */}
          {stage === 'error' && (
            <>
              <div style={{ marginBottom: '16px' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '14px', fontWeight: 600 }}>{t('install.failed')}</p>
              <p style={{ margin: '0 0 12px', fontSize: '11px', opacity: 0.5, lineHeight: 1.4 }}>
                {errorMsg}
              </p>
              <p style={{ margin: '0 0 20px', fontSize: '11px', opacity: 0.6 }}>
                {t('install.tryManually')} <code style={{ background: 'rgba(128,128,128,0.15)', padding: '2px 6px', borderRadius: '4px', fontSize: '10px' }}>npm install -g @anthropic-ai/claude-code</code>
              </p>
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                <button
                  onClick={() => { setStage('prompt'); setErrorMsg('') }}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'var(--chatui-accent)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {t('install.retry')}
                </button>
                <button
                  onClick={handleClose}
                  style={{
                    padding: '8px 16px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--vscode-panel-border)',
                    background: 'transparent',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {t('install.close')}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
