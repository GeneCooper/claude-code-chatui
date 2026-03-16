import { useMemo } from 'react'
import type { ChatMessage } from '../store'

// ============================================================================
// Types
// ============================================================================

export type StepStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped'

export interface ChainStep {
  id: string
  name: string
  detail: string
  status: StepStatus
  toolName: string
  toolUseId?: string
  duration?: number
  error?: string
  timestamp?: string
  /** Nested sub-agent steps */
  children: ChainStep[]
  /** Depth in tree (0 = root level) */
  depth: number
}

export interface ChainDiagnosis {
  /** Flattened steps in execution order */
  steps: ChainStep[]
  /** Overall progress 0-1 */
  progress: number
  /** Total / completed / failed / running counts */
  total: number
  completed: number
  failed: number
  running: number
  /** First failure step (if any) */
  firstFailure: ChainStep | null
  /** Whether the entire chain is done */
  isDone: boolean
  /** Whether there are any failures */
  hasFailures: boolean
  /** Root-level failure diagnosis message */
  diagnosisMessage: string | null
}

// ============================================================================
// Helpers
// ============================================================================

const fileName = (fp: string) => fp.split(/[\\/]/).pop() || fp

const TOOL_LABELS: Record<string, { active: string; done: string; getDetail: (i: Record<string, unknown>) => string }> = {
  Read: { active: 'Reading', done: 'Read', getDetail: (i) => fileName(String(i.file_path || '')) },
  Edit: { active: 'Editing', done: 'Edited', getDetail: (i) => fileName(String(i.file_path || '')) },
  MultiEdit: { active: 'Editing', done: 'Edited', getDetail: (i) => fileName(String(i.file_path || '')) },
  Write: { active: 'Writing', done: 'Wrote', getDetail: (i) => fileName(String(i.file_path || '')) },
  Bash: {
    active: 'Running', done: 'Ran',
    getDetail: (i) => { const c = String(i.command || ''); return c.length > 60 ? c.substring(0, 60) + '...' : c },
  },
  Grep: { active: 'Searching', done: 'Searched', getDetail: (i) => i.pattern ? `"${i.pattern}"` : 'files' },
  Glob: { active: 'Finding files', done: 'Found files', getDetail: (i) => i.pattern ? `"${i.pattern}"` : '' },
  WebFetch: { active: 'Fetching', done: 'Fetched', getDetail: (i) => { try { return new URL(String(i.url)).hostname } catch { return String(i.url || '').substring(0, 30) } } },
  WebSearch: { active: 'Searching web', done: 'Searched web', getDetail: (i) => i.query ? `"${i.query}"` : '' },
  Task: { active: 'Running agent', done: 'Agent completed', getDetail: (i) => i.description ? String(i.description) : '' },
  Agent: { active: 'Running agent', done: 'Agent completed', getDetail: (i) => i.description ? String(i.description) : '' },
}

/** Build tree of ChainSteps from flat message array */
function buildStepTree(messages: ChatMessage[]): ChainStep[] {
  // Index toolResults by toolUseId
  const resultMap = new Map<string, ChatMessage>()
  for (const msg of messages) {
    if (msg.type === 'toolResult') {
      const data = msg.data as Record<string, unknown>
      const tid = data?.toolUseId as string | undefined
      if (tid) resultMap.set(tid, msg)
    }
  }

  const steps: ChainStep[] = []

  for (const msg of messages) {
    if (msg.type !== 'toolUse') continue

    const data = msg.data as Record<string, unknown>
    const toolName = (data.toolName as string) || 'Tool'
    const toolUseId = data.toolUseId as string | undefined
    const rawInput = data.rawInput as Record<string, unknown> | undefined
    const result = toolUseId ? resultMap.get(toolUseId) : undefined
    const resultData = result?.data as Record<string, unknown> | undefined
    const isError = !!resultData?.isError

    // Determine status
    let status: StepStatus = 'pending'
    if (result) {
      status = isError ? 'failed' : 'success'
    } else {
      // No result yet — check if it's the latest toolUse (running)
      status = 'running'
    }

    // Label
    const mapping = TOOL_LABELS[toolName]
    const verb = result ? (mapping?.done || toolName) : (mapping?.active || toolName)
    const detail = rawInput && mapping ? mapping.getDetail(rawInput) : ''

    // Duration
    let duration: number | undefined
    if (result) {
      const dt = new Date(result.timestamp).getTime() - new Date(msg.timestamp).getTime()
      if (dt >= 0 && dt < 3600000) duration = Math.round(dt / 100) / 10
    }

    // Error message
    let error: string | undefined
    if (isError && resultData?.content) {
      const content = String(resultData.content)
      error = content.length > 200 ? content.substring(0, 200) + '...' : content
    }

    const step: ChainStep = {
      id: msg.id,
      name: verb,
      detail,
      status,
      toolName,
      toolUseId,
      duration,
      error,
      timestamp: msg.timestamp,
      children: [],
      depth: 0,
    }

    // Sub-agent nesting: if toolName is Task/Agent, its result may contain child steps
    // For now, keep flat — sub-agent steps are rendered inline in JourneyTimeline
    steps.push(step)
  }

  // Fix: mark only the LAST running step as running, others without results as pending
  let foundRunning = false
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i].status === 'running') {
      if (!foundRunning) {
        foundRunning = true
      } else {
        // Earlier "running" steps are actually failed (timeout/dropped)
        steps[i].status = 'pending'
      }
    }
  }

  return steps
}

/** Flatten a step tree (depth-first) */
function flattenSteps(steps: ChainStep[], depth = 0): ChainStep[] {
  const flat: ChainStep[] = []
  for (const step of steps) {
    flat.push({ ...step, depth })
    if (step.children.length > 0) {
      flat.push(...flattenSteps(step.children, depth + 1))
    }
  }
  return flat
}

/** Generate diagnosis message from failures */
function diagnose(steps: ChainStep[]): string | null {
  const failures = steps.filter(s => s.status === 'failed')
  if (failures.length === 0) return null

  if (failures.length === 1) {
    const f = failures[0]
    return `Step "${f.name} ${f.detail}" failed${f.error ? ': ' + f.error : ''}`
  }

  return `${failures.length} steps failed. First failure at "${failures[0].name} ${failures[0].detail}"`
}

// ============================================================================
// Hook
// ============================================================================

/**
 * useChainDiagnosis — takes raw messages, builds a step tree, flattens it,
 * and computes progress/diagnosis for the TaskChainTracker.
 */
export function useChainDiagnosis(messages: ChatMessage[]): ChainDiagnosis {
  return useMemo(() => {
    const tree = buildStepTree(messages)
    const steps = flattenSteps(tree)

    const total = steps.length
    const completed = steps.filter(s => s.status === 'success').length
    const failed = steps.filter(s => s.status === 'failed').length
    const running = steps.filter(s => s.status === 'running').length
    const progress = total > 0 ? (completed + failed) / total : 0
    const isDone = running === 0 && total > 0 && steps.every(s => s.status === 'success' || s.status === 'failed' || s.status === 'skipped')
    const firstFailure = steps.find(s => s.status === 'failed') || null
    const hasFailures = failed > 0
    const diagnosisMessage = diagnose(steps)

    return {
      steps,
      progress,
      total,
      completed,
      failed,
      running,
      firstFailure,
      isDone,
      hasFailures,
      diagnosisMessage,
    }
  }, [messages])
}
