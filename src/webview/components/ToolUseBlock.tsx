import { useState, memo } from 'react'
import { postMessage } from '../hooks'

const FILE_EDIT_TOOLS = ['Edit', 'Write', 'NotebookEdit']

// Subagent type badge colors
const SUBAGENT_COLORS: Record<string, string> = {
  Bash: '#f59e0b',
  Explore: '#3b82f6',
  Plan: '#8b5cf6',
  'general-purpose': '#10b981',
}

interface Props {
  data: Record<string, unknown>
}

export const ToolUseBlock = memo(function ToolUseBlock({ data }: Props) {
  const [showInput, setShowInput] = useState(false)
  const toolName = data.toolName as string
  const rawInput = data.rawInput as Record<string, unknown> | undefined
  const fileContentBefore = data.fileContentBefore as string | undefined
  const filePath = rawInput?.file_path as string | undefined

  const isSubagent = toolName === 'Task'
  const subagentType = isSubagent ? (rawInput?.subagent_type as string) || 'Agent' : ''
  const subagentDesc = isSubagent ? (rawInput?.description as string) || '' : ''
  const subagentColor = SUBAGENT_COLORS[subagentType] || '#6366f1'

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
    if (isSubagent) return subagentDesc
    if (rawInput.command) return String(rawInput.command)
    if (rawInput.file_path) return String(rawInput.file_path)
    if (rawInput.pattern) return String(rawInput.pattern)
    if (rawInput.query) return String(rawInput.query)
    if (rawInput.url) return String(rawInput.url)
    return ''
  }

  const summary = getToolSummary()

  // Subagent (Task) tool — special rendering
  if (isSubagent) {
    return (
      <div
        className="overflow-hidden text-xs"
        style={{
          border: `1px solid ${subagentColor}30`,
          borderRadius: 'var(--radius-md)',
          background: `${subagentColor}08`,
          animation: 'fadeIn 0.15s ease',
        }}
      >
        {/* Subagent header */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          style={{
            padding: '6px 10px',
            borderBottom: showInput ? `1px solid ${subagentColor}20` : 'none',
          }}
          onClick={() => setShowInput(!showInput)}
        >
          {/* Subagent icon */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={subagentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
          <span style={{ fontWeight: 600, fontSize: '12px', color: subagentColor }}>
            Subagent
          </span>
          {/* Type badge */}
          <span style={{
            fontSize: '9px', fontWeight: 700,
            padding: '1px 5px', borderRadius: '8px',
            background: `${subagentColor}20`,
            color: subagentColor,
            letterSpacing: '0.3px',
          }}>
            {subagentType}
          </span>
          {summary && (
            <span className="truncate flex-1 text-[11px]" style={{ opacity: 0.6 }}>{summary}</span>
          )}
          <span style={{ opacity: 0.4, fontSize: '9px' }}>{showInput ? '▾' : '▸'}</span>
        </div>

        {/* Expanded: show prompt */}
        {showInput && rawInput && (
          <div className="px-3 py-2 max-h-60 overflow-y-auto" style={{ paddingLeft: '12px' }}>
            {rawInput.prompt && (
              <div style={{ marginBottom: '6px' }}>
                <div className="text-[10px] opacity-40 mb-1">Prompt</div>
                <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-70 m-0" style={{ maxHeight: '200px', overflow: 'auto' }}>
                  {String(rawInput.prompt)}
                </pre>
              </div>
            )}
            {rawInput.model && (
              <div className="text-[10px] opacity-40 mt-1">
                Model: <span className="font-mono">{String(rawInput.model)}</span>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // Normal tool — original rendering
  return (
    <div
      className="overflow-hidden text-xs"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      {/* Tool header */}
      <div
        className="flex items-center gap-2 cursor-pointer"
        style={{
          padding: '6px 10px',
          borderBottom: showInput ? '1px solid rgba(255, 255, 255, 0.06)' : 'none',
        }}
        onClick={() => setShowInput(!showInput)}
      >
        <span style={{ opacity: 0.4, fontSize: '10px' }}>&#9654;</span>
        <span style={{ fontWeight: 500, fontSize: '12px', opacity: 0.9 }}>{toolName}</span>
        {toolName === 'Bash' && (
          <span style={{
            fontSize: '9px', fontWeight: 700, opacity: 0.5,
            padding: '0 3px', borderRadius: '2px',
            background: 'rgba(255,255,255,0.08)',
            letterSpacing: '0.5px',
          }}>IN</span>
        )}
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
})
