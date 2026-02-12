import { useChatStore, type PipelineState } from '../store'
import { postMessage } from '../hooks'

export function PipelineProgress() {
  const pipeline = useChatStore((s) => s.pipeline)
  if (!pipeline) return null

  return <PipelineCard pipeline={pipeline} />
}

function PipelineCard({ pipeline }: { pipeline: PipelineState }) {
  const isActive = pipeline.status === 'running' || pipeline.status === 'planning'

  const statusColors: Record<string, string> = {
    planning: '#a855f7',
    running: '#3b82f6',
    completed: '#22c55e',
    failed: '#ef4444',
    cancelled: '#6b7280',
  }

  const statusLabels: Record<string, string> = {
    planning: 'Planning...',
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
    cancelled: 'Cancelled',
  }

  const completedCount = pipeline.steps.filter((s) => s.status === 'completed').length

  return (
    <div
      style={{
        margin: '8px 0 12px',
        padding: '12px 14px',
        borderRadius: '10px',
        background: 'var(--chatui-glass-bg)',
        border: '1px solid var(--chatui-glass-border)',
        fontSize: '12px',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
        <div className="flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={statusColors[pipeline.status]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '13px' }}>Pipeline</span>
          <span
            style={{
              padding: '1px 8px',
              borderRadius: '10px',
              fontSize: '10px',
              fontWeight: 500,
              background: `${statusColors[pipeline.status]}20`,
              color: statusColors[pipeline.status],
              border: `1px solid ${statusColors[pipeline.status]}40`,
            }}
          >
            {statusLabels[pipeline.status]}
          </span>
          {pipeline.steps.length > 0 && (
            <span style={{ opacity: 0.5, fontSize: '11px' }}>
              {completedCount}/{pipeline.steps.length}
            </span>
          )}
        </div>
        {isActive && (
          <button
            onClick={() => postMessage({ type: 'cancelPipeline' })}
            className="cursor-pointer border-none"
            style={{
              padding: '2px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)' }}
          >
            Cancel
          </button>
        )}
        {!isActive && (
          <button
            onClick={() => useChatStore.getState().setPipeline(null)}
            className="cursor-pointer border-none"
            style={{
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '11px',
              background: 'transparent',
              color: 'inherit',
              opacity: 0.5,
              transition: 'opacity 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
            title="Dismiss"
          >
            ×
          </button>
        )}
      </div>

      {/* Goal */}
      <div
        style={{
          marginBottom: '8px',
          opacity: 0.8,
          fontSize: '11px',
          lineHeight: 1.4,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={pipeline.goal}
      >
        {pipeline.goal}
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {pipeline.steps.map((step, idx) => (
          <StepRow key={step.id} step={step} index={idx} />
        ))}
      </div>
    </div>
  )
}

function StepRow({ step, index }: { step: PipelineState['steps'][0]; index: number }) {
  const statusIcons: Record<string, JSX.Element> = {
    pending: (
      <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.3)' }} />
    ),
    running: (
      <span
        style={{
          display: 'inline-block',
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          background: '#3b82f6',
          boxShadow: '0 0 6px rgba(59, 130, 246, 0.5)',
          animation: 'pulse 1.5s ease-in-out infinite',
        }}
      />
    ),
    completed: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    failed: (
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
  }

  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: '3px 6px',
        borderRadius: '6px',
        background: step.status === 'running' ? 'rgba(59, 130, 246, 0.06)' : 'transparent',
        opacity: step.status === 'pending' ? 0.5 : 1,
        transition: 'all 0.2s ease',
      }}
    >
      <span className="flex items-center justify-center" style={{ width: '14px', flexShrink: 0 }}>
        {statusIcons[step.status]}
      </span>
      <span style={{ fontSize: '11px', opacity: 0.6, flexShrink: 0 }}>{index + 1}.</span>
      <span
        style={{
          fontSize: '11px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontWeight: step.status === 'running' ? 500 : 400,
        }}
        title={step.title}
      >
        {step.title}
      </span>
      {step.error && (
        <span style={{ fontSize: '10px', color: '#ef4444', opacity: 0.8, flexShrink: 0 }} title={step.error}>
          error
        </span>
      )}
    </div>
  )
}
