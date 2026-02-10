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

  if (status !== 'pending') {
    return (
      <div className={`px-3 py-2 rounded-lg text-xs border ${
        status === 'approved'
          ? 'border-green-600/30 bg-green-900/10 opacity-60'
          : 'border-red-600/30 bg-red-900/10 opacity-60'
      }`}>
        <span>{status === 'approved' ? '✅' : '❌'} {tool} — {status}</span>
      </div>
    )
  }

  const handleRespond = (approved: boolean, alwaysAllow?: boolean) => {
    postMessage({ type: 'permissionResponse', id, approved, alwaysAllow: alwaysAllow || false })
  }

  const getSummary = () => {
    if (!input) return ''
    if (input.command) return String(input.command)
    if (input.file_path) return String(input.file_path)
    return ''
  }

  return (
    <div className="border-2 border-yellow-500/50 bg-yellow-900/10 rounded-lg overflow-hidden">
      <div className="px-3 py-2 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-yellow-400">⚠️</span>
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
      </div>

      <div className="flex gap-2 px-3 py-2 border-t border-yellow-500/20">
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
      </div>
    </div>
  )
}
