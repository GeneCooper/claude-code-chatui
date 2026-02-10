export const STATUS_COLORS = {
  executing: '#ff9500',
  completed: '#00d26a',
  failed: '#ff453a',
} as const

export const STATUS_ICONS = {
  executing: '⟳',
  completed: '✓',
  failed: '✗',
} as const

export const STEP_INDICATORS = {
  error: '●',
  done: '●',
  pending: '○',
} as const
