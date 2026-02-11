import { useState, useEffect } from 'react'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { postMessage } from '../hooks'
import { UsageIndicator } from './UsageIndicator'
import { BranchIndicator } from './BranchIndicator'
import { t } from '../i18n'

declare global {
  interface Window { __ICON_URI__?: string }
}

function LogoIcon({ size = 20 }: { size?: number }) {
  const iconUri = window.__ICON_URI__
  if (!iconUri) return null
  return (
    <img
      src={iconUri}
      alt="Logo"
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
    />
  )
}

export { LogoIcon }

export function Header() {
  const { sessionId, isProcessing, branchMetadata } = useChatStore()
  const { activeView, setActiveView, requestStartTime } = useUIStore()

  return (
    <div
      role="banner"
      className="flex items-center justify-between px-4 py-3"
      style={{
        borderBottom: '1px solid var(--chatui-glass-border)',
        backgroundColor: 'var(--chatui-glass-bg)',
        backdropFilter: 'blur(12px)',
        position: 'relative',
        zIndex: 100,
      }}
    >
      <div className="flex items-center gap-2">
        <LogoIcon size={20} />
        <h2 className="m-0" style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.3px' }}>
          {t('app.title')}
        </h2>
        {sessionId && (
          <span className="text-[10px] opacity-40 font-mono">
            {sessionId.substring(0, 8)}
          </span>
        )}
        {branchMetadata?.parentConversationTitle && (
          <BranchIndicator parentTitle={branchMetadata.parentConversationTitle} />
        )}
        {isProcessing && (
          <>
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: '#ff9500',
                boxShadow: '0 0 6px rgba(255, 149, 0, 0.5)',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
            />
            {requestStartTime && <RequestTimer startTime={requestStartTime} />}
          </>
        )}
      </div>

      <div className="flex items-center" style={{ fontSize: '11px', height: '28px' }}>
        <UsageIndicator />
        <HeaderSep />

        <HeaderIconButton
          title={t('header.newChat')}
          onClick={() => postMessage({ type: 'createNewPanel' })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </HeaderIconButton>

        <HeaderIconButton
          title={t('header.history')}
          active={activeView === 'history'}
          onClick={() => setActiveView(activeView === 'history' ? 'chat' : 'history')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </HeaderIconButton>
      </div>
    </div>
  )
}

function RequestTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

  const formatTime = (s: number) => {
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}m${sec.toString().padStart(2, '0')}s`
  }

  return (
    <span className="text-[10px] opacity-40 font-mono">{formatTime(elapsed)}</span>
  )
}

function HeaderSep() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '1px',
        height: '14px',
        background: 'var(--vscode-panel-border, rgba(255,255,255,0.2))',
        opacity: 0.5,
        margin: '0 8px',
        verticalAlign: 'middle',
      }}
    />
  )
}

function HeaderIconButton({
  title,
  active,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className="cursor-pointer border-none flex items-center justify-center"
      style={{
        background: 'transparent',
        padding: '0 8px',
        borderRadius: 'var(--radius-sm)',
        opacity: active ? 1 : 0.75,
        color: active ? 'var(--chatui-accent)' : 'inherit',
        transition: 'all 0.2s ease',
        height: '28px',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = '0.75' }}
    >
      {children}
    </button>
  )
}

