import { useEffect, useState } from 'react'
import { postMessage } from '../lib/vscode'
import { useSettingsStore, type CustomSnippet } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'

export function SettingsPanel() {
  const { thinkingIntensity, yoloMode, customSnippets, addCustomSnippet, removeCustomSnippet } = useSettingsStore()
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
    } else if (key === 'permissions.yoloMode') {
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

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Thinking Intensity */}
        <div>
          <label className="text-xs font-medium block mb-1.5">Thinking Intensity</label>
          <select
            value={thinkingIntensity}
            onChange={(e) => updateSetting('thinking.intensity', e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-(--vscode-input-background) text-(--vscode-input-foreground) border border-(--vscode-input-border) rounded"
          >
            <option value="think">Think</option>
            <option value="think-hard">Think Hard</option>
            <option value="think-harder">Think Harder</option>
            <option value="ultrathink">Ultrathink</option>
          </select>
          <p className="text-[10px] opacity-50 mt-1">Controls how deeply Claude thinks through problems</p>
        </div>

        {/* YOLO Mode */}
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={yoloMode}
              onChange={(e) => updateSetting('permissions.yoloMode', e.target.checked)}
              className="accent-(--vscode-focusBorder)"
            />
            <span className="text-xs font-medium">YOLO Mode</span>
          </label>
          <p className="text-[10px] opacity-50 mt-1">
            Skip all permission prompts. Use with caution — Claude will execute tools without asking.
          </p>
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
