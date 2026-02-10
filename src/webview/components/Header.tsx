import { useState, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { postMessage } from '../lib/vscode'
import { UsageIndicator } from './UsageIndicator'

function LogoSVG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ed6e1d" />
          <stop offset="100%" stopColor="#de5513" />
        </linearGradient>
      </defs>
      <rect width="100" height="100" rx="22" fill="url(#logoGrad)" />
      <path d="M30 35 L50 25 L70 35 L70 55 L50 65 L30 55Z" stroke="white" strokeWidth="5" fill="none" strokeLinejoin="round" />
      <circle cx="50" cy="45" r="6" fill="white" />
    </svg>
  )
}

export { LogoSVG }

export function Header() {
  const { sessionId, isProcessing, totals } = useChatStore()
  const { activeView, setActiveView, requestStartTime } = useUIStore()

  const handleNewSession = () => {
    postMessage({ type: 'newSession' })
  }

  const formatCost = (cost: number) => {
    if (cost === 0) return ''
    return `$${cost.toFixed(4)}`
  }

  return (
    <div
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
        <LogoSVG size={20} />
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

      <div className="flex items-center gap-1.5">
        {totals.totalCost > 0 && (
          <span className="text-[11px] opacity-50">{formatCost(totals.totalCost)}</span>
        )}

        <UsageIndicator />

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

        <span style={{ color: 'var(--vscode-panel-border)', opacity: 0.5, margin: '0 4px' }}>|</span>

        <HeaderIconButton
          title="New Chat"
          onClick={handleNewSession}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
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
      className="cursor-pointer border-none flex items-center justify-center"
      style={{
        background: 'transparent',
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        opacity: active ? 1 : 0.75,
        color: active ? 'var(--chatui-accent)' : 'inherit',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.opacity = '0.75' }}
    >
      {children}
    </button>
  )
}
