import { ToolUseBlock } from '../ToolUseBlock'
import { ToolResultBlock } from '../ToolResultBlock'
import { STATUS_COLORS, STEP_INDICATORS } from './constants'
import type { ToolStep } from './types'

interface Props {
  step: ToolStep
  isCollapsed: boolean
  onToggle: (id: string) => void
}

export function ToolStepItem({ step, isCollapsed, onToggle }: Props) {
  const toolData = step.toolUse?.data as Record<string, unknown> | undefined
  const toolName = (toolData?.toolName as string) || 'Tool'
  const hasError = step.toolResult && (step.toolResult.data as Record<string, unknown>)?.isError

  const indicatorColor = hasError
    ? STATUS_COLORS.failed
    : step.toolResult
      ? STATUS_COLORS.completed
      : STATUS_COLORS.executing

  const indicator = hasError
    ? STEP_INDICATORS.error
    : step.toolResult
      ? STEP_INDICATORS.done
      : STEP_INDICATORS.pending

  return (
    <div style={{ marginBottom: '4px' }}>
      <button
        onClick={() => onToggle(step.id)}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          background: 'transparent',
          fontSize: '11px',
          opacity: 0.7,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
      >
        <span style={{ color: indicatorColor, fontSize: '10px' }}>
          {indicator}
        </span>
        <span className="truncate">{toolName}</span>
        <span style={{ opacity: 0.4, fontSize: '9px' }}>
          {isCollapsed ? '▸' : '▾'}
        </span>
      </button>
      {!isCollapsed && (
        <div style={{ paddingLeft: '20px' }}>
          {step.toolUse && <ToolUseBlock data={step.toolUse.data as Record<string, unknown>} />}
          {step.toolResult && <ToolResultBlock data={step.toolResult.data as Record<string, unknown>} />}
        </div>
      )}
    </div>
  )
}
