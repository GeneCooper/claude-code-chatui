import { useChatStore } from '../stores/chatStore'
import { postMessage } from '../lib/vscode'

export function Header() {
  const { sessionId, isProcessing, totals } = useChatStore()

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
          <span className="inline-block w-2 h-2 rounded-full bg-[#ed6e1d] animate-pulse" />
        )}
      </div>

      <div className="flex items-center gap-3">
        {totals.totalCost > 0 && (
          <span className="text-[11px] opacity-50">{formatCost(totals.totalCost)}</span>
        )}
        {totals.requestCount > 0 && (
          <span className="text-[11px] opacity-50">{totals.requestCount} reqs</span>
        )}
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
