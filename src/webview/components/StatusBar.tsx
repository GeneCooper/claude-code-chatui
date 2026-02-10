import { useState } from 'react'
import { useChatStore } from '../stores/chatStore'

export function StatusBar() {
  const tokens = useChatStore((s) => s.tokens)
  const totals = useChatStore((s) => s.totals)
  const isProcessing = useChatStore((s) => s.isProcessing)
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

  const statusClass = isProcessing ? 'processing' : 'ready'
  const statusText = isProcessing ? 'Processing...' : 'Ready'

  return (
    <div
      style={{
        padding: '8px 12px',
        background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
        color: '#e1e1e1',
        fontSize: '12px',
        borderTop: '1px solid var(--vscode-panel-border)',
        fontWeight: 500,
      }}
    >
      {/* Main status row */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        onClick={() => setShowDetails(!showDetails)}
      >
        {/* Status indicator */}
        <div
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            flexShrink: 0,
            background: isProcessing ? '#ff9500' : '#00d26a',
            boxShadow: isProcessing
              ? '0 0 6px rgba(255, 149, 0, 0.5)'
              : '0 0 6px rgba(0, 210, 106, 0.5)',
            animation: isProcessing ? 'pulse 1.5s ease-in-out infinite' : 'none',
          }}
        />

        <span className="flex-1">{statusText}</span>

        {totals.totalCost > 0 && (
          <span style={{ opacity: 0.7 }}>{formatCost(totals.totalCost)}</span>
        )}

        {tokens.totalTokensInput > 0 && (
          <span style={{ opacity: 0.5 }}>{formatTokens(tokens.totalTokensInput)} in</span>
        )}

        {tokens.totalTokensOutput > 0 && (
          <span style={{ opacity: 0.5 }}>{formatTokens(tokens.totalTokensOutput)} out</span>
        )}
      </div>

      {/* Details panel */}
      {showDetails && totals.requestCount > 0 && (
        <div
          className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-2 pt-2"
          style={{
            fontSize: '10px',
            opacity: 0.6,
            borderTop: '1px solid var(--vscode-panel-border)',
          }}
        >
          <span>Requests:</span>
          <span className="text-right">{totals.requestCount}</span>
          <span>Total Input:</span>
          <span className="text-right">{formatTokens(tokens.totalTokensInput)}</span>
          <span>Total Output:</span>
          <span className="text-right">{formatTokens(tokens.totalTokensOutput)}</span>
          {tokens.cacheReadTokens > 0 && (
            <>
              <span style={{ color: '#4ec9b0' }}>Cache Read:</span>
              <span className="text-right" style={{ color: '#4ec9b0' }}>{formatTokens(tokens.cacheReadTokens)}</span>
            </>
          )}
          {tokens.cacheCreationTokens > 0 && (
            <>
              <span style={{ color: '#cca700' }}>Cache Create:</span>
              <span className="text-right" style={{ color: '#cca700' }}>{formatTokens(tokens.cacheCreationTokens)}</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}
