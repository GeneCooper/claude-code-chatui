import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../store'
import { postMessage } from '../hooks'

const STATUS_PHRASES = [
  'Claude is working',
  'Analyzing your request',
  'Thinking through this',
  'Processing',
  'Reasoning',
  'Working on it',
]

function useProcessingText(isProcessing: boolean) {
  const [index, setIndex] = useState(0)
  const [dotCount, setDotCount] = useState(1)
  const intervalRef = useRef<ReturnType<typeof setInterval>>()
  const dotRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    if (isProcessing) {
      setIndex(0)
      setDotCount(1)
      intervalRef.current = setInterval(() => {
        setIndex((i) => (i + 1) % STATUS_PHRASES.length)
      }, 4000)
      dotRef.current = setInterval(() => {
        setDotCount((d) => (d % 3) + 1)
      }, 500)
    }
    return () => {
      clearInterval(intervalRef.current)
      clearInterval(dotRef.current)
    }
  }, [isProcessing])

  if (!isProcessing) return 'Ask anything or type / for commands'
  return STATUS_PHRASES[index] + '.'.repeat(dotCount)
}

export function StatusBar() {
  const tokens = useChatStore((s) => s.tokens)
  const totals = useChatStore((s) => s.totals)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const [showDetails, setShowDetails] = useState(false)
  const statusText = useProcessingText(isProcessing)

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

  // Calculate cache savings percentage
  const totalInput = tokens.totalTokensInput
  const cacheTotal = tokens.cacheReadTokens + tokens.cacheCreationTokens
  const cacheSavingsPercent = totalInput > 0 && cacheTotal > 0
    ? Math.round((tokens.cacheReadTokens / (totalInput + cacheTotal)) * 100)
    : 0

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
        {isProcessing ? (
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              flexShrink: 0,
              background: '#ff9500',
              boxShadow: '0 0 6px rgba(255, 149, 0, 0.5)',
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ) : (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        )}

        <span className="flex-1" style={{ opacity: isProcessing ? 1 : 0.5 }}>{statusText}</span>

        {totals.totalCost > 0 && (
          <span style={{ opacity: 0.7 }}>{formatCost(totals.totalCost)}</span>
        )}

        {tokens.totalTokensInput > 0 && (
          <span style={{ opacity: 0.5 }}>{formatTokens(tokens.totalTokensInput)} in</span>
        )}

        {tokens.totalTokensOutput > 0 && (
          <span style={{ opacity: 0.5 }}>{formatTokens(tokens.totalTokensOutput)} out</span>
        )}

        {/* Context usage indicator */}
        {tokens.currentInputTokens > 0 && (
          <ContextIndicator
            inputTokens={tokens.currentInputTokens}
            isProcessing={isProcessing}
          />
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
          <span>Total Cost:</span>
          <span className="text-right" style={{ fontWeight: 600 }}>{formatCost(totals.totalCost)}</span>

          {/* Token breakdown */}
          <span style={{ marginTop: '4px', gridColumn: '1 / -1', borderTop: '1px solid rgba(128,128,128,0.1)', paddingTop: '4px', fontWeight: 600 }}>
            Tokens
          </span>
          <span>Input:</span>
          <span className="text-right">{formatTokens(tokens.totalTokensInput)}</span>
          <span>Output:</span>
          <span className="text-right">{formatTokens(tokens.totalTokensOutput)}</span>

          {/* Current request tokens */}
          {tokens.currentInputTokens > 0 && (
            <>
              <span style={{ opacity: 0.7 }}>Last Input:</span>
              <span className="text-right" style={{ opacity: 0.7 }}>{formatTokens(tokens.currentInputTokens)}</span>
            </>
          )}
          {tokens.currentOutputTokens > 0 && (
            <>
              <span style={{ opacity: 0.7 }}>Last Output:</span>
              <span className="text-right" style={{ opacity: 0.7 }}>{formatTokens(tokens.currentOutputTokens)}</span>
            </>
          )}

          {/* Cache breakdown */}
          {(tokens.cacheReadTokens > 0 || tokens.cacheCreationTokens > 0) && (
            <>
              <span style={{ marginTop: '4px', gridColumn: '1 / -1', borderTop: '1px solid rgba(128,128,128,0.1)', paddingTop: '4px', fontWeight: 600 }}>
                Cache
              </span>
            </>
          )}
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
          {cacheSavingsPercent > 0 && (
            <>
              <span style={{ color: '#4ec9b0' }}>Cache Savings:</span>
              <span className="text-right" style={{ color: '#4ec9b0' }}>{cacheSavingsPercent}%</span>
            </>
          )}
        </div>
      )}
    </div>
  )
}

const CONTEXT_LIMIT = 200_000

function ContextIndicator({ inputTokens, isProcessing }: { inputTokens: number; isProcessing: boolean }) {
  const percent = Math.min(Math.round((inputTokens / CONTEXT_LIMIT) * 100), 100)

  const getColor = (p: number) => {
    if (p >= 80) return '#ff453a'
    if (p >= 60) return '#ff9500'
    return '#4ec9b0'
  }

  const color = getColor(percent)

  const handleCompact = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isProcessing) return
    postMessage({ type: 'executeSlashCommand', command: 'compact' })
  }

  return (
    <button
      onClick={handleCompact}
      disabled={isProcessing}
      className="flex items-center gap-1.5 border-none"
      style={{
        background: percent >= 60 ? `${color}15` : 'transparent',
        border: `1px solid ${percent >= 60 ? `${color}40` : 'rgba(128,128,128,0.2)'}`,
        borderRadius: '10px',
        padding: '1px 8px',
        cursor: isProcessing ? 'default' : 'pointer',
        transition: 'all 0.2s ease',
        color,
        fontSize: '10px',
        fontWeight: 600,
        lineHeight: '16px',
      }}
      title={`Context: ${percent}% (${Math.round(inputTokens / 1000)}K / ${CONTEXT_LIMIT / 1000}K tokens) — Click to compact`}
    >
      {/* Mini progress bar */}
      <div
        style={{
          width: '24px',
          height: '4px',
          borderRadius: '2px',
          background: 'rgba(128,128,128,0.2)',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: '2px',
            background: color,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
      <span>{percent}%</span>
    </button>
  )
}
