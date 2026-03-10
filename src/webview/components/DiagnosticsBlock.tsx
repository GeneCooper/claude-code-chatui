import { memo, useState } from 'react'
import { postMessage } from '../hooks'
import type { DiagnosticItem, DiagnosticsData } from '../../shared/types'

// ============================================================================
// Severity config
// ============================================================================

const SEVERITY_CONFIG: Record<DiagnosticItem['severity'], { icon: string; color: string; label: string }> = {
  error: { icon: '✕', color: '#e74c3c', label: 'Error' },
  warning: { icon: '⚠', color: '#f59e0b', label: 'Warning' },
  info: { icon: 'ℹ', color: '#3b82f6', label: 'Info' },
  hint: { icon: '💡', color: '#8b5cf6', label: 'Hint' },
}

// ============================================================================
// DiagnosticsBlock
// ============================================================================

export const DiagnosticsBlock = memo(function DiagnosticsBlock({ data }: { data: DiagnosticsData }) {
  const { filePath, diagnostics } = data
  const [expanded, setExpanded] = useState(true)

  const fileName = filePath.replace(/.*[/\\]/, '')
  const errorCount = diagnostics.filter(d => d.severity === 'error').length
  const warningCount = diagnostics.filter(d => d.severity === 'warning').length

  const handleClickItem = (item: DiagnosticItem) => {
    postMessage({
      type: 'openFileAtLine',
      filePath,
      line: item.line,
      column: item.column,
    })
  }

  const summaryParts: string[] = []
  if (errorCount > 0) summaryParts.push(`${errorCount} error${errorCount > 1 ? 's' : ''}`)
  if (warningCount > 0) summaryParts.push(`${warningCount} warning${warningCount > 1 ? 's' : ''}`)
  const otherCount = diagnostics.length - errorCount - warningCount
  if (otherCount > 0) summaryParts.push(`${otherCount} other`)

  return (
    <div
      className="overflow-hidden text-xs"
      style={{
        border: errorCount > 0
          ? '1px solid rgba(231, 76, 60, 0.25)'
          : '1px solid rgba(245, 158, 11, 0.25)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-none text-inherit"
        style={{
          padding: '6px 10px',
          background: errorCount > 0
            ? 'rgba(231, 76, 60, 0.06)'
            : 'rgba(245, 158, 11, 0.06)',
        }}
      >
        <span style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: errorCount > 0 ? '#e74c3c' : '#f59e0b',
        }} />
        <span style={{ fontWeight: 500, opacity: 0.9 }}>
          {fileName}
        </span>
        <span style={{ opacity: 0.5 }}>
          {summaryParts.join(', ')}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            opacity: 0.4,
            fontSize: '10px',
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.15s ease',
          }}
        >
          ▼
        </span>
      </button>

      {/* Diagnostic items */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {diagnostics.map((item, i) => {
            const config = SEVERITY_CONFIG[item.severity]
            return (
              <button
                key={i}
                onClick={() => handleClickItem(item)}
                className="flex items-start gap-2 w-full text-left cursor-pointer bg-transparent border-none text-inherit"
                style={{
                  padding: '4px 10px',
                  borderBottom: i < diagnostics.length - 1 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                  transition: 'background 0.1s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                title={`Click to open ${fileName}:${item.line}:${item.column}`}
              >
                {/* Severity icon */}
                <span
                  style={{
                    color: config.color,
                    fontSize: '10px',
                    fontWeight: 700,
                    minWidth: '14px',
                    textAlign: 'center',
                    lineHeight: '18px',
                  }}
                >
                  {config.icon}
                </span>

                {/* Line number */}
                <span
                  style={{
                    color: 'var(--chatui-accent, #7c6fe0)',
                    fontFamily: 'var(--vscode-editor-font-family, monospace)',
                    fontSize: '10px',
                    minWidth: '36px',
                    lineHeight: '18px',
                    opacity: 0.8,
                  }}
                >
                  L{item.line}
                </span>

                {/* Message */}
                <span
                  style={{
                    flex: 1,
                    lineHeight: '18px',
                    opacity: 0.85,
                    wordBreak: 'break-word',
                  }}
                >
                  {item.message}
                </span>

                {/* Source + code badge */}
                {(item.source || item.code) && (
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 600,
                      opacity: 0.45,
                      padding: '1px 4px',
                      borderRadius: '2px',
                      background: 'rgba(255,255,255,0.06)',
                      whiteSpace: 'nowrap',
                      lineHeight: '16px',
                      alignSelf: 'center',
                    }}
                  >
                    {item.source}{item.code ? `(${item.code})` : ''}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
})
