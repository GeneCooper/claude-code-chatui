import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { postMessage } from '../hooks'


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
  const sessionId = useChatStore((s) => s.sessionId)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const requestStartTime = useUIStore((s) => s.requestStartTime)

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
          Claude Code ChatUI
        </h2>
        {sessionId && (
          <span className="text-[10px] opacity-40 font-mono">
            {sessionId.substring(0, 8)}
          </span>
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

        <HeaderIconButton
          title="New Chat"
          onClick={() => postMessage({ type: 'createNewPanel' })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </HeaderIconButton>

        <HeaderIconButton
          title="History"
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

function UsageIndicator() {
  const rateLimit = useChatStore((s) => s.rateLimit)
  const [showPopup, setShowPopup] = useState(false)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showPopup) return
    const handleClick = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setShowPopup(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showPopup])

  if (!rateLimit) return null

  const sessionPct = Math.round(rateLimit.sessionUtilization * 100)
  const weeklyPct = Math.round(rateLimit.weeklyUtilization * 100)
  const barColor = sessionPct < 50 ? '#4ec9b0' : sessionPct < 80 ? '#cca700' : '#e74c3c'

  const formatResetTime = (ts: number) => {
    if (!ts) return ''
    const now = Date.now() / 1000
    const diff = ts - now
    if (diff <= 0) return 'now'
    if (diff < 3600) return `${Math.ceil(diff / 60)} min`
    const hours = Math.floor(diff / 3600)
    const mins = Math.round((diff % 3600) / 60)
    return `${hours}h ${mins}m`
  }

  const formatResetDate = (ts: number) => {
    if (!ts) return ''
    return new Date(ts * 1000).toLocaleString(undefined, {
      weekday: 'short', hour: 'numeric', minute: '2-digit',
    })
  }

  return (
    <div className="relative" ref={popupRef}>
      <button
        onClick={() => setShowPopup(!showPopup)}
        className="cursor-pointer border-none flex items-center gap-1.5"
        style={{
          background: 'transparent',
          padding: '0 8px',
          height: '28px',
          borderRadius: 'var(--radius-sm)',
          opacity: 0.75,
          color: 'inherit',
          transition: 'all 0.2s ease',
          fontSize: '10px',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { if (!showPopup) e.currentTarget.style.opacity = '0.75' }}
        title="Plan usage limits"
        aria-label="Plan usage limits"
      >
        {/* Mini progress bar */}
        <div style={{
          width: '32px', height: '4px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px', overflow: 'hidden',
        }}>
          <div style={{
            width: `${sessionPct}%`, height: '100%',
            background: barColor,
            borderRadius: '2px',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <span style={{ fontWeight: 500 }}>{sessionPct}%</span>
      </button>

      {showPopup && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '6px',
            background: 'var(--vscode-editorHoverWidget-background, #1e1e1e)',
            border: '1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border))',
            borderRadius: '8px',
            padding: '14px 16px',
            fontSize: '12px',
            zIndex: 1000,
            minWidth: '280px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            color: 'var(--vscode-editorHoverWidget-foreground, #e1e1e1)',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '12px', fontSize: '13px' }}>Plan usage limits</div>

          {/* Current session */}
          <UsageLimitRow
            label="Current session"
            sublabel={`Resets in ${formatResetTime(rateLimit.sessionResetTs)}`}
            pct={sessionPct}
          />

          <div style={{ borderTop: '1px solid rgba(128,128,128,0.15)', margin: '10px 0' }} />

          {/* Weekly limits */}
          <div style={{ fontWeight: 600, marginBottom: '8px' }}>Weekly limits</div>
          <UsageLimitRow
            label="All models"
            sublabel={`Resets ${formatResetDate(rateLimit.weeklyResetTs)}`}
            pct={weeklyPct}
          />
        </div>
      )}
    </div>
  )
}

function UsageLimitRow({ label, sublabel, pct }: { label: string; sublabel: string; pct: number }) {
  const barColor = pct < 50 ? '#4a90d9' : pct < 80 ? '#cca700' : '#e74c3c'

  return (
    <div style={{ marginBottom: '4px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '4px' }}>
        <div>
          <div style={{ fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: '10px', opacity: 0.5 }}>{sublabel}</div>
        </div>
        <span style={{ fontWeight: 600, fontSize: '12px' }}>{pct}% used</span>
      </div>
      <div style={{
        height: '6px',
        background: 'rgba(255,255,255,0.08)',
        borderRadius: '3px',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.max(pct, 1)}%`,
          height: '100%',
          background: barColor,
          borderRadius: '3px',
          transition: 'width 0.3s ease',
        }} />
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
