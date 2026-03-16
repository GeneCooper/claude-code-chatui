import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { useChatStore } from '../store'
import { useChainDiagnosis, type ChainStep, type ChainDiagnosis } from '../hooks/useChainDiagnosis'
import { postMessage } from '../hooks'

// ============================================================================
// ChainProgressBar — top progress indicator
// ============================================================================

const ChainProgressBar = memo(function ChainProgressBar({
  diagnosis,
}: {
  diagnosis: ChainDiagnosis
}) {
  const { progress, completed, failed, total, running, isDone } = diagnosis
  const pct = Math.round(progress * 100)

  // Color based on state
  let barColor = 'var(--chatui-accent, #6366f1)'
  let statusText = `${completed}/${total} steps`
  if (failed > 0) {
    barColor = '#e74c3c'
    statusText = `${failed} failed, ${completed} done / ${total}`
  } else if (isDone) {
    barColor = '#3fb950'
    statusText = `All ${total} steps completed`
  } else if (running > 0) {
    statusText = `${completed}/${total} steps (${running} running)`
  }

  return (
    <div style={{ padding: '12px 16px 8px' }}>
      {/* Status text */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '6px',
        fontSize: '11px',
      }}>
        <span style={{ opacity: 0.7, fontWeight: 500 }}>{statusText}</span>
        <span style={{ opacity: 0.4, fontFamily: 'var(--vscode-editor-font-family)', fontSize: '10px' }}>
          {pct}%
        </span>
      </div>

      {/* Progress bar track */}
      <div
        style={{
          height: '3px',
          borderRadius: '2px',
          background: 'var(--chatui-surface-2)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Filled portion */}
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: barColor,
            borderRadius: '2px',
            transition: 'width 0.3s var(--ease-out-expo), background 0.3s ease',
            position: 'relative',
          }}
        >
          {/* Shimmer for running state */}
          {running > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '-40%',
                width: '40%',
                height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
                animation: 'marquee-slide 1.5s ease-in-out infinite',
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// ChainStepNode — individual timeline step
// ============================================================================

const STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  pending: { icon: '○', color: 'rgba(255,255,255,0.3)' },
  running: { icon: '◉', color: 'var(--chatui-accent, #6366f1)' },
  success: { icon: '✓', color: '#3fb950' },
  failed: { icon: '✗', color: '#e74c3c' },
  skipped: { icon: '⊘', color: 'rgba(255,255,255,0.2)' },
}

const ChainStepNode = memo(function ChainStepNode({
  step,
  isLast,
  onRedo,
}: {
  step: ChainStep
  isLast: boolean
  onRedo?: (stepId: string) => void
}) {
  const { icon, color } = STATUS_ICONS[step.status] || STATUS_ICONS.pending
  const isRunning = step.status === 'running'
  const isFailed = step.status === 'failed'

  return (
    <div
      className="chain-step-node"
      style={{
        display: 'flex',
        gap: '10px',
        paddingLeft: `${step.depth * 20 + 4}px`,
        position: 'relative',
      }}
    >
      {/* Timeline line + node */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        flexShrink: 0,
        width: '18px',
      }}>
        {/* Node dot */}
        <div
          style={{
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '11px',
            color,
            flexShrink: 0,
            animation: isRunning ? 'pulse 1.2s ease infinite' : 'none',
          }}
        >
          {icon}
        </div>
        {/* Connecting line */}
        {!isLast && (
          <div
            style={{
              width: '1px',
              flex: 1,
              minHeight: '12px',
              background: isFailed
                ? 'linear-gradient(180deg, #e74c3c 0%, rgba(231,76,60,0.1) 100%)'
                : 'var(--chatui-glass-border)',
            }}
          />
        )}
      </div>

      {/* Step content */}
      <div style={{
        flex: 1,
        paddingBottom: isLast ? '0' : '8px',
        minWidth: 0,
      }}>
        {/* Header row */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minHeight: '18px',
        }}>
          <span style={{
            fontSize: '12px',
            fontWeight: 500,
            color: isFailed ? '#e74c3c' : 'var(--vscode-foreground)',
            opacity: step.status === 'pending' || step.status === 'skipped' ? 0.4 : 0.9,
          }}>
            {step.name}
          </span>
          {step.detail && (
            <span
              className="truncate"
              style={{
                fontSize: '11px',
                opacity: 0.45,
                fontFamily: 'var(--vscode-editor-font-family)',
                flex: 1,
                minWidth: 0,
              }}
              title={step.detail}
            >
              {step.detail}
            </span>
          )}
          {step.duration != null && (
            <span style={{
              fontSize: '10px',
              opacity: 0.3,
              fontFamily: 'var(--vscode-editor-font-family)',
              flexShrink: 0,
            }}>
              {step.duration}s
            </span>
          )}
          {/* Redo button for failed steps */}
          {isFailed && onRedo && (
            <button
              onClick={() => onRedo(step.id)}
              className="chain-redo-btn"
              title="Redo from this step"
              style={{
                background: 'none',
                border: '1px solid rgba(231, 76, 60, 0.3)',
                borderRadius: '4px',
                color: '#e74c3c',
                fontSize: '10px',
                padding: '1px 6px',
                cursor: 'pointer',
                flexShrink: 0,
                opacity: 0.7,
                transition: 'opacity 0.15s',
              }}
            >
              Redo
            </button>
          )}
        </div>

        {/* Error detail */}
        {isFailed && step.error && (
          <div
            style={{
              marginTop: '4px',
              padding: '6px 8px',
              borderRadius: '4px',
              background: 'rgba(231, 76, 60, 0.06)',
              border: '1px solid rgba(231, 76, 60, 0.15)',
              fontSize: '11px',
              color: '#e74c3c',
              opacity: 0.8,
              fontFamily: 'var(--vscode-editor-font-family)',
              lineHeight: 1.4,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {step.error}
          </div>
        )}
      </div>
    </div>
  )
})

// ============================================================================
// FailureDiagnosisPanel — shown when chain has failures
// ============================================================================

const FailureDiagnosisPanel = memo(function FailureDiagnosisPanel({
  diagnosis,
}: {
  diagnosis: ChainDiagnosis
}) {
  if (!diagnosis.hasFailures || !diagnosis.diagnosisMessage) return null

  return (
    <div
      className="chain-diagnosis-panel"
      style={{
        margin: '0 16px 8px',
        padding: '10px 12px',
        borderRadius: '8px',
        background: 'rgba(231, 76, 60, 0.06)',
        border: '1px solid rgba(231, 76, 60, 0.2)',
      }}
    >
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
      }}>
        {/* Warning icon */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e74c3c"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ flexShrink: 0, marginTop: '1px' }}
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <div>
          <div style={{
            fontSize: '11px',
            fontWeight: 600,
            color: '#e74c3c',
            marginBottom: '4px',
          }}>
            Failure Diagnosis
          </div>
          <div style={{
            fontSize: '11px',
            color: 'var(--vscode-foreground)',
            opacity: 0.7,
            lineHeight: 1.5,
          }}>
            {diagnosis.diagnosisMessage}
          </div>
        </div>
      </div>
    </div>
  )
})

// ============================================================================
// RedoConfirmModal
// ============================================================================

function RedoConfirmModal({
  step,
  onConfirm,
  onCancel,
}: {
  step: ChainStep
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        zIndex: 10000,
        animation: 'fadeIn 0.15s ease',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--vscode-editor-background)',
          border: '1px solid var(--chatui-glass-border)',
          borderRadius: '12px',
          padding: '20px',
          maxWidth: '360px',
          width: '90%',
          animation: 'installFadeIn 0.2s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{
          margin: '0 0 12px',
          fontSize: '14px',
          fontWeight: 600,
        }}>
          Redo from this step?
        </h3>
        <p style={{
          margin: '0 0 16px',
          fontSize: '12px',
          opacity: 0.7,
          lineHeight: 1.5,
        }}>
          This will rewind the conversation to before <strong style={{ color: '#e74c3c' }}>{step.name} {step.detail}</strong> and re-run from that point.
        </p>
        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: '1px solid var(--chatui-glass-border)',
              background: 'transparent',
              color: 'var(--vscode-foreground)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '6px 14px',
              borderRadius: '6px',
              border: 'none',
              background: 'var(--chatui-accent, #6366f1)',
              color: 'white',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Redo
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// TaskChainTracker — main component orchestrating sub-components
// ============================================================================

const TaskChainTracker = memo(function TaskChainTracker({
  diagnosis,
  onClose,
}: {
  diagnosis: ChainDiagnosis
  onClose: () => void
}) {
  const [redoStep, setRedoStep] = useState<ChainStep | null>(null)
  const stepsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to latest step
  useEffect(() => {
    stepsEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [diagnosis.steps.length])

  const handleRedo = useCallback((stepId: string) => {
    const step = diagnosis.steps.find(s => s.id === stepId)
    if (step) setRedoStep(step)
  }, [diagnosis.steps])

  const confirmRedo = useCallback(() => {
    if (!redoStep) return
    // Send rewind message to extension
    postMessage({ type: 'rewindToMessage', messageId: redoStep.id })
    setRedoStep(null)
    onClose()
  }, [redoStep, onClose])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid var(--chatui-glass-border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--chatui-accent, #6366f1)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Task Chain</span>
          <span style={{
            fontSize: '10px',
            padding: '1px 6px',
            borderRadius: '10px',
            background: 'var(--chatui-accent-subtle)',
            color: 'var(--chatui-accent, #6366f1)',
            fontWeight: 500,
          }}>
            {diagnosis.total} steps
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--vscode-foreground)',
            opacity: 0.5,
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            borderRadius: '4px',
          }}
          title="Close"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <ChainProgressBar diagnosis={diagnosis} />

      {/* Failure diagnosis */}
      <FailureDiagnosisPanel diagnosis={diagnosis} />

      {/* Steps timeline */}
      <div
        className="chain-steps-scroll"
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px 16px',
        }}
      >
        {diagnosis.steps.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '24px',
            fontSize: '12px',
            opacity: 0.4,
          }}>
            No tool steps yet
          </div>
        ) : (
          diagnosis.steps.map((step, i) => (
            <ChainStepNode
              key={step.id}
              step={step}
              isLast={i === diagnosis.steps.length - 1}
              onRedo={step.status === 'failed' ? handleRedo : undefined}
            />
          ))
        )}
        <div ref={stepsEndRef} />
      </div>

      {/* Summary footer when done */}
      {diagnosis.isDone && (
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--chatui-glass-border)',
          fontSize: '11px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}>
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: diagnosis.hasFailures ? '#e74c3c' : '#3fb950',
          }} />
          <span style={{ opacity: 0.6 }}>
            {diagnosis.hasFailures
              ? `Completed with ${diagnosis.failed} failure${diagnosis.failed > 1 ? 's' : ''}`
              : 'All steps completed successfully'
            }
          </span>
        </div>
      )}

      {/* Redo confirmation modal */}
      {redoStep && (
        <RedoConfirmModal
          step={redoStep}
          onConfirm={confirmRedo}
          onCancel={() => setRedoStep(null)}
        />
      )}
    </div>
  )
})

// ============================================================================
// TaskChainDrawer — slide-out drawer container
// ============================================================================

interface TaskChainDrawerProps {
  isOpen: boolean
  onClose: () => void
}

export const TaskChainDrawer = memo(function TaskChainDrawer({ isOpen, onClose }: TaskChainDrawerProps) {
  const messages = useChatStore((s) => s.messages)
  const diagnosis = useChainDiagnosis(messages)

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, onClose])

  return (
    <>
      {/* Backdrop */}
      <div
        className="chain-drawer-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.3)',
          zIndex: 9998,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        className="chain-drawer-panel"
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(600px, 85vw)',
          background: 'var(--vscode-editor-background)',
          borderLeft: '1px solid var(--chatui-glass-border)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s var(--ease-out-expo)',
          boxShadow: isOpen ? '-8px 0 24px rgba(0,0,0,0.2)' : 'none',
        }}
      >
        <TaskChainTracker diagnosis={diagnosis} onClose={onClose} />
      </div>
    </>
  )
})

// ============================================================================
// TaskChainTrigger — inline trigger button for JourneyTimeline
// ============================================================================

export const TaskChainTrigger = memo(function TaskChainTrigger({
  onClick,
  stepCount,
  failedCount,
  isRunning,
}: {
  onClick: () => void
  stepCount: number
  failedCount: number
  isRunning: boolean
}) {
  if (stepCount === 0) return null

  return (
    <button
      onClick={onClick}
      className="chain-trigger-btn"
      title="View task chain"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '3px 8px',
        borderRadius: '12px',
        border: '1px solid var(--chatui-glass-border)',
        background: 'var(--chatui-surface-1)',
        color: 'var(--vscode-foreground)',
        fontSize: '10px',
        cursor: 'pointer',
        opacity: 0.7,
        transition: 'all 0.15s ease',
      }}
    >
      {/* Chain icon */}
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>

      <span>{stepCount} steps</span>

      {failedCount > 0 && (
        <span style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: '#e74c3c', flexShrink: 0,
        }} />
      )}

      {isRunning && (
        <span style={{
          width: '5px', height: '5px', borderRadius: '50%',
          background: 'var(--chatui-accent, #6366f1)',
          animation: 'pulse 1s ease infinite',
          flexShrink: 0,
        }} />
      )}
    </button>
  )
})
