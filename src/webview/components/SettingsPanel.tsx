import { useEffect, useState, useCallback } from 'react'
import { postMessage } from '../hooks'
import { useSettingsStore } from '../store'
import { useUIStore } from '../store'

// ============================================================================
// Hooks Types
// ============================================================================

interface HookEntry {
  type: 'command'
  command: string
}

interface HookMatcher {
  matcher: string
  hooks: HookEntry[]
}

type HookEvent = 'PreToolUse' | 'PostToolUse' | 'Notification' | 'Stop'

type HooksConfig = Partial<Record<HookEvent, HookMatcher[]>>

// ============================================================================
// Blocked Tools definitions
// ============================================================================

const TOOL_INFO: { name: string; desc: string }[] = [
  { name: 'Bash', desc: 'Execute shell commands in terminal' },
  { name: 'Edit', desc: 'Modify existing files (single edit)' },
  { name: 'MultiEdit', desc: 'Apply multiple edits to a file at once' },
  { name: 'Write', desc: 'Create new files or overwrite existing ones' },
  { name: 'WebFetch', desc: 'Fetch content from URLs' },
  { name: 'NotebookEdit', desc: 'Edit Jupyter notebook cells' },
]

// ============================================================================
// Hook Presets (store-like)
// ============================================================================

interface HookPreset {
  id: string
  name: string
  desc: string
  icon: string
  config: HooksConfig
}

const HOOK_PRESETS: HookPreset[] = [
  {
    id: 'auto-lint',
    name: 'Auto Lint',
    desc: 'Run linter after file edits',
    icon: '\u2728',
    config: {
      PostToolUse: [{ matcher: 'Edit|MultiEdit|Write', hooks: [{ type: 'command', command: 'npm run lint --fix 2>/dev/null || true' }] }],
    },
  },
  {
    id: 'auto-test',
    name: 'Auto Test',
    desc: 'Run tests after code changes',
    icon: '\u2705',
    config: {
      PostToolUse: [{ matcher: 'Edit|MultiEdit|Write', hooks: [{ type: 'command', command: 'npm test 2>/dev/null || true' }] }],
    },
  },
  {
    id: 'git-backup',
    name: 'Git Auto-commit',
    desc: 'Auto-commit changes when agent stops',
    icon: '\uD83D\uDCBE',
    config: {
      Stop: [{ matcher: '.*', hooks: [{ type: 'command', command: 'git add -A && git commit -m "auto: agent checkpoint" 2>/dev/null || true' }] }],
    },
  },
  {
    id: 'bash-log',
    name: 'Command Logger',
    desc: 'Log all executed bash commands',
    icon: '\uD83D\uDCDD',
    config: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'echo "[$(date +%H:%M:%S)] Bash tool used" >> /tmp/claude-audit.log' }] }],
    },
  },
  {
    id: 'notify-done',
    name: 'Completion Alert',
    desc: 'System notification when task finishes',
    icon: '\uD83D\uDD14',
    config: {
      Stop: [{ matcher: '.*', hooks: [{ type: 'command', command: 'echo "Claude task completed" | wall 2>/dev/null || echo "\\a"' }] }],
    },
  },
  {
    id: 'type-check',
    name: 'Type Check',
    desc: 'Run TypeScript check after edits',
    icon: '\uD83D\uDD0D',
    config: {
      PostToolUse: [{ matcher: 'Edit|MultiEdit|Write', hooks: [{ type: 'command', command: 'npx tsc --noEmit 2>/dev/null || true' }] }],
    },
  },
]

// ============================================================================
// Shared styles
// ============================================================================

const cardStyle: React.CSSProperties = {
  background: 'var(--chatui-surface-2, rgba(255,255,255,0.06))',
  borderRadius: '8px',
  padding: '14px 16px',
  border: '1px solid var(--chatui-glass-border, rgba(255,255,255,0.08))',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '8px',
  color: 'var(--vscode-editor-foreground)',
}

const descStyle: React.CSSProperties = {
  fontSize: '11px',
  opacity: 0.65,
  marginTop: '6px',
  lineHeight: 1.5,
}

// ============================================================================
// HooksStore — preset-based hook manager
// ============================================================================

function HooksStore() {
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showCustom, setShowCustom] = useState(false)

  // Custom hook form
  const [customEvent, setCustomEvent] = useState<HookEvent>('PreToolUse')
  const [customMatcher, setCustomMatcher] = useState('.*')
  const [customCommand, setCustomCommand] = useState('')

  useEffect(() => {
    postMessage({ type: 'loadHooks' })
    const handleHooksData = (e: Event) => {
      const data = (e as CustomEvent).detail as HooksConfig
      setHooks(data || {})
      setLoaded(true)
    }
    const handleHooksSaved = () => { setSaving(false) }
    window.addEventListener('hooksData', handleHooksData)
    window.addEventListener('hooksSaved', handleHooksSaved)
    return () => {
      window.removeEventListener('hooksData', handleHooksData)
      window.removeEventListener('hooksSaved', handleHooksSaved)
    }
  }, [])

  const saveHooks = useCallback((updated: HooksConfig) => {
    setHooks(updated)
    setSaving(true)
    postMessage({ type: 'saveHooks', hooks: updated })
  }, [])

  // Check if a preset is active by comparing its config entries against current hooks
  const isPresetActive = (preset: HookPreset): boolean => {
    for (const [event, matchers] of Object.entries(preset.config) as [HookEvent, HookMatcher[]][]) {
      const currentMatchers = hooks[event]
      if (!currentMatchers) return false
      for (const pm of matchers) {
        const found = currentMatchers.some(
          (cm) => cm.matcher === pm.matcher && cm.hooks.some((ch) => pm.hooks.some((ph) => ph.command === ch.command))
        )
        if (!found) return false
      }
    }
    return true
  }

  const togglePreset = (preset: HookPreset) => {
    const active = isPresetActive(preset)
    const updated = { ...hooks }

    if (active) {
      // Remove preset entries
      for (const [event, matchers] of Object.entries(preset.config) as [HookEvent, HookMatcher[]][]) {
        if (!updated[event]) continue
        for (const pm of matchers) {
          updated[event] = updated[event]!.filter(
            (cm) => !(cm.matcher === pm.matcher && cm.hooks.some((ch) => pm.hooks.some((ph) => ph.command === ch.command)))
          )
        }
        if (updated[event]!.length === 0) delete updated[event]
      }
    } else {
      // Add preset entries
      for (const [event, matchers] of Object.entries(preset.config) as [HookEvent, HookMatcher[]][]) {
        if (!updated[event]) updated[event] = []
        for (const pm of matchers) {
          const exists = updated[event]!.some(
            (cm) => cm.matcher === pm.matcher && cm.hooks.some((ch) => pm.hooks.some((ph) => ph.command === ch.command))
          )
          if (!exists) updated[event]!.push(pm)
        }
      }
    }

    saveHooks(updated)
  }

  const handleAddCustom = () => {
    if (!customCommand.trim()) return
    const updated = { ...hooks }
    if (!updated[customEvent]) updated[customEvent] = []
    updated[customEvent]!.push({
      matcher: customMatcher.trim() || '.*',
      hooks: [{ type: 'command', command: customCommand.trim() }],
    })
    saveHooks(updated)
    setCustomCommand('')
    setShowCustom(false)
  }

  const handleRemoveHook = (event: HookEvent, index: number) => {
    const updated = { ...hooks }
    if (!updated[event]) return
    updated[event] = updated[event]!.filter((_, i) => i !== index)
    if (updated[event]!.length === 0) delete updated[event]
    saveHooks(updated)
  }

  if (!loaded) {
    return <div style={{ fontSize: '11px', opacity: 0.5, padding: '8px 0' }}>Loading hooks...</div>
  }

  // Collect all custom (non-preset) hooks
  const allEntries: { event: HookEvent; matcher: HookMatcher; index: number }[] = []
  const HOOK_EVENTS: HookEvent[] = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop']
  for (const evt of HOOK_EVENTS) {
    const matchers = hooks[evt]
    if (matchers) {
      matchers.forEach((m, i) => allEntries.push({ event: evt, matcher: m, index: i }))
    }
  }

  return (
    <div>
      {/* Preset grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '14px' }}>
        {HOOK_PRESETS.map((preset) => {
          const active = isPresetActive(preset)
          return (
            <button
              key={preset.id}
              onClick={() => togglePreset(preset)}
              className="cursor-pointer border-none text-left"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                background: active ? 'rgba(99, 102, 241, 0.12)' : 'var(--chatui-surface-1, rgba(255,255,255,0.03))',
                border: `1px solid ${active ? 'rgba(99, 102, 241, 0.3)' : 'var(--chatui-glass-border, rgba(255,255,255,0.08))'}`,
                transition: 'all 0.15s',
                color: 'var(--vscode-editor-foreground)',
              }}
            >
              <div className="flex items-center gap-2" style={{ marginBottom: '4px' }}>
                <span style={{ fontSize: '14px' }}>{preset.icon}</span>
                <span style={{ fontSize: '12px', fontWeight: 600 }}>{preset.name}</span>
                {active && (
                  <span style={{
                    fontSize: '9px',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    background: 'rgba(34, 197, 94, 0.15)',
                    color: '#22c55e',
                    fontWeight: 700,
                    marginLeft: 'auto',
                  }}>ON</span>
                )}
              </div>
              <div style={{ fontSize: '10px', opacity: 0.6, lineHeight: 1.4 }}>{preset.desc}</div>
            </button>
          )
        })}
      </div>

      {/* Active hooks list */}
      {allEntries.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontSize: '11px', opacity: 0.6, marginBottom: '6px', fontWeight: 500 }}>Active Hooks</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {allEntries.map(({ event, matcher, index }) => (
              <div
                key={`${event}-${index}`}
                className="flex items-center gap-2"
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'var(--chatui-surface-1, rgba(255,255,255,0.03))',
                  border: '1px solid var(--chatui-glass-border, rgba(255,255,255,0.08))',
                  fontSize: '11px',
                }}
              >
                <span style={{
                  fontSize: '9px', fontWeight: 600,
                  padding: '2px 5px', borderRadius: '3px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: 'var(--chatui-accent)',
                  whiteSpace: 'nowrap',
                }}>
                  {event}
                </span>
                <span className="font-mono" style={{ opacity: 0.55, fontSize: '10px' }}>
                  {matcher.matcher}
                </span>
                <span className="font-mono truncate flex-1" style={{ opacity: 0.8, fontSize: '10px' }}>
                  {matcher.hooks.map(h => h.command).join('; ')}
                </span>
                <button
                  onClick={() => handleRemoveHook(event, index)}
                  className="cursor-pointer bg-transparent border-none"
                  style={{
                    padding: '1px 5px',
                    fontSize: '10px',
                    opacity: 0.4,
                    color: 'var(--vscode-errorForeground)',
                    borderRadius: '3px',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.4' }}
                >
                  x
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom hook toggle */}
      {showCustom ? (
        <div style={{
          ...cardStyle,
          background: 'var(--chatui-surface-1, rgba(255,255,255,0.03))',
        }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600 }}>Custom Hook</span>
            <button
              onClick={() => setShowCustom(false)}
              className="cursor-pointer border-none"
              style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'var(--vscode-editor-foreground)' }}
            >
              Cancel
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div>
              <label style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '3px' }}>Event</label>
              <select
                value={customEvent}
                onChange={(e) => setCustomEvent(e.target.value as HookEvent)}
                className="w-full px-2 py-1 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
              >
                <option value="PreToolUse">Pre Tool Use - Before a tool executes</option>
                <option value="PostToolUse">Post Tool Use - After a tool executes</option>
                <option value="Notification">Notification - When a notification is sent</option>
                <option value="Stop">Stop - When the agent stops</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '3px' }}>Matcher (regex)</label>
              <input
                value={customMatcher}
                onChange={(e) => setCustomMatcher(e.target.value)}
                placeholder=".*"
                className="w-full px-2 py-1 text-xs font-mono bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', opacity: 0.7, display: 'block', marginBottom: '3px' }}>Command</label>
              <input
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="echo 'hook fired'"
                className="w-full px-2 py-1 text-xs font-mono bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
              />
            </div>
            <button
              onClick={handleAddCustom}
              disabled={!customCommand.trim()}
              className="cursor-pointer border-none disabled:opacity-50"
              style={{
                padding: '5px 14px', fontSize: '12px', borderRadius: '4px',
                background: 'var(--chatui-accent)', color: '#fff', alignSelf: 'flex-start',
              }}
            >
              Add
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowCustom(true)}
          className="cursor-pointer border-none w-full"
          style={{
            padding: '8px',
            borderRadius: '6px',
            background: 'transparent',
            border: '1px dashed rgba(255,255,255,0.15)',
            color: 'var(--vscode-editor-foreground)',
            fontSize: '11px',
            opacity: 0.5,
            transition: 'opacity 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
        >
          + Add Custom Hook
        </button>
      )}

      {saving && <div style={{ fontSize: '10px', opacity: 0.5, marginTop: '6px' }}>Saving...</div>}
    </div>
  )
}

function HooksSection() {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={cardStyle}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer bg-transparent border-none text-inherit p-0"
      >
        <span style={{
          fontSize: '10px',
          opacity: 0.6,
          transition: 'transform 0.2s',
          transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
          display: 'inline-block',
        }}>&#9654;</span>
        <span style={{ ...sectionTitleStyle, marginBottom: 0 }}>Hooks</span>
        <span style={{
          fontSize: '10px',
          padding: '1px 6px',
          borderRadius: '4px',
          background: 'rgba(255,255,255,0.08)',
          opacity: 0.6,
        }}>Presets</span>
      </button>
      <p style={{ fontSize: '10px', opacity: 0.5, margin: '6px 0 0', lineHeight: 1.4 }}>
        Run shell commands on Claude events. Click presets to toggle, or add custom hooks.
      </p>
      {expanded && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--chatui-glass-border, rgba(255,255,255,0.08))' }}>
          <HooksStore />
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main SettingsPanel
// ============================================================================

export function SettingsPanel() {
  const { thinkingIntensity, yoloMode, disallowedTools } = useSettingsStore()
  const setActiveView = useUIStore((s) => s.setActiveView)

  useEffect(() => {
    postMessage({ type: 'getSettings' })
  }, [])

  const updateSetting = (key: string, value: unknown) => {
    postMessage({ type: 'updateSettings', settings: { [key]: value } })
    if (key === 'thinking.intensity') {
      useSettingsStore.getState().updateSettings({ thinkingIntensity: value as string })
    } else if (key === 'yoloMode') {
      useSettingsStore.getState().updateSettings({ yoloMode: value as boolean })
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vscode-editor-background)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--chatui-glass-border, rgba(255,255,255,0.08))',
          background: 'var(--chatui-surface-1, rgba(255,255,255,0.03))',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Settings</h3>
        <button
          onClick={() => setActiveView('chat')}
          className="cursor-pointer border-none"
          style={{
            fontSize: '12px',
            padding: '4px 12px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--vscode-editor-foreground)',
            opacity: 0.8,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >
          {'<-'} Back to Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '16px 16px 48px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Agent Mode */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Agent Mode</div>
          <select
            value={thinkingIntensity}
            onChange={(e) => updateSetting('thinking.intensity', e.target.value)}
            className="w-full bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border)"
            style={{ padding: '8px 10px', fontSize: '13px', borderRadius: '6px' }}
          >
            <option value="fast">Fast</option>
            <option value="deep">Deep</option>
            <option value="precise">Precise</option>
          </select>
          <p style={descStyle}>
            Maps to CLI <span className="font-mono" style={{ opacity: 0.8 }}>--effort</span>.{' '}
            <span style={{ color: 'var(--chatui-accent)', fontWeight: 500 }}>Fast</span> (low): minimal tokens
            {' | '}
            <span style={{ color: '#22c55e', fontWeight: 500 }}>Deep</span> (medium): balanced
            {' | '}
            <span style={{ color: '#f59e0b', fontWeight: 500 }}>Precise</span> (high): thorough reasoning
          </p>
        </div>

        {/* YOLO Mode */}
        <div style={cardStyle}>
          <label className="flex items-center gap-3 cursor-pointer" style={{ marginBottom: '4px' }}>
            <div
              onClick={() => updateSetting('yoloMode', !yoloMode)}
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                background: yoloMode ? 'var(--chatui-accent)' : 'rgba(255,255,255,0.15)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: '2px',
                left: yoloMode ? '18px' : '2px',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>YOLO Mode</span>
            {yoloMode && (
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                fontWeight: 600,
              }}>Default ON</span>
            )}
          </label>
          <p style={descStyle}>
            Skip all permission prompts. Claude will execute tools without asking for approval. Safe with Git version control.
          </p>
        </div>

        {/* Blocked Tools */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Blocked Tools</div>
          <p style={{ ...descStyle, marginTop: 0, marginBottom: '10px' }}>
            Prevent Claude from using specific tools. Blocked tools are passed as --disallowedTools to CLI.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {TOOL_INFO.map(({ name, desc }) => {
              const blocked = disallowedTools.includes(name)
              return (
                <label
                  key={name}
                  className="flex items-center gap-3 cursor-pointer"
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: blocked ? 'rgba(239, 68, 68, 0.08)' : 'var(--chatui-surface-1, rgba(255,255,255,0.03))',
                    border: `1px solid ${blocked ? 'rgba(239, 68, 68, 0.2)' : 'var(--chatui-glass-border, rgba(255,255,255,0.08))'}`,
                    transition: 'all 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={blocked}
                    onChange={() => {
                      const next = blocked
                        ? disallowedTools.filter((t) => t !== name)
                        : [...disallowedTools, name]
                      useSettingsStore.getState().updateSettings({ disallowedTools: next })
                      updateSetting('disallowedTools', next)
                    }}
                    className="accent-(--vscode-focusBorder)"
                    style={{ flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex items-center gap-2">
                      <span className="font-mono" style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: blocked ? '#ef4444' : 'var(--vscode-editor-foreground)',
                        textDecoration: blocked ? 'line-through' : 'none',
                      }}>{name}</span>
                    </div>
                    <div style={{ fontSize: '10px', opacity: 0.55, marginTop: '2px' }}>{desc}</div>
                  </div>
                </label>
              )
            })}
          </div>
        </div>

        {/* Hooks Configuration */}
        <HooksSection />
      </div>
    </div>
  )
}
