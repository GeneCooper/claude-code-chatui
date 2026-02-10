import { useEffect } from 'react'
import { postMessage } from '../lib/vscode'
import { useSettingsStore } from '../stores/settingsStore'
import { useUIStore } from '../stores/uiStore'

export function SettingsPanel() {
  const { thinkingIntensity, yoloMode } = useSettingsStore()
  const setActiveView = useUIStore((s) => s.setActiveView)

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--vscode-panel-border)]">
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
            className="w-full px-2 py-1.5 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded"
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
              className="accent-[var(--vscode-focusBorder)]"
            />
            <span className="text-xs font-medium">YOLO Mode</span>
          </label>
          <p className="text-[10px] opacity-50 mt-1">
            Skip all permission prompts. Use with caution — Claude will execute tools without asking.
          </p>
        </div>

        {/* Navigation shortcuts */}
        <div className="border-t border-[var(--vscode-panel-border)] pt-3">
          <label className="text-xs font-medium block mb-2">Quick Links</label>
          <div className="space-y-1.5">
            <button
              onClick={() => setActiveView('mcp')}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer bg-transparent border-none text-inherit"
            >
              MCP Server Management
            </button>
            <button
              onClick={() => setActiveView('history')}
              className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer bg-transparent border-none text-inherit"
            >
              Conversation History
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
