import { useMemo, useState, useCallback } from 'react'
import type { ChatMessage } from '../../stores/chatStore'
import { buildTimelineItems } from './utils'
import { PlanGroupCard } from './PlanGroupCard'
import { MessageRenderer } from './MessageRenderer'

interface Props {
  messages: ChatMessage[]
  isProcessing: boolean
}

export function JourneyTimeline({ messages, isProcessing }: Props) {
  const [collapsedPlans, setCollapsedPlans] = useState<Set<string>>(new Set())
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set())

  const items = useMemo(() => buildTimelineItems(messages, isProcessing), [messages, isProcessing])

  const togglePlan = useCallback((id: string) => {
    setCollapsedPlans((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleStep = useCallback((id: string) => {
    setCollapsedSteps((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  return (
    <div className="space-y-3">
      {items.map((item) => {
        if (item.kind === 'message') {
          return <MessageRenderer key={item.message.id} message={item.message} />
        }

        return (
          <PlanGroupCard
            key={item.id}
            plan={item}
            isCollapsed={collapsedPlans.has(item.id)}
            collapsedSteps={collapsedSteps}
            onTogglePlan={togglePlan}
            onToggleStep={toggleStep}
          />
        )
      })}
    </div>
  )
}
