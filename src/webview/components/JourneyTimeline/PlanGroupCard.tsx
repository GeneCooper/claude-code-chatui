import { AssistantMessage } from '../AssistantMessage'
import { ThinkingBlock } from '../ThinkingBlock'
import { StatusIcon } from './StatusIcon'
import { ToolStepItem } from './ToolStepItem'
import { STATUS_COLORS } from './constants'
import { getPlanSummary } from './utils'
import type { PlanGroup } from './types'

interface Props {
  plan: PlanGroup
  isCollapsed: boolean
  collapsedSteps: Set<string>
  onTogglePlan: (id: string) => void
  onToggleStep: (id: string) => void
}

export function PlanGroupCard({ plan, isCollapsed, collapsedSteps, onTogglePlan, onToggleStep }: Props) {
  const statusColor = STATUS_COLORS[plan.status]
  const summaryText = getPlanSummary(plan)

  return (
    <div style={{ marginBottom: '4px' }}>
      {/* Plan header */}
      <button
        onClick={() => onTogglePlan(plan.id)}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          borderRadius: 'var(--radius-sm)',
          background: 'rgba(128, 128, 128, 0.06)',
          border: `1px solid ${plan.status === 'executing' ? 'rgba(255, 149, 0, 0.2)' : 'transparent'}`,
          transition: 'all 0.2s ease',
          fontSize: '12px',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(128, 128, 128, 0.12)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(128, 128, 128, 0.06)' }}
      >
        <StatusIcon status={plan.status} />
        <span className="flex-1 truncate" style={{ opacity: 0.8 }}>
          {isCollapsed ? summaryText : 'Assistant response'}
        </span>
        {plan.steps.length > 0 && (
          <span style={{ opacity: 0.5, fontSize: '11px' }}>
            {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
          </span>
        )}
        <span style={{ opacity: 0.4, fontSize: '10px' }}>
          {isCollapsed ? '▸' : '▾'}
        </span>
      </button>

      {/* Plan content */}
      {!isCollapsed && (
        <div style={{ paddingLeft: '12px', borderLeft: `2px solid ${statusColor}20`, marginLeft: '10px', marginTop: '4px' }}>
          {plan.assistantMessage.type === 'output' && (
            <AssistantMessage text={String(plan.assistantMessage.data)} />
          )}

          {plan.thinkingMessage && (
            <ThinkingBlock text={String(plan.thinkingMessage.data)} />
          )}
          {plan.assistantMessage.type === 'thinking' && !plan.thinkingMessage && (
            <ThinkingBlock text={String(plan.assistantMessage.data)} />
          )}

          {plan.steps.map((step) => (
            <ToolStepItem
              key={step.id}
              step={step}
              isCollapsed={collapsedSteps.has(step.id)}
              onToggle={onToggleStep}
            />
          ))}
        </div>
      )}
    </div>
  )
}
