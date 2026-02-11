import { useState } from 'react'
import { postMessage } from '../hooks'

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
      <div
        className="text-xs"
        style={{
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          border: status === 'approved'
            ? '1px solid rgba(0, 210, 106, 0.3)'
            : '1px solid rgba(255, 69, 58, 0.3)',
          background: status === 'approved'
            ? 'rgba(0, 210, 106, 0.05)'
            : 'rgba(255, 69, 58, 0.05)',
          opacity: 0.6,
        }}
      >
        <span>{status === 'approved' ? '\u2705' : '\u274C'} {tool} â€?{status}</span>
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
    <div
      className="overflow-hidden"
      style={{
        margin: '4px 0 20px 0',
        background: 'rgba(252, 188, 0, 0.1)',
        border: '1px solid rgba(252, 188, 0, 0.3)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        animation: 'slideUp 0.3s ease',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3" style={{ fontWeight: 600 }}>
        <span style={{ fontSize: '16px' }}>{'\u26A0\uFE0F'}</span>
        <span className="text-sm">Permission Required: {tool}</span>

        {/* More menu */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowMore(!showMore)}
            className="cursor-pointer border-none"
            style={{
              background: 'none',
              color: 'var(--vscode-descriptionForeground)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '16px',
              fontWeight: 'bold',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none'
            }}
          >
            &#8943;
          </button>
          {showMore && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: 'var(--vscode-menu-background, var(--vscode-editor-background))',
                border: '1px solid var(--vscode-menu-border, var(--vscode-panel-border))',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 1000,
                minWidth: '220px',
                padding: '4px 0',
                marginTop: '4px',
              }}
            >
              <button
                onClick={() => { handleEnableYolo(); setShowMore(false) }}
                className="flex items-center gap-2 w-full text-left cursor-pointer border-none text-inherit"
                style={{
                  padding: '12px 16px',
                  background: 'transparent',
                  fontSize: '13px',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Enable YOLO Mode
              </button>
              <button
                onClick={() => { handleRespond(true, true); setShowMore(false) }}
                className="flex items-center gap-2 w-full text-left cursor-pointer border-none text-inherit"
                style={{
                  padding: '12px 16px',
                  background: 'transparent',
                  fontSize: '13px',
                  transition: 'background-color 0.2s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                Allow this tool always
              </button>
            </div>
          )}
        </div>
      </div>

      {decisionReason && (
        <div className="text-xs opacity-60 mb-2">{decisionReason}</div>
      )}

      {getSummary() && (
        <div
          className="font-mono text-xs break-all"
          style={{
            opacity: 0.7,
            background: 'var(--vscode-editor-background)',
            borderRadius: 'var(--radius-sm)',
            padding: '8px 12px',
            margin: '6px 0',
          }}
        >
          {getSummary()}
        </div>
      )}

      {input && (
        <button
          onClick={() => setShowRawInput(!showRawInput)}
          className="text-[10px] opacity-40 hover:opacity-70 cursor-pointer bg-transparent border-none text-inherit mt-1"
        >
          {showRawInput ? 'Hide details' : 'Show details'}
        </button>
      )}
      {showRawInput && input && (
        <pre className="text-[10px] opacity-50 mt-1 p-2 rounded m-0 overflow-auto max-h-32" style={{ background: 'var(--vscode-editor-background)' }}>
          {JSON.stringify(input, null, 2)}
        </pre>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap mt-2" style={{ justifyContent: 'flex-end' }}>
        <button
          onClick={() => handleRespond(false)}
          className="cursor-pointer text-xs"
          style={{
            background: 'transparent',
            color: 'var(--vscode-foreground)',
            border: '1px solid var(--vscode-panel-border)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
            e.currentTarget.style.borderColor = 'var(--vscode-focusBorder)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
          }}
        >
          Deny
        </button>
        <button
          onClick={() => handleRespond(true, true)}
          className="cursor-pointer text-xs"
          style={{
            background: 'rgba(0, 122, 204, 0.1)',
            color: 'var(--vscode-charts-blue, #007acc)',
            border: '1px solid rgba(0, 122, 204, 0.3)',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 122, 204, 0.2)'
            e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.5)'
            e.currentTarget.style.transform = 'translateY(-1px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 122, 204, 0.1)'
            e.currentTarget.style.borderColor = 'rgba(0, 122, 204, 0.3)'
            e.currentTarget.style.transform = 'translateY(0)'
          }}
        >
          Always Allow
        </button>
        <button
          onClick={() => handleRespond(true)}
          className="cursor-pointer text-xs"
          style={{
            background: 'var(--vscode-button-background)',
            color: 'var(--vscode-button-foreground)',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 'var(--radius-sm)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-button-hoverBackground)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--vscode-button-background)' }}
        >
          Allow
        </button>
      </div>
    </div>
  )
}
