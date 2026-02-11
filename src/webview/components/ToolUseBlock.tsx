import { useState } from 'react'
import { postMessage } from '../hooks'

const FILE_EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit']

interface Props {
  data: Record<string, unknown>
}

export function ToolUseBlock({ data }: Props) {
  const [showInput, setShowInput] = useState(false)
  const toolName = data.toolName as string
  const rawInput = data.rawInput as Record<string, unknown> | undefined
  const fileContentBefore = data.fileContentBefore as string | undefined
  const filePath = rawInput?.file_path as string | undefined

  const canPreviewDiff = FILE_EDIT_TOOLS.includes(toolName) && fileContentBefore && filePath && rawInput

  const handlePreviewDiff = () => {
    if (!canPreviewDiff) return
    let expectedContent = fileContentBefore
    if (toolName === 'Write' && rawInput.content) {
      expectedContent = String(rawInput.content)
    } else if (toolName === 'Edit' && rawInput.old_string != null && rawInput.new_string != null) {
      expectedContent = fileContentBefore.replace(String(rawInput.old_string), String(rawInput.new_string))
    }
    postMessage({ type: 'openDiff', oldContent: fileContentBefore, newContent: expectedContent, filePath })
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
    <div
      className="overflow-hidden text-xs"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeInUp 0.3s var(--ease-out-expo)',
      }}
    >
      {/* Tool header */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        style={{
          padding: '8px 12px',
          borderBottom: showInput ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
        }}
        onClick={() => setShowInput(!showInput)}
      >
        <span style={{ opacity: 0.4, fontSize: '10px' }}>&#9654;</span>
        <span style={{ fontWeight: 500, fontSize: '13px', opacity: 0.9 }}>{toolName}</span>
        {summary && (
          <span className="opacity-40 truncate flex-1 font-mono text-[11px]">{summary}</span>
        )}
        {canPreviewDiff && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePreviewDiff()
            }}
            className="opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
          >
            Preview Diff
          </button>
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
        <div className="px-3 py-2 max-h-40 overflow-y-auto" style={{ paddingLeft: '12px' }}>
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
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          {String(data.toolInput)}
        </div>
      )}
    </div>
  )
}
