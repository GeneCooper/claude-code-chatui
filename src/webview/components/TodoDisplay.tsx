import { useState, memo } from 'react'
import { useChatStore, type TodoItem } from '../store'

export const TodoDisplay = memo(function TodoDisplay() {
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
        padding: collapsed ? '3px 10px' : '5px 10px',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'rgba(128, 128, 128, 0.04)',
        fontSize: '11px',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-1.5 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ opacity: 0.4, fontSize: '9px' }}>{collapsed ? '▶' : '▼'}</span>
        <span style={{ fontWeight: 600, opacity: 0.7, fontSize: '11px' }}>
          Tasks {completed}/{total}
        </span>
        {collapsed && activeTask && (
          <span
            className="truncate"
            style={{ opacity: 0.45, fontSize: '10px', maxWidth: '200px' }}
          >
            {activeTask.activeForm || activeTask.content}
          </span>
        )}
        <span
          className="ml-auto"
          style={{
            fontSize: '10px',
            fontWeight: 600,
            color: progress === 100 ? '#00d26a' : 'var(--chatui-accent)',
            flexShrink: 0,
          }}
        >
          {progress}%
        </span>
      </div>

      {/* Todo items */}
      {!collapsed && (
        <div style={{ marginTop: '2px', maxHeight: '100px', overflowY: 'auto' }}>
          {todos.map((todo, idx) => (
            <TodoRow key={idx} todo={todo} />
          ))}
        </div>
      )}
    </div>
  )
})

const TodoRow = memo(function TodoRow({ todo }: { todo: TodoItem }) {
  const isCompleted = todo.status === 'completed'
  const isActive = todo.status === 'in_progress'

  return (
    <div
      className="flex items-center gap-1.5"
      style={{ padding: '1px 0', fontSize: '11px' }}
    >
      {/* Checkbox */}
      <span
        style={{
          flexShrink: 0,
          width: '13px',
          height: '13px',
          borderRadius: '3px',
          border: isCompleted
            ? '1.5px solid #4ade80'
            : isActive
              ? '1.5px solid var(--chatui-accent)'
              : '1.5px solid rgba(128,128,128,0.3)',
          background: isCompleted ? 'rgba(74, 222, 128, 0.15)' : 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '8px',
          lineHeight: 1,
          color: '#4ade80',
        }}
      >
        {isCompleted && '✓'}
        {isActive && (
          <span
            style={{
              width: '5px',
              height: '5px',
              borderRadius: '50%',
              background: 'var(--chatui-accent)',
            }}
          />
        )}
      </span>
      {/* Label */}
      <span
        style={{
          lineHeight: '15px',
          ...(isCompleted
            ? { textDecoration: 'line-through', opacity: 0.4 }
            : isActive
              ? { fontWeight: 600, color: 'var(--chatui-accent)' }
              : { opacity: 0.65 }),
        }}
      >
        {isActive && todo.activeForm ? todo.activeForm : todo.content}
      </span>
    </div>
  )
})
