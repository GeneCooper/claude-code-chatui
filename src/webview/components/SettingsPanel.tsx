import { useEffect, useState, useCallback } from 'react'
import { postMessage } from '../hooks'
import { useSettingsStore, type CustomSnippet } from '../store'
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

const HOOK_EVENTS: { key: HookEvent; label: string; desc: string }[] = [
  { key: 'PreToolUse', label: 'Pre Tool Use', desc: 'Before a tool executes' },
  { key: 'PostToolUse', label: 'Post Tool Use', desc: 'After a tool executes' },
  { key: 'Notification', label: 'Notification', desc: 'When a notification is sent' },
  { key: 'Stop', label: 'Stop', desc: 'When the agent stops' },
]

// ============================================================================
// HooksEditor Sub-component
// ============================================================================

function HooksEditor() {
  const [hooks, setHooks] = useState<HooksConfig>({})
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Form state for adding a new hook
  const [addingEvent, setAddingEvent] = useState<HookEvent | null>(null)
  const [newMatcher, setNewMatcher] = useState('.*')
  const [newCommand, setNewCommand] = useState('')

  // Load hooks on mount
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

  const handleAddHook = () => {
    if (!addingEvent || !newCommand.trim()) return
    const updated = { ...hooks }
    if (!updated[addingEvent]) updated[addingEvent] = []
    updated[addingEvent]!.push({
      matcher: newMatcher.trim() || '.*',
      hooks: [{ type: 'command', command: newCommand.trim() }],
    })
    saveHooks(updated)
    setAddingEvent(null)
    setNewMatcher('.*')
    setNewCommand('')
  }

  const handleRemoveHook = (event: HookEvent, index: number) => {
    const updated = { ...hooks }
    if (!updated[event]) return
    updated[event] = updated[event]!.filter((_, i) => i !== index)
    if (updated[event]!.length === 0) delete updated[event]
    saveHooks(updated)
  }

  if (!loaded) {
    return <div className="text-[10px] opacity-40 py-2">Loading hooks...</div>
  }

  const allEntries: { event: HookEvent; matcher: HookMatcher; index: number }[] = []
  for (const evt of HOOK_EVENTS) {
    const matchers = hooks[evt.key]
    if (matchers) {
      matchers.forEach((m, i) => allEntries.push({ event: evt.key, matcher: m, index: i }))
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs font-medium">Hooks</label>
        {addingEvent ? (
          <button
            onClick={() => setAddingEvent(null)}
            className="text-[10px] px-2 py-0.5 rounded bg-(--vscode-button-background) text-(--vscode-button-foreground) cursor-pointer border-none"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={() => setAddingEvent('PreToolUse')}
            className="text-[10px] px-2 py-0.5 rounded bg-(--vscode-button-background) text-(--vscode-button-foreground) cursor-pointer border-none"
          >
            + Add
          </button>
        )}
      </div>
      <p className="text-[10px] opacity-40 mb-2">
        Run shell commands on Claude Code events. Saved to ~/.claude/settings.json
      </p>

      {/* Add hook form */}
      {addingEvent && (
        <div className="space-y-2 mb-3 p-2 rounded border border-(--vscode-panel-border)">
          <div>
            <label className="text-[10px] opacity-50 block mb-0.5">Event</label>
            <select
              value={addingEvent}
              onChange={(e) => setAddingEvent(e.target.value as HookEvent)}
              className="w-full px-2 py-1 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
            >
              {HOOK_EVENTS.map((evt) => (
                <option key={evt.key} value={evt.key}>{evt.label} — {evt.desc}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] opacity-50 block mb-0.5">Matcher (regex, e.g. "Bash" or ".*")</label>
            <input
              value={newMatcher}
              onChange={(e) => setNewMatcher(e.target.value)}
              placeholder=".*"
              className="w-full px-2 py-1 text-xs font-mono bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
            />
          </div>
          <div>
            <label className="text-[10px] opacity-50 block mb-0.5">Command</label>
            <input
              value={newCommand}
              onChange={(e) => setNewCommand(e.target.value)}
              placeholder="echo 'hook fired'"
              className="w-full px-2 py-1 text-xs font-mono bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
            />
          </div>
          <button
            onClick={handleAddHook}
            disabled={!newCommand.trim()}
            className="px-3 py-1 text-xs rounded bg-(--vscode-button-background) text-(--vscode-button-foreground) cursor-pointer border-none disabled:opacity-50"
          >
            Add Hook
          </button>
        </div>
      )}

      {/* Existing hooks list */}
      {allEntries.length > 0 ? (
        <div className="space-y-1">
          {allEntries.map(({ event, matcher, index }) => (
            <div
              key={`${event}-${index}`}
              className="flex items-center gap-2 px-2 py-1.5 rounded border border-(--vscode-panel-border) text-xs"
            >
              <span style={{
                fontSize: '9px', fontWeight: 600,
                padding: '1px 4px', borderRadius: '4px',
                background: 'rgba(139, 92, 246, 0.15)',
                color: '#8b5cf6',
                whiteSpace: 'nowrap',
              }}>
                {event}
              </span>
              <span className="font-mono opacity-50 text-[10px]" title="Matcher pattern">
                {matcher.matcher}
              </span>
              <span className="font-mono opacity-70 truncate flex-1 text-[10px]" title={matcher.hooks.map(h => h.command).join('; ')}>
                {matcher.hooks.map(h => h.command).join('; ')}
              </span>
              <button
                onClick={() => handleRemoveHook(event, index)}
                className="px-1.5 py-0.5 text-[10px] opacity-50 hover:opacity-100 cursor-pointer bg-transparent border-none text-(--vscode-errorForeground)"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] opacity-40">No hooks configured.</p>
      )}

      {saving && <p className="text-[10px] opacity-40 mt-1">Saving...</p>}
    </div>
  )
}

// ============================================================================
// Main SettingsPanel
// ============================================================================

export function SettingsPanel() {
  const { thinkingIntensity, yoloMode, maxTurns, customSnippets, addCustomSnippet, removeCustomSnippet } = useSettingsStore()
  const setActiveView = useUIStore((s) => s.setActiveView)

  // Snippet form
  const [showSnippetForm, setShowSnippetForm] = useState(false)
  const [snippetCmd, setSnippetCmd] = useState('')
  const [snippetDesc, setSnippetDesc] = useState('')
  const [snippetPrompt, setSnippetPrompt] = useState('')

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

  const handleSaveSnippet = () => {
    if (!snippetCmd.trim() || !snippetPrompt.trim()) return
    const snippet: CustomSnippet = {
      command: snippetCmd.trim().replace(/\s+/g, '-').toLowerCase(),
      description: snippetDesc.trim() || snippetCmd.trim(),
      prompt: snippetPrompt.trim(),
    }
    addCustomSnippet(snippet)
    postMessage({ type: 'updateSettings', settings: { 'customSnippets': [...customSnippets.filter(s => s.command !== snippet.command), snippet] } })
    setSnippetCmd('')
    setSnippetDesc('')
    setSnippetPrompt('')
    setShowSnippetForm(false)
  }

  const handleDeleteSnippet = (command: string) => {
    removeCustomSnippet(command)
    postMessage({ type: 'updateSettings', settings: { 'customSnippets': customSnippets.filter(s => s.command !== command) } })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--vscode-panel-border)">
        <span className="font-medium text-sm">Settings</span>
        <button
          onClick={() => setActiveView('chat')}
          className="text-xs opacity-60 hover:opacity-100 cursor-pointer bg-transparent border-none text-inherit"
        >
          Back to Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-4">
        {/* Agent Mode */}
        <div>
          <label className="text-xs font-medium block mb-1.5">Agent Mode</label>
          <select
            value={thinkingIntensity}
            onChange={(e) => updateSetting('thinking.intensity', e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
          >
            <option value="fast">Fast</option>
            <option value="deep">Deep</option>
            <option value="precise">Precise</option>
          </select>
          <p className="text-[10px] opacity-50 mt-1">Fast: minimal tokens | Deep: structured workflow | Precise: anti-hallucination</p>
        </div>

        {/* YOLO Mode */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={yoloMode}
              onChange={(e) => updateSetting('yoloMode', e.target.checked)}
              className="accent-(--vscode-focusBorder)"
            />
            <span className="text-xs font-medium">YOLO Mode</span>
          </label>
          <p className="text-[10px] opacity-50 mt-1">
            Skip all permission prompts. Use with caution — Claude will execute tools without asking.
          </p>
        </div>

        {/* Max Turns */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium">Max Turns</label>
            <span className="text-xs font-mono opacity-60">{maxTurns === 0 ? '∞' : maxTurns}</span>
          </div>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={maxTurns}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              useSettingsStore.getState().updateSettings({ maxTurns: v })
              updateSetting('maxTurns', v)
            }}
            className="w-full accent-(--vscode-focusBorder)"
          />
          <p className="text-[10px] opacity-50 mt-1">
            Limit agentic tool-use loops per request. 0 = unlimited. Prevents runaway loops and controls token usage.
          </p>
        </div>

        {/* Hooks Configuration */}
        <div className="border-t border-(--vscode-panel-border) pt-3">
          <HooksEditor />
        </div>

        {/* Custom Prompt Snippets */}
        <div className="border-t border-(--vscode-panel-border) pt-3">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium">Custom Prompt Snippets</label>
            <button
              onClick={() => setShowSnippetForm(!showSnippetForm)}
              className="text-[10px] px-2 py-0.5 rounded bg-(--vscode-button-background) text-(--vscode-button-foreground) cursor-pointer border-none"
            >
              {showSnippetForm ? 'Cancel' : '+ Add'}
            </button>
          </div>

          {showSnippetForm && (
            <div className="space-y-2 mb-3 p-2 rounded border border-(--vscode-panel-border)">
              <input
                value={snippetCmd}
                onChange={(e) => setSnippetCmd(e.target.value)}
                placeholder="Command name (e.g. my-review)"
                className="w-full px-2 py-1 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
              />
              <input
                value={snippetDesc}
                onChange={(e) => setSnippetDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-2 py-1 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
              />
              <textarea
                value={snippetPrompt}
                onChange={(e) => setSnippetPrompt(e.target.value)}
                placeholder="Prompt template..."
                rows={3}
                className="w-full px-2 py-1 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded resize-none"
              />
              <button
                onClick={handleSaveSnippet}
                disabled={!snippetCmd.trim() || !snippetPrompt.trim()}
                className="px-3 py-1 text-xs rounded bg-(--vscode-button-background) text-(--vscode-button-foreground) cursor-pointer border-none disabled:opacity-50"
              >
                Save Snippet
              </button>
            </div>
          )}

          {customSnippets.length > 0 ? (
            <div className="space-y-1">
              {customSnippets.map((snippet) => (
                <div
                  key={snippet.command}
                  className="flex items-center justify-between px-2 py-1.5 rounded border border-(--vscode-panel-border) text-xs"
                >
                  <div className="truncate flex-1">
                    <span className="font-mono opacity-60">/{snippet.command}</span>
                    <span className="opacity-40 ml-2">{snippet.description}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteSnippet(snippet.command)}
                    className="px-1.5 py-0.5 text-[10px] opacity-50 hover:opacity-100 cursor-pointer bg-transparent border-none text-(--vscode-errorForeground)"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] opacity-40">No custom snippets. Add one to use as /command.</p>
          )}
        </div>

        {/* Navigation shortcuts */}
        <div className="border-t border-(--vscode-panel-border) pt-3">
          <label className="text-xs font-medium block mb-2">Quick Links</label>
          <div className="space-y-1.5">
            <button
              onClick={() => { useUIStore.getState().setShowMCPModal(true); setActiveView('chat') }}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-(--vscode-list-hoverBackground) cursor-pointer bg-transparent border-none text-inherit"
            >
              MCP Server Management
            </button>
            <button
              onClick={() => setActiveView('history')}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-(--vscode-list-hoverBackground) cursor-pointer bg-transparent border-none text-inherit"
            >
              Conversation History
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
