import { useState } from 'react'
import { postMessage } from '../lib/vscode'

interface Props {
  data: Record<string, unknown>
}

export function PermissionDialog({ data }: Props) {
  const id = data.id as string
  const tool = data.tool as string
  const input = data.input as Record<string, unknown> | undefined
  const status = data.status as string
  const decisionReason = data.decisionReason as string | undefined
  const [showMore, setShowMore] = useState(false)
  const [showRawInput, setShowRawInput] = useState(false)

  if (status !== 'pending') {
    return (
      <div className={`px-3 py-2 rounded-lg text-xs border ${
        status === 'approved'
          ? 'border-green-600/30 bg-green-900/10 opacity-60'
          : 'border-red-600/30 bg-red-900/10 opacity-60'
      }`}>
        <span>{status === 'approved' ? '\u2705' : '\u274C'} {tool} — {status}</span>
      </div>
    )
  }

  const handleRespond = (approved: boolean, alwaysAllow?: boolean) => {
    postMessage({ type: 'permissionResponse', id, approved, alwaysAllow: alwaysAllow || false })
  }

  const handleEnableYolo = () => {
    postMessage({ type: 'updateSettings', settings: { 'permissions.yoloMode': true } })
    handleRespond(true)
  }

  const getSummary = () => {
    if (!input) return ''
    if (input.command) return String(input.command)
    if (input.file_path) return String(input.file_path)
    if (input.pattern) return String(input.pattern)
    if (input.query) return String(input.query)
    if (input.url) return String(input.url)
    return ''
  }

  return (
    <div className="border-2 border-yellow-500/50 bg-yellow-900/10 rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-yellow-400">{'\u26A0\uFE0F'}</span>
          <span className="font-medium">Permission Required: {tool}</span>
        </div>

        {decisionReason && (
          <div className="text-xs opacity-60 mb-1">{decisionReason}</div>
        )}

        {getSummary() && (
          <div className="font-mono text-xs opacity-70 bg-[var(--vscode-editor-background)] rounded px-2 py-1 my-1.5 break-all">
            {getSummary()}
          </div>
        )}

        {/* Show raw input */}
        {input && (
          <button
            onClick={() => setShowRawInput(!showRawInput)}
            className="text-[10px] opacity-40 hover:opacity-70 cursor-pointer bg-transparent border-none text-inherit mt-1"
          >
            {showRawInput ? 'Hide details' : 'Show details'}
          </button>
        )}
        {showRawInput && input && (
          <pre className="text-[10px] opacity-50 mt-1 p-2 rounded bg-[var(--vscode-editor-background)] overflow-auto max-h-32 m-0">
            {JSON.stringify(input, null, 2)}
          </pre>
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-yellow-500/20">
        <button
          onClick={() => handleRespond(true)}
          className="px-3 py-1 text-xs rounded bg-green-700 text-white hover:bg-green-600 cursor-pointer border-none"
        >
          Allow
        </button>
        <button
          onClick={() => handleRespond(true, true)}
          className="px-3 py-1 text-xs rounded bg-green-900 text-green-200 hover:bg-green-800 cursor-pointer border-none"
        >
          Always Allow
        </button>
        <button
          onClick={() => handleRespond(false)}
          className="px-3 py-1 text-xs rounded bg-red-700 text-white hover:bg-red-600 cursor-pointer border-none"
        >
          Deny
        </button>

        {/* More options dropdown */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowMore(!showMore)}
            className="px-2 py-1 text-[10px] opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit"
          >
            More...
          </button>
          {showMore && (
            <div className="absolute bottom-full right-0 mb-1 bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-editorWidget-border)] rounded-lg shadow-lg z-50 min-w-[160px]">
              <button
                onClick={() => { handleEnableYolo(); setShowMore(false) }}
                className="w-full text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none text-inherit hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                Enable YOLO Mode
              </button>
              <button
                onClick={() => { handleRespond(true, true); setShowMore(false) }}
                className="w-full text-left px-3 py-1.5 text-xs cursor-pointer bg-transparent border-none text-inherit hover:bg-[var(--vscode-list-hoverBackground)]"
              >
                Allow this tool always
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
