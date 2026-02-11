import { useState, useEffect } from 'react'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { useTabStore } from '../store'
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

export { LogoIcon }

export function Header() {
  const { sessionId, isProcessing } = useChatStore()
  const { activeView, setActiveView, requestStartTime } = useUIStore()

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

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs)
  const activeTabId = useTabStore((s) => s.activeTabId)
  const processingTabId = useTabStore((s) => s.processingTabId)

  return (
    <div
      className="flex items-center"
      style={{
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-editorGroupHeader-tabsBackground, var(--vscode-panel-background))',
        overflowX: 'auto',
        overflowY: 'hidden',
        minHeight: '30px',
        fontSize: '11px',
        scrollbarWidth: 'none',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.tabId === activeTabId
        const isProcessing = tab.tabId === processingTabId
        return (
          <div
            key={tab.tabId}
            onClick={() => {
              if (!isActive) {
                useChatStore.getState().clearMessages()
                useChatStore.getState().setSessionId(null)
                useUIStore.getState().setRequestStartTime(null)
                useTabStore.getState().setActiveTabId(tab.tabId)
                postMessage({ type: 'switchTab', tabId: tab.tabId })
              }
            }}
            className="flex items-center gap-1 cursor-pointer shrink-0 group"
            style={{
              padding: '0 10px',
              height: '30px',
              borderRight: '1px solid var(--vscode-panel-border)',
              background: isActive
                ? 'var(--vscode-tab-activeBackground, var(--vscode-editor-background))'
                : 'transparent',
              borderBottom: isActive
                ? '2px solid var(--chatui-accent)'
                : '2px solid transparent',
              opacity: isActive ? 1 : 0.7,
              transition: 'all 0.15s ease',
              maxWidth: '160px',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.opacity = '0.7' }}
          >
            {isProcessing && (
              <span
                className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  background: '#ff9500',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            )}
            <span className="truncate" style={{ maxWidth: '120px' }}>{tab.title}</span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  postMessage({ type: 'closeTab', tabId: tab.tabId })
                }}
                className="cursor-pointer border-none bg-transparent flex items-center justify-center shrink-0"
                style={{
                  color: 'inherit',
                  opacity: 0,
                  padding: '0 2px',
                  fontSize: '12px',
                  lineHeight: 1,
                  transition: 'opacity 0.1s',
                  width: '16px',
                  height: '16px',
                  borderRadius: '3px',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0'
                  e.currentTarget.style.background = 'transparent'
                }}
                title="Close tab"
              >
                ×
              </button>
            )}
          </div>
        )
      })}
      <button
        onClick={() => postMessage({ type: 'createTab' })}
        className="cursor-pointer border-none bg-transparent flex items-center justify-center shrink-0"
        style={{
          color: 'inherit',
          opacity: 0.5,
          padding: '0 8px',
          height: '30px',
          fontSize: '14px',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
        title="New tab"
      >
        +
      </button>
    </div>
  )
}
