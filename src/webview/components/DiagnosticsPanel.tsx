import { useEffect } from 'react'
import { useUIStore } from '../store'
import { postMessage } from '../hooks'
import type { DiagnosticCheck, DiagnosticStatus } from '../../shared/types'

const STATUS_ICONS: Record<DiagnosticStatus, { icon: string; color: string }> = {
  pass:    { icon: '\u2713', color: '#3fb950' },
  fail:    { icon: '\u2717', color: '#e74c3c' },
  warn:    { icon: '\u26a0', color: '#ff9500' },
  running: { icon: '\u25cb', color: 'var(--vscode-foreground)' },
  skipped: { icon: '\u2014', color: 'var(--vscode-disabledForeground)' },
}

const CATEGORY_LABELS: Record<string, string> = {
  cli: 'CLI',
  auth: 'Authentication',
  network: 'Network & Usage',
  mcp: 'MCP Servers',
  config: 'Configuration',
  runtime: 'Runtime',
}

export function DiagnosticsPanel() {
  const diagnosticsResult = useUIStore((s) => s.diagnosticsResult)
  const setActiveView = useUIStore((s) => s.setActiveView)

  // Auto-run diagnostics on mount if no results yet
  useEffect(() => {
    if (!diagnosticsResult) {
      postMessage({ type: 'runDiagnostics' })
    }
  }, [diagnosticsResult])

  const handleRerun = () => {
    useUIStore.getState().setDiagnosticsResult(null)
    postMessage({ type: 'runDiagnostics' })
  }

  const handleFix = (action: string, checkId: string) => {
    postMessage({ type: 'diagnosticFixAction', action, checkId })
  }

  // Group checks by category
  const groups = new Map<string, DiagnosticCheck[]>()
  if (diagnosticsResult) {
    for (const check of diagnosticsResult.checks) {
      const list = groups.get(check.category) || []
      list.push(check)
      groups.set(check.category, list)
    }
  }

  const isRunning = diagnosticsResult?.checks.some(c => c.status === 'running') ?? false

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ padding: '16px' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView('chat')}
            className="cursor-pointer border-none"
            style={{
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              opacity: 0.7,
              padding: '4px 8px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '12px',
            }}
            title="Back to chat"
          >
            &larr; Back
          </button>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
            Diagnostics
          </h3>
        </div>
        <button
          onClick={handleRerun}
          disabled={isRunning}
          className="cursor-pointer border-none"
          style={{
            background: 'var(--chatui-accent)',
            color: '#fff',
            padding: '6px 14px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontWeight: 500,
            opacity: isRunning ? 0.5 : 1,
          }}
        >
          {isRunning ? 'Running...' : 'Re-run'}
        </button>
      </div>

      {/* Summary */}
      {diagnosticsResult && !isRunning && (
        <div
          className="flex gap-4 mb-4"
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--chatui-glass-bg)',
            border: '1px solid var(--chatui-glass-border)',
            fontSize: '13px',
          }}
        >
          <span style={{ color: '#3fb950' }}>
            {diagnosticsResult.summary.pass} passed
          </span>
          {diagnosticsResult.summary.fail > 0 && (
            <span style={{ color: '#e74c3c' }}>
              {diagnosticsResult.summary.fail} failed
            </span>
          )}
          {diagnosticsResult.summary.warn > 0 && (
            <span style={{ color: '#ff9500' }}>
              {diagnosticsResult.summary.warn} warning(s)
            </span>
          )}
        </div>
      )}

      {/* Check groups */}
      {!diagnosticsResult && (
        <div style={{ opacity: 0.5, fontSize: '13px', textAlign: 'center', padding: '40px 0' }}>
          Loading diagnostics...
        </div>
      )}

      {Array.from(groups.entries()).map(([category, checks]) => (
        <div key={category} className="mb-4">
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              opacity: 0.5,
              marginBottom: '8px',
            }}
          >
            {CATEGORY_LABELS[category] || category}
          </div>

          <div
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--chatui-glass-border)',
              overflow: 'hidden',
            }}
          >
            {checks.map((check, i) => (
              <CheckRow
                key={check.id}
                check={check}
                onFix={handleFix}
                isLast={i === checks.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CheckRow({
  check,
  onFix,
  isLast,
}: {
  check: DiagnosticCheck
  onFix: (action: string, checkId: string) => void
  isLast: boolean
}) {
  const { icon, color } = STATUS_ICONS[check.status]

  return (
    <div
      style={{
        padding: '10px 14px',
        borderBottom: isLast ? 'none' : '1px solid var(--chatui-glass-border)',
        background: check.status === 'fail'
          ? 'rgba(231, 76, 60, 0.05)'
          : check.status === 'warn'
            ? 'rgba(255, 149, 0, 0.05)'
            : 'transparent',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            style={{
              color,
              fontSize: '14px',
              width: '18px',
              textAlign: 'center',
              animation: check.status === 'running' ? 'pulse 1.5s ease-in-out infinite' : undefined,
            }}
          >
            {icon}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 500 }}>{check.label}</span>
        </div>
        {check.fixAction && check.status === 'fail' && (
          <button
            onClick={() => onFix(check.fixAction!, check.id)}
            className="cursor-pointer border-none"
            style={{
              background: 'var(--chatui-accent)',
              color: '#fff',
              padding: '3px 10px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '11px',
            }}
          >
            Fix
          </button>
        )}
      </div>
      <div style={{ fontSize: '12px', opacity: 0.7, marginLeft: '26px', marginTop: '2px' }}>
        {check.message}
      </div>
      {check.detail && (
        <div
          style={{
            fontSize: '11px',
            opacity: 0.5,
            marginLeft: '26px',
            marginTop: '4px',
            whiteSpace: 'pre-wrap',
            fontFamily: 'var(--vscode-editor-font-family)',
          }}
        >
          {check.detail}
        </div>
      )}
    </div>
  )
}
