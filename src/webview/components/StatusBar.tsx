import { useState } from 'react'
import { useChatStore } from '../stores/chatStore'

export function StatusBar() {
  const tokens = useChatStore((s) => s.tokens)
  const totals = useChatStore((s) => s.totals)
  const [showDetails, setShowDetails] = useState(false)

  const formatTokens = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  const formatCost = (cost: number) => {
    if (cost === 0) return '$0.00'
    if (cost < 0.01) return `$${cost.toFixed(4)}`
    return `$${cost.toFixed(2)}`
  }

  // Don't render if no data yet
  if (totals.requestCount === 0 && tokens.totalTokensInput === 0) {
    return null
  }

  const cacheTotal = tokens.cacheReadTokens + tokens.cacheCreationTokens
  const cachePercent = tokens.totalTokensInput > 0
    ? Math.round((tokens.cacheReadTokens / tokens.totalTokensInput) * 100)
    : 0

  return (
    <div className="border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
      <div
        className="flex items-center gap-3 px-3 py-1 text-[10px] opacity-60 cursor-pointer hover:opacity-80"
        onClick={() => setShowDetails(!showDetails)}
      >
        {totals.requestCount > 0 && (
          <span title="Total requests">
            {totals.requestCount} req{totals.requestCount !== 1 ? 's' : ''}
          </span>
        )}

        {totals.totalCost > 0 && (
          <span title="Total cost">{formatCost(totals.totalCost)}</span>
        )}

        {tokens.totalTokensInput > 0 && (
          <span title="Input tokens">
            {formatTokens(tokens.totalTokensInput)} in
          </span>
        )}

        {tokens.totalTokensOutput > 0 && (
          <span title="Output tokens">
            {formatTokens(tokens.totalTokensOutput)} out
          </span>
        )}

        {tokens.cacheReadTokens > 0 && (
          <span title="Cache read tokens" className="text-[var(--vscode-charts-green,#4ec9b0)]">
            {formatTokens(tokens.cacheReadTokens)} cached ({cachePercent}%)
          </span>
        )}

        <span className="ml-auto opacity-40">{showDetails ? '\u25B2' : '\u25BC'}</span>
      </div>

      {showDetails && (
        <div className="px-3 pb-2 text-[10px] opacity-50 space-y-0.5 border-t border-[var(--vscode-panel-border)] pt-1">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
            <span>Total Input:</span>
            <span className="text-right">{formatTokens(tokens.totalTokensInput)}</span>
            <span>Total Output:</span>
            <span className="text-right">{formatTokens(tokens.totalTokensOutput)}</span>
            <span>Current Input:</span>
            <span className="text-right">{formatTokens(tokens.currentInputTokens)}</span>
            <span>Current Output:</span>
            <span className="text-right">{formatTokens(tokens.currentOutputTokens)}</span>
            {tokens.cacheReadTokens > 0 && (
              <>
                <span className="text-[var(--vscode-charts-green,#4ec9b0)]">Cache Read:</span>
                <span className="text-right text-[var(--vscode-charts-green,#4ec9b0)]">{formatTokens(tokens.cacheReadTokens)}</span>
              </>
            )}
            {tokens.cacheCreationTokens > 0 && (
              <>
                <span className="text-[var(--vscode-charts-yellow,#cca700)]">Cache Create:</span>
                <span className="text-right text-[var(--vscode-charts-yellow,#cca700)]">{formatTokens(tokens.cacheCreationTokens)}</span>
              </>
            )}
            {cacheTotal > 0 && (
              <>
                <span>Cache Total:</span>
                <span className="text-right">{formatTokens(cacheTotal)}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
