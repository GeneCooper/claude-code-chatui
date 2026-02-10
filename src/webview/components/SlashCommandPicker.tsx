import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUIStore } from '../stores/uiStore'
import { useSettingsStore } from '../stores/settingsStore'

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

  // Merge built-in commands with custom snippets
  const allCommands = useMemo(() => {
    const custom: SlashCommand[] = customSnippets.map((s) => ({
      command: s.command,
      description: s.description,
      category: 'custom' as const,
    }))
    return [...custom, ...BUILTIN_COMMANDS]
  }, [customSnippets])

  const filtered = allCommands.filter((cmd) =>
    cmd.command.toLowerCase().includes(filter.toLowerCase()),
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [filter])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!show || filtered.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % filtered.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length)
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const cmd = filtered[selectedIndex]
        // Custom snippets behave like regular snippets
        onSelect(cmd.command, cmd.category === 'custom' ? 'snippet' : cmd.category)
        setShow(false)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShow(false)
      }
    },
    [show, filtered, selectedIndex, onSelect, setShow],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!show || filtered.length === 0) return null

  const customs = filtered.filter((c) => c.category === 'custom')
  const snippets = filtered.filter((c) => c.category === 'snippet')
  const natives = filtered.filter((c) => c.category === 'native')

  let globalIndex = 0

  const renderItem = (cmd: SlashCommand) => {
    const idx = globalIndex++
    const effectiveCategory = cmd.category === 'custom' ? 'snippet' : cmd.category
    return (
      <button
        key={`${cmd.category}-${cmd.command}`}
        onClick={() => {
          onSelect(cmd.command, effectiveCategory)
          setShow(false)
        }}
        className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer bg-transparent border-none text-inherit ${
          idx === selectedIndex ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]' : 'hover:bg-[var(--vscode-list-hoverBackground)]'
        }`}
      >
        <span className="font-mono opacity-60">/{cmd.command}</span>
        <span className="opacity-40 truncate">{cmd.description}</span>
      </button>
    )
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-editorWidget-border)] rounded-lg shadow-lg max-h-60 overflow-y-auto z-50">
      {customs.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] opacity-40 uppercase tracking-wider">Custom Prompts</div>
          {customs.map(renderItem)}
        </>
      )}

      {snippets.length > 0 && (
        <>
          <div className={`px-3 py-1 text-[10px] opacity-40 uppercase tracking-wider ${customs.length > 0 ? 'border-t border-[var(--vscode-panel-border)]' : ''}`}>
            Prompts
          </div>
          {snippets.map(renderItem)}
        </>
      )}

      {natives.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] opacity-40 uppercase tracking-wider border-t border-[var(--vscode-panel-border)]">
            Commands
          </div>
          {natives.map(renderItem)}
        </>
      )}
    </div>
  )
}
