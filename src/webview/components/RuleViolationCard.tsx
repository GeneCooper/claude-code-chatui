import { postMessage } from '../hooks'
import { useChatStore } from '../store'

export function RuleViolationCard() {
  const violations = useChatStore((s) => s.ruleViolations)
  const dismiss = useChatStore((s) => s.dismissRuleViolation)

  if (violations.length === 0) return null

  return (
    <div className="space-y-2" style={{ animation: 'fadeIn 0.3s ease' }}>
      {violations.map((violation) => {
        const isError = violation.severity === 'error'
        const color = isError ? '#e74c3c' : '#f59e0b'
        const bgColor = isError ? 'rgba(231, 76, 60, 0.06)' : 'rgba(245, 158, 11, 0.06)'
        const borderColor = isError ? 'rgba(231, 76, 60, 0.3)' : 'rgba(245, 158, 11, 0.3)'

        return (
          <div
            key={violation.id}
            style={{
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${borderColor}`,
              background: bgColor,
              fontSize: '12px',
            }}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-1">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span style={{ color, fontWeight: 500, fontSize: '11px' }}>
                    {violation.ruleName}
                  </span>
                  <span
                    style={{
                      padding: '0 4px',
                      borderRadius: '3px',
                      background: `${color}20`,
                      color,
                      fontSize: '9px',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {violation.severity}
                  </span>
                </div>
                <p style={{ opacity: 0.7, margin: 0, lineHeight: 1.4 }}>
                  {violation.description}
                </p>
                <span
                  className="cursor-pointer"
                  style={{ color: 'var(--vscode-textLink-foreground)', fontSize: '11px' }}
                  onClick={() => postMessage({ type: 'openFile', filePath: violation.filePath })}
                >
                  {violation.filePath}
                </span>
                {violation.suggestion && (
                  <p style={{ opacity: 0.6, margin: '4px 0 0', fontSize: '11px', fontStyle: 'italic' }}>
                    {violation.suggestion}
                  </p>
                )}
              </div>

              <button
                onClick={() => {
                  dismiss(violation.id)
                  postMessage({ type: 'dismissViolation', violationId: violation.id })
                }}
                className="cursor-pointer border-none shrink-0"
                style={{
                  padding: '2px 4px',
                  background: 'transparent',
                  color: 'inherit',
                  opacity: 0.4,
                  fontSize: '14px',
                  lineHeight: 1,
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
                title="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
