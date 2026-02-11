import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useUIStore } from '../store'
import { useSettingsStore } from '../store'

interface SlashCommand {
  command: string
  description: string
  category: 'snippet' | 'native' | 'custom'
}

// Built-in commands
const BUILTIN_COMMANDS: SlashCommand[] = [
  { command: 'performance-analysis', description: 'Analyze code for performance issues', category: 'snippet' },
  { command: 'security-review', description: 'Review code for security vulnerabilities', category: 'snippet' },
  { command: 'implementation-review', description: 'Review implementation details', category: 'snippet' },
  { command: 'code-explanation', description: 'Explain how code works', category: 'snippet' },
  { command: 'bug-fix', description: 'Help fix bugs', category: 'snippet' },
  { command: 'refactor', description: 'Improve readability and maintainability', category: 'snippet' },
  { command: 'test-generation', description: 'Generate comprehensive tests', category: 'snippet' },
  { command: 'documentation', description: 'Generate code documentation', category: 'snippet' },
  { command: 'clear', description: 'Clear conversation', category: 'native' },
  { command: 'compact', description: 'Compact conversation', category: 'native' },
  { command: 'config', description: 'Configuration', category: 'native' },
  { command: 'cost', description: 'Show cost information', category: 'native' },
  { command: 'doctor', description: 'System diagnostics', category: 'native' },
  { command: 'help', description: 'Show help', category: 'native' },
  { command: 'init', description: 'Initialize project', category: 'native' },
  { command: 'login', description: 'Authentication', category: 'native' },
  { command: 'memory', description: 'Memory management', category: 'native' },
  { command: 'model', description: 'Model selection', category: 'native' },
  { command: 'permissions', description: 'Permissions management', category: 'native' },
  { command: 'review', description: 'Code review', category: 'native' },
  { command: 'status', description: 'Show status', category: 'native' },
  { command: 'usage', description: 'Show usage statistics', category: 'native' },
]

interface Props {
  filter: string
  onSelect: (command: string, category: 'snippet' | 'native') => void
}

export function SlashCommandPicker({ filter, onSelect }: Props) {
  const show = useUIStore((s) => s.showSlashPicker)
  const setShow = useUIStore((s) => s.setShowSlashPicker)
  const customSnippets = useSettingsStore((s) => s.customSnippets)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [searchText, setSearchText] = useState('')

  // Merge built-in commands with custom snippets
  const allCommands = useMemo(() => {
    const custom: SlashCommand[] = customSnippets.map((s) => ({
      command: s.command,
      description: s.description,
      category: 'custom' as const,
    }))
    return [...custom, ...BUILTIN_COMMANDS]
  }, [customSnippets])

  const effectiveFilter = searchText || filter

  const filtered = allCommands.filter((cmd) =>
    cmd.command.toLowerCase().includes(effectiveFilter.toLowerCase()),
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [effectiveFilter])

  useEffect(() => {
    if (show) {
      setSearchText(filter)
    }
  }, [show, filter])

  // Use ref to avoid re-attaching the global keydown listener on every state change
  const handlerRef = useRef({ show, filtered, selectedIndex, onSelect, setShow })
  handlerRef.current = { show, filtered, selectedIndex, onSelect, setShow }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { show: s, filtered: f, selectedIndex: idx, onSelect: sel, setShow: ss } = handlerRef.current
      if (!s || f.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % f.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + f.length) % f.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const cmd = f[idx]
        sel(cmd.command, cmd.category === 'custom' ? 'snippet' : cmd.category)
        ss(false)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        ss(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!show) return null

  const customs = filtered.filter((c) => c.category === 'custom')
  const snippets = filtered.filter((c) => c.category === 'snippet')
  const natives = filtered.filter((c) => c.category === 'native')

  let globalIndex = 0

  const getIcon = (cmd: SlashCommand) => {
    if (cmd.category === 'custom') return '✏️'
    if (cmd.category === 'snippet') {
      const icons: Record<string, string> = {
        'performance-analysis': '⚡',
        'security-review': '🔒',
        'implementation-review': '🔍',
        'code-explanation': '📖',
        'bug-fix': '🐛',
        'refactor': '♻️',
        'test-generation': '🧪',
        'documentation': '📝',
      }
      return icons[cmd.command] || '📋'
    }
    const nativeIcons: Record<string, string> = {
      'clear': '🗑️',
      'compact': '📦',
      'config': '⚙️',
      'cost': '💰',
      'doctor': '🩺',
      'help': '❓',
      'init': '🚀',
      'login': '🔑',
      'memory': '🧠',
      'model': '🤖',
      'permissions': '🛡️',
      'review': '📝',
      'status': '📊',
      'usage': '📈',
    }
    return nativeIcons[cmd.command] || '▶'
  }

  const renderItem = (cmd: SlashCommand) => {
    const idx = globalIndex++
    const effectiveCategory = cmd.category === 'custom' ? 'snippet' : cmd.category
    const isSelected = idx === selectedIndex

    const itemClass = cmd.category === 'custom'
      ? 'prompt-snippet-item'
      : cmd.category === 'snippet'
        ? 'prompt-snippet-item'
        : ''

    return (
      <button
        key={`${cmd.category}-${cmd.command}`}
        onClick={() => {
          onSelect(cmd.command, effectiveCategory)
          setShow(false)
        }}
        className="w-full text-left cursor-pointer border-none text-inherit"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          borderRadius: 'var(--radius-sm)',
          transition: 'all 0.15s ease',
          border: '1px solid transparent',
          background: isSelected
            ? 'var(--vscode-list-activeSelectionBackground)'
            : 'transparent',
          color: isSelected
            ? 'var(--vscode-list-activeSelectionForeground)'
            : 'inherit',
          borderLeft: cmd.category === 'custom' || cmd.category === 'snippet'
            ? '2px solid var(--vscode-charts-blue, #007acc)'
            : undefined,
          backgroundColor: isSelected
            ? 'var(--vscode-list-activeSelectionBackground)'
            : (cmd.category === 'custom' || cmd.category === 'snippet')
              ? 'rgba(0, 122, 204, 0.03)'
              : 'transparent',
        }}
        onMouseEnter={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
          }
        }}
        onMouseLeave={(e) => {
          if (!isSelected) {
            e.currentTarget.style.background = (cmd.category === 'custom' || cmd.category === 'snippet')
              ? 'rgba(0, 122, 204, 0.03)'
              : 'transparent'
          }
        }}
      >
        <span style={{ fontSize: '16px', minWidth: '20px', textAlign: 'center', opacity: 0.8 }}>
          {getIcon(cmd)}
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '2px' }}>
            /{cmd.command}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', opacity: 0.7, lineHeight: 1.3 }}>
            {cmd.description}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setShow(false)
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          width: 'calc(100% - 32px)',
          maxWidth: '480px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          overflow: 'hidden',
          animation: 'installFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Commands</span>
          <button
            onClick={() => setShow(false)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--vscode-foreground)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              opacity: 0.6,
            }}
          >
            {'✕'}
          </button>
        </div>

        {/* Search */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            position: 'sticky',
            top: 0,
            backgroundColor: 'var(--vscode-editor-background)',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              border: '1px solid var(--vscode-input-border)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--vscode-input-background)',
              transition: 'all 0.2s ease',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '32px',
                height: '32px',
                backgroundColor: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
                borderRight: '1px solid var(--vscode-input-border)',
              }}
            >
              /
            </div>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search commands..."
              autoFocus
              style={{
                flex: 1,
                padding: '8px 12px',
                border: 'none',
                background: 'transparent',
                color: 'var(--vscode-input-foreground)',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>
        </div>

        {/* Command list */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontStyle: 'italic' }}>
              No matching commands
            </div>
          ) : (
            <>
              {customs.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ margin: '16px 20px 12px 20px', fontSize: '14px', fontWeight: 600 }}>
                    Custom Commands
                  </h3>
                  <div style={{ display: 'grid', gap: '4px', padding: '0 16px' }}>
                    {customs.map(renderItem)}
                  </div>
                </div>
              )}

              {snippets.length > 0 && (
                <div style={{ marginBottom: '32px' }}>
                  <h3 style={{ margin: '16px 20px 12px 20px', fontSize: '14px', fontWeight: 600 }}>
                    Prompt Snippets
                  </h3>
                  <div
                    style={{
                      padding: '12px 20px',
                      backgroundColor: 'rgba(255, 149, 0, 0.1)',
                      border: '1px solid rgba(255, 149, 0, 0.2)',
                      borderRadius: '4px',
                      margin: '0 20px 16px 20px',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--vscode-descriptionForeground)', textAlign: 'center', opacity: 0.9 }}>
                      Prompt snippets insert pre-defined prompts into your message
                    </p>
                  </div>
                  <div style={{ display: 'grid', gap: '4px', padding: '0 16px' }}>
                    {snippets.map(renderItem)}
                  </div>
                </div>
              )}

              {natives.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ margin: '16px 20px 12px 20px', fontSize: '14px', fontWeight: 600 }}>
                    Built-in Commands
                  </h3>
                  <div style={{ display: 'grid', gap: '4px', padding: '0 16px' }}>
                    {natives.map(renderItem)}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
