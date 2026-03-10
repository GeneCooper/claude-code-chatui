import { useState, useEffect, memo } from 'react'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import type { RequestResult } from '../store'
import { UsageIndicator } from './UsageIndicator'
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
        <HooksIndicator />
        <UsageIndicator />
        <HeaderSep />

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
          title="Settings"
          active={activeView === 'settings'}
          onClick={() => setActiveView(activeView === 'settings' ? 'chat' : 'settings')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

function HooksIndicator() {
  const hooksStatus = useUIStore((s) => s.hooksStatus)
  const [showTooltip, setShowTooltip] = useState(false)

  if (!hooksStatus || hooksStatus.activeCount === 0) return null

  return (
    <div style={{ position: 'relative', marginRight: '6px' }}>
      <button
        onClick={() => {
          // Navigate to settings to manage hooks
          useUIStore.getState().setActiveView('settings')
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className="cursor-pointer border-none flex items-center gap-1"
        style={{
          background: 'rgba(74, 222, 128, 0.1)',
          border: '1px solid rgba(74, 222, 128, 0.2)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px 6px',
          fontSize: '10px',
          color: '#4ade80',
          height: '22px',
          transition: 'all 0.15s ease',
        }}
        title={`${hooksStatus.activeCount} hook(s) active`}
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span style={{ fontWeight: 600 }}>Hooks</span>
        <span style={{
          background: 'rgba(74, 222, 128, 0.2)',
          borderRadius: '50%',
          width: '14px',
          height: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9px',
          fontWeight: 700,
        }}>
          {hooksStatus.activeCount}
        </span>
      </button>

      {/* Tooltip */}
      {showTooltip && hooksStatus.summary.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: '4px',
          background: 'var(--vscode-editorHoverWidget-background, #252526)',
          border: '1px solid var(--vscode-editorHoverWidget-border, #454545)',
          borderRadius: '6px',
          padding: '8px 10px',
          fontSize: '10px',
          lineHeight: 1.6,
          whiteSpace: 'nowrap',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          minWidth: '200px',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '4px', opacity: 0.7 }}>Active Hooks</div>
          {hooksStatus.summary.map((s, i) => (
            <div key={i} style={{ opacity: 0.8, fontFamily: 'var(--vscode-editor-font-family, monospace)' }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

