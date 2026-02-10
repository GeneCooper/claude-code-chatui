import { useState } from 'react'
import { postMessage } from '../lib/vscode'

interface Props {
  data: Record<string, unknown>
}

export function ToolUseBlock({ data }: Props) {
  const [showInput, setShowInput] = useState(false)
  const toolName = data.toolName as string
  const rawInput = data.rawInput as Record<string, unknown> | undefined

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
    <div
      className="message-bar-tool overflow-hidden text-xs"
      style={{
        border: '1px solid rgba(120, 139, 237, 0.12)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeInUp 0.3s var(--ease-out-expo)',
      }}
    >
      {/* Tool header */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        style={{
          padding: '8px 12px',
          paddingLeft: '16px',
          borderBottom: showInput ? '1px solid rgba(255, 255, 255, 0.1)' : 'none',
        }}
        onClick={() => setShowInput(!showInput)}
      >
        {/* Tool icon */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: 'linear-gradient(135deg, #7c8bed 0%, #5d6fe1 100%)',
            fontSize: '10px',
            color: 'white',
            fontWeight: 600,
          }}
        >
          T
        </div>
        <span style={{ fontWeight: 500, fontSize: '13px', opacity: 0.9 }}>{toolName}</span>
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
        <div className="px-3 py-2 max-h-40 overflow-y-auto" style={{ paddingLeft: '16px' }}>
          <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-70 m-0">
            {JSON.stringify(rawInput, null, 2)}
          </pre>
        </div>
      )}

      {typeof data.toolInput === 'string' && data.toolInput && (
        <div
          className="opacity-70 whitespace-pre-wrap"
          style={{
            padding: '6px 12px',
            paddingLeft: '16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {String(data.toolInput)}
        </div>
      )}
    </div>
  )
}
