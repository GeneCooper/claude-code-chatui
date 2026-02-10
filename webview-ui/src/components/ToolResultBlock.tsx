import { useState } from 'react'

interface Props {
  data: Record<string, unknown>
}

export function ToolResultBlock({ data }: Props) {
  const [expanded, setExpanded] = useState(false)
  const isError = data.isError as boolean
  const content = String(data.content || '')
  const toolName = data.toolName as string | undefined

  // Truncate long content
  const isLong = content.length > 300
  const displayContent = expanded ? content : content.substring(0, 300)

  return (
    <div
      className={`border rounded-lg overflow-hidden text-xs ${
        isError
          ? 'border-[var(--vscode-inputValidation-errorBorder)] bg-[var(--vscode-inputValidation-errorBackground)]'
          : 'border-[var(--vscode-panel-border)]'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-1 bg-[var(--vscode-sideBar-background)]">
        <span>{isError ? '❌' : '✅'}</span>
        <span className="opacity-60">
          {toolName ? `${toolName} result` : 'Result'}
        </span>
      </div>

      {content && content !== 'Tool executed successfully' && (
        <div className="px-3 py-2 border-t border-[var(--vscode-panel-border)]">
          <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-70 m-0">
            {displayContent}
            {isLong && !expanded && '...'}
          </pre>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-[10px] opacity-50 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
