import { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { DiffView } from './DiffView'
import { postMessage } from '../hooks'
import { useSettingsStore } from '../store'
import { isPermissionError } from '../utils'
import { t } from '../i18n'

interface Props {
  data: Record<string, unknown>
}

function guessLanguage(toolName?: string, content?: string): string | undefined {
  if (!content) return undefined
  if (toolName === 'Bash') return 'bash'
  const trimmed = content.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try { JSON.parse(trimmed); return 'json' } catch { /* not JSON */ }
  }
  return undefined
}

export function ToolResultBlock({ data }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const isError = data.isError as boolean
  const rawContent = String(data.content || '')
  // Clean up XML-like tags from error messages (e.g. <tool_use_error>...</tool_use_error>)
  const content = isError
    ? rawContent.replace(/<\/?tool_use_error>/g, '').trim()
    : rawContent
  const toolName = data.toolName as string | undefined
  const rawInput = data.rawInput as Record<string, unknown> | undefined
  const fileContentBefore = data.fileContentBefore as string | undefined
  const fileContentAfter = data.fileContentAfter as string | undefined
  const filePath = rawInput?.file_path as string | undefined
  const startLine = data.startLine as number | undefined
  const startLines = data.startLines as number[] | undefined

  const hasDiff = fileContentBefore !== undefined && fileContentAfter !== undefined && filePath !== undefined
  const isLong = content.length > 300
  const displayContent = expanded ? content : content.substring(0, 300)
  const language = guessLanguage(toolName, content)

  const handleCopy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const showYoloHint = isError && isPermissionError(content) && !yoloMode

  return (
    <div
      className="overflow-hidden text-xs"
      style={{
        border: isError
          ? '1px solid rgba(231, 76, 60, 0.15)'
          : '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          padding: '6px 12px',
          background: 'var(--chatui-surface-1)',
        }}
      >
        <span style={{
          display: 'inline-block',
          width: '6px',
          height: '6px',
          borderRadius: '50%',
          background: isError ? '#e74c3c' : '#4ade80',
        }} />
        <span style={{ opacity: 0.6 }}>
          {toolName ? `${toolName} ${t('tool.result')}` : t('tool.result')}
        </span>
        {content && (
          <button
            onClick={handleCopy}
            className="opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
          >
            {copied ? t('message.copied') : t('message.copy')}
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
            {t('tool.openDiff')}
          </button>
        )}
      </div>

      {hasDiff && (
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <DiffView
            oldContent={fileContentBefore!}
            newContent={fileContentAfter!}
            filePath={filePath!}
            startLine={startLine}
            startLines={startLines}
          />
        </div>
      )}

      {showYoloHint && (
        <div
          className="flex items-center gap-2 text-[11px]"
          style={{
            padding: '6px 12px',
            paddingLeft: '12px',
            background: 'rgba(255, 149, 0, 0.08)',
            borderTop: '1px solid rgba(255, 149, 0, 0.2)',
            color: 'var(--vscode-editorWarning-foreground, #ff9500)',
          }}
        >
          <span style={{ opacity: 0.8 }}>{t('tool.yoloTip')}</span>
          <button
            onClick={() => postMessage({ type: 'updateSettings', settings: { yoloMode: true } })}
            className="cursor-pointer border-none text-[10px] font-medium"
            style={{
              marginLeft: 'auto',
              background: 'rgba(255, 149, 0, 0.15)',
              color: 'inherit',
              padding: '2px 8px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {t('tool.enableYolo')}
          </button>
        </div>
      )}

      {!hasDiff && content && content !== t('tool.success') && (
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          {language ? (
            <SyntaxHighlighter
              style={vscDarkPlus}
              language={language}
              PreTag="div"
              customStyle={{
                margin: 0,
                padding: '8px 12px',
                paddingLeft: '12px',
                fontSize: '11px',
                background: 'transparent',
                maxHeight: expanded ? 'none' : '200px',
                overflow: expanded ? 'visible' : 'auto',
              }}
            >
              {displayContent + (isLong && !expanded ? '...' : '')}
            </SyntaxHighlighter>
          ) : (
            <pre
              className="whitespace-pre-wrap font-mono text-[11px] opacity-70 m-0"
              style={{
                padding: '8px 12px',
                paddingLeft: '12px',
                maxHeight: expanded ? 'none' : '200px',
                overflow: expanded ? 'visible' : 'auto',
              }}
            >
              {displayContent}
              {isLong && !expanded && '...'}
            </pre>
          )}
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1 text-[10px] opacity-50 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit"
            >
              {expanded ? t('tool.showLess') : t('tool.showMore')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
