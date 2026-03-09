import { useState, useEffect, memo } from 'react'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import type { RequestResult } from '../store'
import { postMessage } from '../hooks'
import { UsageIndicator } from './UsageIndicator'

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

const STATUS_CONFIG = {
  processing: { color: '#ff9500', glow: 'rgba(255, 149, 0, 0.5)', barColor: 'var(--chatui-accent)' },
  success:    { color: '#3fb950', glow: 'rgba(63, 185, 80, 0.5)',  barColor: '#3fb950' },
  error:      { color: '#e74c3c', glow: 'rgba(231, 76, 60, 0.5)',  barColor: '#e74c3c' },
} as const

export const Header = memo(function Header() {
  const sessionId = useChatStore((s) => s.sessionId)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const activeView = useUIStore((s) => s.activeView)
  const setActiveView = useUIStore((s) => s.setActiveView)
  const requestStartTime = useUIStore((s) => s.requestStartTime)
  const lastRequestResult = useUIStore((s) => s.lastRequestResult)
  const lastRequestDuration = useUIStore((s) => s.lastRequestDuration)

  // Auto-dismiss the result indicator after 3s
  const [showResult, setShowResult] = useState(false)
  useEffect(() => {
    if (!lastRequestResult) { setShowResult(false); return }
    setShowResult(true)
    const timer = setTimeout(() => setShowResult(false), 3000)
    return () => clearTimeout(timer)
  }, [lastRequestResult])

  // Determine the current visual state
  const visualState: 'idle' | 'processing' | 'success' | 'error' =
    isProcessing ? 'processing' :
    showResult && lastRequestResult ? lastRequestResult :
    'idle'

  const config = visualState !== 'idle' ? STATUS_CONFIG[visualState] : null

  return (
    <div
      style={{ position: 'relative', zIndex: 100 }}
    >
    <div
      className="flex items-center justify-between px-4 py-3"
      style={{
        borderBottom: '1px solid var(--chatui-glass-border)',
        backgroundColor: 'var(--chatui-glass-bg)',
        backdropFilter: 'blur(12px)',
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
        {config && (
          <StatusBadge
            visualState={visualState as 'processing' | 'success' | 'error'}
            config={config}
            requestStartTime={requestStartTime}
            lastRequestDuration={lastRequestDuration}
            showResult={showResult}
          />
        )}
      </div>

      <div className="flex items-center" style={{ fontSize: '11px', height: '28px' }}>
        <UsageIndicator />
        <HeaderSep />

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

        <HeaderIconButton
          title="Diagnostics"
          active={activeView === 'diagnostics'}
          onClick={() => setActiveView(activeView === 'diagnostics' ? 'chat' : 'diagnostics')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
        </HeaderIconButton>
      </div>
    </div>
    {/* Progress bar */}
    <HeaderProgressBar visualState={visualState} config={config} />
    </div>
  )
})

/** Status badge: dot + timer/duration + optional icon */
function StatusBadge({
  visualState,
  config,
  requestStartTime,
  lastRequestDuration,
  showResult,
}: {
  visualState: 'processing' | 'success' | 'error'
  config: { color: string; glow: string }
  requestStartTime: number | null
  lastRequestDuration: number | null
  showResult: boolean
}) {
  return (
    <span
      className="flex items-center gap-1.5"
      style={{
        animation: showResult && visualState !== 'processing' ? 'headerResultFadeOut 3s ease forwards' : undefined,
      }}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{
          background: config.color,
          boxShadow: `0 0 6px ${config.glow}`,
          animation: visualState === 'processing' ? 'pulse 1.5s ease-in-out infinite' :
                     visualState === 'error' ? 'headerErrorFlash 0.6s ease' : undefined,
          transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
      />
      {visualState === 'processing' && requestStartTime && (
        <RequestTimer startTime={requestStartTime} />
      )}
      {visualState === 'success' && lastRequestDuration != null && (
        <span className="text-[10px] font-mono" style={{ color: config.color, opacity: 0.8 }}>
          {formatTime(lastRequestDuration)} ✓
        </span>
      )}
      {visualState === 'error' && lastRequestDuration != null && (
        <span className="text-[10px] font-mono" style={{ color: config.color, opacity: 0.8 }}>
          {formatTime(lastRequestDuration)} ✗
        </span>
      )}
    </span>
  )
}

/** Header progress bar with three animation modes */
function HeaderProgressBar({
  visualState,
  config,
}: {
  visualState: 'idle' | 'processing' | 'success' | 'error'
  config: { barColor: string } | null
}) {
  if (visualState === 'idle') return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: '2px',
        overflow: 'hidden',
      }}
    >
      {visualState === 'processing' ? (
        <div
          style={{
            position: 'absolute',
            height: '100%',
            width: '40%',
            background: `linear-gradient(90deg, transparent, ${config!.barColor}, transparent)`,
            animation: 'marquee-slide 1.5s ease-in-out infinite',
          }}
        />
      ) : (
        <div
          style={{
            height: '100%',
            width: '100%',
            background: config!.barColor,
            animation: visualState === 'success'
              ? 'headerBarFillThenFade 1.5s ease forwards'
              : 'headerBarFlashThenFade 1.5s ease forwards',
          }}
        />
      )}
    </div>
  )
}

function formatTime(s: number) {
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}m${sec.toString().padStart(2, '0')}s`
}

function RequestTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [startTime])

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

