import { useState, useEffect } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { postMessage } from '../lib/vscode'

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
    <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium opacity-80">Claude Code</span>
        {sessionId && (
          <span className="text-[10px] opacity-40 font-mono">
            {sessionId.substring(0, 8)}
          </span>
        )}
        {isProcessing && (
          <>
            <span className="inline-block w-2 h-2 rounded-full bg-[#ed6e1d] animate-pulse" />
            {requestStartTime && <RequestTimer startTime={requestStartTime} />}
          </>
        )}
      </div>

      <div className="flex items-center gap-1.5">
        {totals.totalCost > 0 && (
          <span className="text-[11px] opacity-50">{formatCost(totals.totalCost)}</span>
        )}

        <NavButton
          label="History"
          active={activeView === 'history'}
          onClick={() => setActiveView(activeView === 'history' ? 'chat' : 'history')}
        />
        <NavButton
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => setActiveView(activeView === 'settings' ? 'chat' : 'settings')}
        />
        <NavButton
          label="MCP"
          active={activeView === 'mcp'}
          onClick={() => setActiveView(activeView === 'mcp' ? 'chat' : 'mcp')}
        />

        <button
          onClick={handleNewSession}
          className="text-xs px-2 py-1 rounded bg-transparent border border-[var(--vscode-input-border)] hover:bg-[var(--vscode-button-background)] hover:text-[var(--vscode-button-foreground)] transition-colors cursor-pointer"
          title="New Session"
        >
          + New
        </button>
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

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer border-none transition-colors ${
        active
          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
          : 'bg-transparent opacity-50 hover:opacity-80 text-inherit'
      }`}
    >
      {label}
    </button>
  )
}
