import { useUIStore } from '../store'
import { postMessage } from '../hooks'
import { t } from '../i18n'

export function UsageIndicator() {
  const usageData = useUIStore((s) => s.usageData)
  const accountType = useUIStore((s) => s.accountType)

  if (!usageData) return null

  const usageLabel = accountType === 'max' ? t('usage.maxPlan') : accountType === 'pro' ? t('usage.proPlan') : t('usage.apiUsage')

  const sessionPercent = Math.round((usageData.currentSession.usageCost / usageData.currentSession.costLimit) * 100)
  const weeklyPercent = Math.round((usageData.weekly.costLikely / usageData.weekly.costLimit) * 100)
  const maxPercent = Math.max(sessionPercent, weeklyPercent)

  const getColor = (percent: number) => {
    if (percent > 80) return '#ff453a'
    if (percent > 60) return '#ff9500'
    return '#00d26a'
  }

  const indicatorColor = getColor(maxPercent)

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
        title={`Usage: ${sessionPercent}% (5h) / ${weeklyPercent}% (7d)`}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
          <circle cx="12" cy="12" r="4" />
        </svg>
        <span>{maxPercent}%</span>
      </div>

      {/* Hover panel */}
      <div
        className="invisible group-hover:visible opacity-0 group-hover:opacity-100"
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          width: '260px',
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px',
          zIndex: 1000,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          transition: 'opacity 0.15s ease, visibility 0.15s ease',
        }}
      >
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
            {t('usage.refresh')}
          </button>
        </div>

        <UsageBar
          label={t('usage.session')}
          percent={sessionPercent}
          resetTime={usageData.currentSession.resetsIn}
        />

        <UsageBar
          label={t('usage.weekly')}
          percent={weeklyPercent}
          resetTime={usageData.weekly.resetsAt}
        />

        <button
          onClick={() => postMessage({ type: 'openCCUsageTerminal' })}
          className="cursor-pointer border-none w-full"
          style={{
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
          {t('usage.viewDetailed')}
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
