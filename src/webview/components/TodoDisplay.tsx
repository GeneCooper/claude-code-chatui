import { useChatStore, type TodoItem } from '../store'

export function TodoDisplay() {
  const todos = useChatStore((s) => s.todos)

  if (todos.length === 0) return null

  const completed = todos.filter((t) => t.status === 'completed').length
  const total = todos.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0

  return (
    <div
      style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'rgba(128, 128, 128, 0.04)',
        fontSize: '12px',
        maxHeight: '180px',
        overflowY: 'auto',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
        <span style={{ fontWeight: 600, fontSize: '11px', opacity: 0.7 }}>
          Tasks ({completed}/{total})
        </span>
        {/* Progress bar */}
        <div
          style={{
            width: '60px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(128, 128, 128, 0.2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              borderRadius: '2px',
              background: progress === 100 ? '#00d26a' : 'var(--chatui-accent)',
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      </div>

      {/* Todo items */}
      <div className="space-y-0.5">
        {todos.map((todo, idx) => (
          <TodoRow key={idx} todo={todo} />
        ))}
      </div>
    </div>
  )
}

function TodoRow({ todo }: { todo: TodoItem }) {
  const icon = todo.status === 'completed' ? '\u2705' : todo.status === 'in_progress' ? '\uD83D\uDD04' : '\u23F3'
  const textStyle: React.CSSProperties = todo.status === 'completed'
    ? { textDecoration: 'line-through', opacity: 0.5 }
    : todo.status === 'in_progress'
      ? { fontWeight: 600, color: 'var(--chatui-accent)' }
      : { opacity: 0.7 }

  return (
    <div className="flex items-start gap-1.5" style={{ padding: '2px 0', fontSize: '11px' }}>
      <span style={{ flexShrink: 0, fontSize: '10px', lineHeight: '16px' }}>{icon}</span>
      <span style={{ ...textStyle, lineHeight: '16px' }}>
        {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
      </span>
    </div>
  )
}
