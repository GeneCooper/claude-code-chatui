import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { DiffView } from './DiffView'
import { postMessage } from '../lib/vscode'

interface Props {
  data: Record<string, unknown>
}

/** Guess a syntax language from tool name and content */
function guessLanguage(toolName?: string, content?: string): string | undefined {
  if (!content) return undefined

  if (toolName === 'Bash') return 'bash'

  // Try to detect JSON
  const trimmed = content.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return 'json' } catch { /* not JSON */ }
  }

  // File content from Read tool - guess from extension in content or tool input
  if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') return undefined

  return undefined
}

export function ToolResultBlock({ data }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const isError = data.isError as boolean
  const content = String(data.content || '')
  const toolName = data.toolName as string | undefined
  const rawInput = data.rawInput as Record<string, unknown> | undefined
  const fileContentBefore = data.fileContentBefore as string | undefined
  const fileContentAfter = data.fileContentAfter as string | undefined
  const filePath = rawInput?.file_path as string | undefined
  const startLine = data.startLine as number | undefined
  const startLines = data.startLines as number[] | undefined

  const hasDiff =
    fileContentBefore !== undefined &&
    fileContentAfter !== undefined &&
    filePath !== undefined

  // Truncate long content
  const isLong = content.length > 300
  const displayContent = expanded ? content : content.substring(0, 300)
  const language = guessLanguage(toolName, content)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

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
        {content && (
          <button
            onClick={handleCopy}
            className="opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        )}
        {hasDiff && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              postMessage({
                type: 'openDiff',
                oldContent: fileContentBefore,
                newContent: fileContentAfter,
                filePath: filePath,
              })
            }}
            className="ml-auto opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
          >
            Open Diff
          </button>
        )}
      </div>

      {hasDiff && (
        <div className="border-t border-[var(--vscode-panel-border)]">
          <DiffView
            oldContent={fileContentBefore!}
            newContent={fileContentAfter!}
            filePath={filePath!}
            startLine={startLine}
            startLines={startLines}
          />
        </div>
      )}

      {!hasDiff && content && content !== 'Tool executed successfully' && (
        <div className="border-t border-[var(--vscode-panel-border)]">
          {language ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={language}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: '8px 12px',
                fontSize: '11px',
                background: 'transparent',
                maxHeight: expanded ? 'none' : '200px',
                overflow: expanded ? 'visible' : 'auto',
              }}
            >
              {displayContent + (isLong && !expanded ? '...' : '')}
            </SyntaxHighlighter>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[11px] opacity-70 m-0 px-3 py-2" style={{ maxHeight: expanded ? 'none' : '200px', overflow: expanded ? 'visible' : 'auto' }}>
              {displayContent}
              {isLong && !expanded && '...'}
            </pre>
          )}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1 text-[10px] opacity-50 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
