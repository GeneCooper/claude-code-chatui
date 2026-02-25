import { useUIStore, useChatStore } from '../store'
import { postMessage } from '../hooks'

const fmtTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

const fmtCost = (c: number) => {
  if (c === 0) return '$0.00'
  if (c < 0.01) return `$${c.toFixed(4)}`
  return `$${c.toFixed(2)}`
}

const fmtDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`
  const s = ms / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`
}

export function UsageIndicator() {
  const usageData = useUIStore((s) => s.usageData)
  const accountType = useUIStore((s) => s.accountType)
  const tokens = useChatStore((s) => s.tokens)
  const totals = useChatStore((s) => s.totals)

  const hasTokenData = tokens.totalTokensInput > 0 || tokens.totalTokensOutput > 0
  const hasUsageData = !!usageData

  if (!hasTokenData && !hasUsageData) return null

  const usageLabel = accountType === 'max' ? 'Max Plan Usage' : accountType === 'pro' ? 'Pro Plan Usage' : 'API Usage'

  const sessionPercent = usageData ? Math.round((usageData.currentSession.usageCost / usageData.currentSession.costLimit) * 100) : 0
  const weeklyPercent = usageData ? Math.round((usageData.weekly.costLikely / usageData.weekly.costLimit) * 100) : 0
  const maxPercent = Math.max(sessionPercent, weeklyPercent)

  const getColor = (percent: number) => {
    if (percent > 80) return '#ff453a'
    if (percent > 60) return '#ff9500'
    return '#00d26a'
  }

  const indicatorColor = hasUsageData ? getColor(maxPercent) : 'var(--vscode-descriptionForeground)'

  // Cache efficiency
  const cacheTotal = tokens.cacheReadTokens + tokens.cacheCreationTokens
  const cacheHitRate = cacheTotal > 0 ? Math.round((tokens.cacheReadTokens / cacheTotal) * 100) : 0

  return (
    <div className="relative group">
      {/* Compact indicator */}
      <div
        className="flex items-center gap-1"
        style={{
          padding: '0 6px',
          borderRadius: 'var(--radius-sm)',
          fontSize: '10px',
          fontWeight: 500,
          opacity: 0.7,
          color: indicatorColor,
          cursor: 'default',
          transition: 'all 0.2s ease',
          height: '28px',
          lineHeight: '28px',
        }}
        title={hasUsageData ? `Usage: ${sessionPercent}% (5h) / ${weeklyPercent}% (7d)` : `Tokens: ${fmtTokens(tokens.totalTokensInput)} in / ${fmtTokens(tokens.totalTokensOutput)} out`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        {hasUsageData ? <span>{maxPercent}%</span> : <span>{fmtTokens(tokens.totalTokensInput + tokens.totalTokensOutput)}</span>}
      </div>

      {/* Hover panel */}
      <div
        className="invisible group-hover:visible opacity-0 group-hover:opacity-100"
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          width: '280px',
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          transition: 'opacity 0.15s ease, visibility 0.15s ease',
        }}
      >
        {/* --- Rate Limit Section --- */}
        {hasUsageData && (
          <>
            <div className="flex items-center justify-between" style={{ marginBottom: '14px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>{usageLabel}</span>
              <button
                onClick={() => postMessage({ type: 'refreshUsage' })}
                className="cursor-pointer border-none"
                style={{
                  background: 'transparent',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '10px',
                  color: 'var(--vscode-descriptionForeground)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--chatui-accent)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--vscode-descriptionForeground)' }}
              >
                Refresh
              </button>
            </div>

            <UsageBar
              label="Session (5h)"
              percent={sessionPercent}
              resetTime={usageData!.currentSession.resetsIn}
            />

            <UsageBar
              label="Weekly (7d)"
              percent={weeklyPercent}
              resetTime={usageData!.weekly.resetsAt}
            />
          </>
        )}

        {/* --- Token Stats Section --- */}
        {hasTokenData && (
          <>
            {hasUsageData && <div style={{ borderTop: '1px solid var(--vscode-panel-border)', margin: '12px 0' }} />}
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Session Tokens</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 12px', fontSize: '11px' }}>
              <span style={{ opacity: 0.6 }}>Input</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', fontWeight: 500 }}>{fmtTokens(tokens.totalTokensInput)}</span>
              <span style={{ opacity: 0.6 }}>Output</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', fontWeight: 500 }}>{fmtTokens(tokens.totalTokensOutput)}</span>

              {cacheTotal > 0 && (
                <>
                  <span style={{ opacity: 0.6, color: '#4ec9b0' }}>Cache Read</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', color: '#4ec9b0' }}>{fmtTokens(tokens.cacheReadTokens)}</span>
                  <span style={{ opacity: 0.6, color: '#cca700' }}>Cache Write</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', color: '#cca700' }}>{fmtTokens(tokens.cacheCreationTokens)}</span>
                  <span style={{ opacity: 0.6 }}>Cache Hit</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', color: '#4ec9b0', fontWeight: 500 }}>{cacheHitRate}%</span>
                </>
              )}
            </div>
          </>
        )}

        {/* --- Request Stats Section --- */}
        {totals.requestCount > 0 && (
          <>
            <div style={{ borderTop: '1px solid var(--vscode-panel-border)', margin: '12px 0' }} />
            <div style={{ marginBottom: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600 }}>Last Request</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '3px 12px', fontSize: '11px' }}>
              <span style={{ opacity: 0.6 }}>Requests</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', fontWeight: 500 }}>{totals.requestCount}</span>
              <span style={{ opacity: 0.6 }}>Total Cost</span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)', fontWeight: 500 }}>{fmtCost(totals.totalCost)}</span>
              {totals.currentCost != null && totals.currentCost > 0 && (
                <>
                  <span style={{ opacity: 0.6 }}>This Request</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)' }}>{fmtCost(totals.currentCost)}</span>
                </>
              )}
              {totals.currentDuration != null && totals.currentDuration > 0 && (
                <>
                  <span style={{ opacity: 0.6 }}>Duration</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)' }}>{fmtDuration(totals.currentDuration)}</span>
                </>
              )}
              {totals.currentTurns != null && totals.currentTurns > 0 && (
                <>
                  <span style={{ opacity: 0.6 }}>Turns</span>
                  <span style={{ textAlign: 'right', fontFamily: 'var(--vscode-editor-font-family)' }}>{totals.currentTurns}</span>
                </>
              )}
            </div>
          </>
        )}

        {/* --- ccusage button --- */}
        <button
          onClick={() => postMessage({ type: 'openCCUsageTerminal' })}
          className="cursor-pointer border-none w-full"
          style={{
            marginTop: '12px',
            background: 'rgba(128, 128, 128, 0.1)',
            padding: '6px 8px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '10px',
            color: 'var(--vscode-descriptionForeground)',
            textAlign: 'center',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(128, 128, 128, 0.2)'
            e.currentTarget.style.color = 'var(--chatui-accent)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'
            e.currentTarget.style.color = 'var(--vscode-descriptionForeground)'
          }}
        >
          View Detailed Usage (ccusage)
        </button>
      </div>
    </div>
  )
}

function UsageBar({ label, percent, resetTime }: { label: string; percent: number; resetTime: string }) {
  const getColor = (p: number) => {
    if (p > 80) return '#ff453a'
    if (p > 60) return '#ff9500'
    return '#00d26a'
  }

  const color = getColor(percent)

  return (
    <div style={{ marginBottom: '12px' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '4px', fontSize: '11px' }}>
        <span style={{ opacity: 0.7 }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{percent}%</span>
      </div>
      <div
        style={{
          width: '100%',
          height: '6px',
          borderRadius: '3px',
          background: 'rgba(128, 128, 128, 0.15)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(percent, 100)}%`,
            height: '100%',
            borderRadius: '3px',
            background: color,
            transition: 'width 0.5s ease, background 0.3s ease',
          }}
        />
      </div>
      <div style={{ marginTop: '2px', fontSize: '10px', opacity: 0.5 }}>
        Resets: {resetTime}
      </div>
    </div>
  )
}
