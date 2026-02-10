import { useChatStore } from '../stores/chatStore'

export function StatusBar() {
  const tokens = useChatStore((s) => s.tokens)
  const totals = useChatStore((s) => s.totals)

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

  return (
    <div className="flex items-center gap-3 px-3 py-1 text-[10px] opacity-60 border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
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
        <span title="Cache read tokens" className="text-[var(--vscode-charts-green)]">
          {formatTokens(tokens.cacheReadTokens)} cached
        </span>
      )}
    </div>
  )
}
