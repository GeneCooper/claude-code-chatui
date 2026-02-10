import { useState } from 'react'
import { postMessage } from '../lib/vscode'

interface Props {
  data: Record<string, unknown>
}

export function ToolUseBlock({ data }: Props) {
  const [showInput, setShowInput] = useState(false)
  const toolName = data.toolName as string
  const rawInput = data.rawInput as Record<string, unknown> | undefined

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'Read': return '📖'
      case 'Write': return '✏️'
      case 'Edit': case 'MultiEdit': return '🔧'
      case 'Bash': return '💻'
      case 'Glob': case 'Grep': return '🔍'
      case 'Task': return '📋'
      case 'TodoWrite': return '✅'
      case 'WebFetch': case 'WebSearch': return '🌐'
      default: return '🔧'
    }
  }

  const getToolSummary = () => {
    if (!rawInput) return ''
    if (rawInput.command) return String(rawInput.command)
    if (rawInput.file_path) return String(rawInput.file_path)
    if (rawInput.pattern) return String(rawInput.pattern)
    if (rawInput.query) return String(rawInput.query)
    if (rawInput.url) return String(rawInput.url)
    return ''
  }

  const summary = getToolSummary()

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden text-xs">
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--vscode-sideBar-background)] cursor-pointer"
        onClick={() => setShowInput(!showInput)}
      >
        <span>{getToolIcon(toolName)}</span>
        <span className="font-medium">{toolName}</span>
        {summary && (
          <span className="opacity-50 truncate flex-1 font-mono text-[11px]">{summary}</span>
        )}
        {rawInput?.file_path != null && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              postMessage({ type: 'openFile', filePath: String(rawInput.file_path) })
            }}
            className="opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
          >
            Open
          </button>
        )}
      </div>

      {showInput && rawInput && (
        <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)] max-h-40 overflow-y-auto">
          <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-70 m-0">
            {JSON.stringify(rawInput, null, 2)}
          </pre>
        </div>
      )}

      {typeof data.toolInput === 'string' && data.toolInput && (
        <div className="px-3 py-1.5 border-t border-[var(--vscode-panel-border)] opacity-70 whitespace-pre-wrap">
          {String(data.toolInput)}
        </div>
      )}
    </div>
  )
}
