import { useQueueStore, QueueItem } from '../store'

export function TaskQueue() {
  const items = useQueueStore((s) => s.items)
  const autoRun = useQueueStore((s) => s.autoRun)
  const { removeItem, clearCompleted, clearAll, setAutoRun, moveUp, moveDown } = useQueueStore.getState()

  if (items.length === 0) return null

  const pendingCount = items.filter((i) => i.status === 'pending').length
  const hasCompleted = items.some((i) => i.status === 'done' || i.status === 'error')

  return (
    <div
      style={{
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-panel-background)',
        maxHeight: '220px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '6px 10px 4px',
          fontSize: '11px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ fontWeight: 600, opacity: 0.8 }}>
            Queue
          </span>
          {pendingCount > 0 && (
            <span
              style={{
                background: 'rgba(237, 110, 29, 0.15)',
                color: 'var(--chatui-accent)',
                border: '1px solid rgba(237, 110, 29, 0.3)',
                borderRadius: '10px',
                padding: '0 6px',
                fontSize: '10px',
                fontWeight: 600,
              }}
            >
              {pendingCount} pending
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Auto-run toggle */}
          <button
            onClick={() => setAutoRun(!autoRun)}
            title={autoRun ? 'Auto-run: ON — click to pause' : 'Auto-run: OFF — click to enable'}
            style={{
              background: autoRun ? 'rgba(0, 210, 106, 0.12)' : 'transparent',
              border: `1px solid ${autoRun ? 'rgba(0, 210, 106, 0.35)' : 'var(--vscode-panel-border)'}`,
              color: autoRun ? '#00d26a' : 'inherit',
              borderRadius: '10px',
              padding: '1px 8px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: autoRun ? 1 : 0.6,
              transition: 'all 0.2s ease',
            }}
          >
            {autoRun ? '▶ Auto' : '⏸ Paused'}
          </button>

          {/* Clear completed */}
          {hasCompleted && (
            <button
              onClick={() => clearCompleted()}
              title="Clear done/error items"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'inherit',
                opacity: 0.45,
                cursor: 'pointer',
                fontSize: '10px',
                padding: '1px 6px',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.45' }}
            >
              Clear done
            </button>
          )}

          {/* Clear all */}
          <button
            onClick={() => clearAll()}
            title="Clear all queued tasks"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              opacity: 0.45,
              cursor: 'pointer',
              fontSize: '10px',
              padding: '1px 6px',
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.45' }}
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: '4px 8px 6px' }}>
        {items.map((item, idx) => (
          <QueueRow
            key={item.id}
            item={item}
            isFirst={idx === 0}
            isLast={idx === items.length - 1}
            onRemove={() => removeItem(item.id)}
            onMoveUp={() => moveUp(item.id)}
            onMoveDown={() => moveDown(item.id)}
          />
        ))}
      </div>
    </div>
  )
}

function QueueRow({
  item,
  isFirst,
  isLast,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  item: QueueItem
  isFirst: boolean
  isLast: boolean
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const statusColor: Record<QueueItem['status'], string> = {
    pending: 'rgba(255,255,255,0.3)',
    running: '#ff9500',
    done: '#00d26a',
    error: '#ff453a',
  }

  const statusIcon: Record<QueueItem['status'], string> = {
    pending: '○',
    running: '●',
    done: '✓',
    error: '✗',
  }

  const isFinished = item.status === 'done' || item.status === 'error'

  return (
    <div
      className="flex items-center gap-2 group"
      style={{
        padding: '4px 4px',
        borderRadius: '4px',
        opacity: isFinished ? 0.45 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* Status dot */}
      <span
        style={{
          fontSize: '11px',
          color: statusColor[item.status],
          flexShrink: 0,
          width: '12px',
          textAlign: 'center',
          animation: item.status === 'running' ? 'pulse 1.5s ease-in-out infinite' : undefined,
        }}
      >
        {statusIcon[item.status]}
      </span>

      {/* Prompt text */}
      <span
        className="truncate flex-1"
        style={{
          fontSize: '11px',
          fontFamily: 'var(--vscode-editor-font-family)',
        }}
        title={item.prompt}
      >
        {item.prompt}
      </span>

      {/* Mode badges */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {item.planMode && (
          <span style={{ fontSize: '9px', opacity: 0.5, color: '#3b82f6' }}>PLAN</span>
        )}
        {item.thinkingMode && (
          <span style={{ fontSize: '9px', opacity: 0.5, color: 'var(--chatui-accent)' }}>THINK</span>
        )}
      </div>

      {/* Reorder buttons (only for pending) */}
      {item.status === 'pending' && (
        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            title="Move up"
            style={{
              background: 'none',
              border: 'none',
              cursor: isFirst ? 'default' : 'pointer',
              color: 'inherit',
              opacity: isFirst ? 0.2 : 0.6,
              padding: '0 2px',
              fontSize: '10px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { if (!isFirst) e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { if (!isFirst) e.currentTarget.style.opacity = '0.6' }}
          >
            ▲
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            title="Move down"
            style={{
              background: 'none',
              border: 'none',
              cursor: isLast ? 'default' : 'pointer',
              color: 'inherit',
              opacity: isLast ? 0.2 : 0.6,
              padding: '0 2px',
              fontSize: '10px',
              lineHeight: 1,
            }}
            onMouseEnter={(e) => { if (!isLast) e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { if (!isLast) e.currentTarget.style.opacity = '0.6' }}
          >
            ▼
          </button>
        </div>
      )}

      {/* Remove button */}
      {!isFinished && (
        <button
          onClick={onRemove}
          title="Remove from queue"
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            opacity: 0,
            padding: '0 2px',
            fontSize: '13px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          className="group-hover:!opacity-50 hover:!opacity-100 transition-opacity"
        >
          ×
        </button>
      )}
    </div>
  )
}
