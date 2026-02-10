import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ComponentPropsWithoutRef } from 'react'
import { postMessage } from '../lib/vscode'

// Regex to detect file paths in text (Unix and Windows paths)
const FILE_PATH_REGEX = /(?:^|\s)([A-Za-z]:\\[\w\\.\-/]+|\/(?:[\w.\-]+\/)+[\w.\-]+(?::\d+)?)/g

interface Props {
  text: string
}

export function AssistantMessage({ text }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopyMessage = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="group max-w-[95%] message-bar-claude"
      style={{
        background: 'var(--chatui-glass-bg)',
        backdropFilter: 'blur(8px)',
        border: '1px solid var(--chatui-glass-border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        animation: 'fadeInUp 0.3s var(--ease-out-expo)',
      }}
    >
      {/* Message header */}
      <div
        className="flex items-center gap-2"
        style={{
          marginBottom: '8px',
          paddingBottom: '8px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: '20px',
            height: '20px',
            borderRadius: 'var(--radius-sm)',
            background: 'linear-gradient(135deg, #ff9500 0%, var(--chatui-accent) 100%)',
            fontSize: '10px',
            color: 'white',
            fontWeight: 600,
          }}
        >
          C
        </div>
        <span
          style={{
            fontWeight: 500,
            fontSize: '12px',
            opacity: 0.8,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}
        >
          Claude
        </span>
        <button
          onClick={handleCopyMessage}
          className="ml-auto opacity-0 group-hover:opacity-60 hover:opacity-100! cursor-pointer bg-transparent border-none text-inherit"
          style={{
            padding: '4px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '10px',
            transition: 'opacity 0.2s ease',
          }}
          title="Copy message"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      {/* Message content */}
      <div className="markdown-content text-sm leading-relaxed" style={{ paddingLeft: '8px' }}>
        <ReactMarkdown
          components={{
            code: CodeComponent,
            pre: ({ children }) => <>{children}</>,
            a: LinkComponent,
            p: ParagraphWithPaths,
          }}
        >
          {text}
        </ReactMarkdown>
      </div>
    </div>
  )
}

/** Intercept links - open external in browser, file paths in VS Code */
function LinkComponent({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!href) return

    if (href.startsWith('/') || /^[A-Za-z]:\\/.test(href)) {
      const cleanPath = href.replace(/:\d+$/, '')
      postMessage({ type: 'openFile', filePath: cleanPath })
    } else {
      postMessage({ type: 'openExternal', url: href })
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className="text-(--vscode-textLink-foreground) hover:underline cursor-pointer"
      {...props}
    >
      {children}
    </a>
  )
}

function ParagraphWithPaths({ children, ...props }: ComponentPropsWithoutRef<'p'>) {
  const processedChildren = processChildren(children)
  return <p {...props}>{processedChildren}</p>
}

function processChildren(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') {
    return linkifyFilePaths(children)
  }
  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        return <span key={i}>{linkifyFilePaths(child)}</span>
      }
      return child
    })
  }
  return children
}

function linkifyFilePaths(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  FILE_PATH_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
    const fullMatch = match[0]
    const path = match[1]
    const startIndex = match.index + (fullMatch.length - path.length)

    if (startIndex > lastIndex) {
      parts.push(text.substring(lastIndex, startIndex))
    }

    const cleanPath = path.replace(/:\d+$/, '')
    parts.push(
      <span
        key={startIndex}
        onClick={() => postMessage({ type: 'openFile', filePath: cleanPath })}
        className="text-(--vscode-textLink-foreground) hover:underline cursor-pointer"
        title={`Open ${cleanPath}`}
      >
        {path}
      </span>,
    )
    lastIndex = startIndex + path.length
  }

  if (lastIndex === 0) return text
  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex))
  }
  return parts
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="cursor-pointer border-none"
      style={{
        background: 'none',
        color: copied ? '#2ecc71' : 'var(--vscode-descriptionForeground)',
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        opacity: copied ? 1 : 0.7,
        fontSize: '11px',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--chatui-surface-2)'
        e.currentTarget.style.opacity = '1'
        if (!copied) e.currentTarget.style.color = 'var(--chatui-accent)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.opacity = copied ? '1' : '0.7'
        if (!copied) e.currentTarget.style.color = 'var(--vscode-descriptionForeground)'
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function CodeComponent({ className, children, ...props }: ComponentPropsWithoutRef<'code'>) {
  const match = /language-(\w+)/.exec(className || '')
  const code = String(children).replace(/\n$/, '')

  if (match) {
    return (
      <div
        className="my-2 overflow-hidden"
        style={{
          border: '1px solid var(--chatui-glass-border)',
          borderRadius: '8px',
          background: 'var(--vscode-textCodeBlock-background)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: '8px 12px',
            background: 'var(--chatui-surface-2)',
            borderBottom: '1px solid var(--chatui-glass-border)',
            fontSize: '11px',
          }}
        >
          <span
            style={{
              color: 'var(--chatui-accent)',
              fontFamily: 'var(--vscode-editor-font-family)',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              fontSize: '10px',
            }}
          >
            {match[1]}
          </span>
          <CopyButton text={code} />
        </div>
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={match[1]}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '12px',
            fontSize: '12px',
            background: 'var(--vscode-editor-background)',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    )
  }

  return (
    <code
      style={{
        background: 'var(--vscode-textCodeBlock-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: 'var(--radius-sm)',
        padding: '4px 4px',
        fontSize: '0.9em',
      }}
      {...props}
    >
      {children}
    </code>
  )
}
