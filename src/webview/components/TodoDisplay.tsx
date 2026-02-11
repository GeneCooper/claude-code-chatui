import { useState } from 'react'
import { useChatStore, type TodoItem } from '../store'

export function TodoDisplay() {
  const todos = useChatStore((s) => s.todos)
  const [collapsed, setCollapsed] = useState(false)

  if (todos.length === 0) return null

  const completed = todos.filter((t) => t.status === 'completed').length
  const total = todos.length
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0
  const activeTask = todos.find((t) => t.status === 'in_progress')

  return (
    <div
      style={{
        padding: collapsed ? '4px 12px' : '6px 12px',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'rgba(128, 128, 128, 0.04)',
        fontSize: '11px',
        flexShrink: 0,
      }}
    >
      {/* Header - always visible, clickable to toggle */}
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ opacity: 0.5, fontSize: '10px' }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ fontWeight: 600, opacity: 0.7 }}>
          Tasks ({completed}/{total})
        </span>
        {/* Active task hint when collapsed */}
        {collapsed && activeTask && (
          <span
            className="truncate"
            style={{ opacity: 0.5, fontSize: '10px', maxWidth: '200px' }}
          >
            {activeTask.activeForm || activeTask.content}
          </span>
        )}
        {/* Progress bar */}
        <div
          className="ml-auto"
          style={{
            width: '60px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(128, 128, 128, 0.2)',
            overflow: 'hidden',
            flexShrink: 0,
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

      {/* Todo items - collapsible */}
      {!collapsed && (
        <div className="space-y-0.5" style={{ marginTop: '4px', maxHeight: '100px', overflowY: 'auto' }}>
          {todos.map((todo, idx) => (
            <TodoRow key={idx} todo={todo} />
          ))}
        </div>
      )}
    </div>
  )
}

function TodoRow({ todo }: { todo: TodoItem }) {
  const icon = todo.status === 'completed' ? '✅' : todo.status === 'in_progress' ? '🔄' : '⏳'
  const textStyle: React.CSSProperties = todo.status === 'completed'
    ? { textDecoration: 'line-through', opacity: 0.5 }
    : todo.status === 'in_progress'
      ? { fontWeight: 600, color: 'var(--chatui-accent)' }
      : { opacity: 0.7 }

  return (
    <div className="flex items-start gap-1.5" style={{ padding: '1px 0', fontSize: '11px' }}>
      <span style={{ flexShrink: 0, fontSize: '10px', lineHeight: '16px' }}>{icon}</span>
      <span style={{ ...textStyle, lineHeight: '16px' }}>
        {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
      </span>
    </div>
  )
}
