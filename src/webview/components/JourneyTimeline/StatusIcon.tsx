import { STATUS_COLORS, STATUS_ICONS } from './constants'

interface Props {
  status: 'executing' | 'completed' | 'failed'
}

export function StatusIcon({ status }: Props) {
  return (
    <span
      style={{
        color: STATUS_COLORS[status],
        fontSize: '14px',
        fontWeight: 600,
        animation: status === 'executing' ? 'spin 1.5s linear infinite' : 'none',
        display: 'inline-block',
      }}
    >
      {STATUS_ICONS[status]}
    </span>
  )
}
