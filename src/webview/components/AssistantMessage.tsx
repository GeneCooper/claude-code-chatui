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
    <div className="group relative max-w-[95%] text-sm leading-relaxed">
      <button
        onClick={handleCopyMessage}
        className="absolute right-0 top-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 cursor-pointer bg-transparent border-none text-inherit text-[10px] px-1 py-0.5 transition-opacity"
        title="Copy message"
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
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
  )
}

/** Intercept links - open external in browser, file paths in VS Code */
function LinkComponent({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    if (!href) return

    // File paths -> open in VS Code
    if (href.startsWith('/') || /^[A-Za-z]:\\/.test(href)) {
      const cleanPath = href.replace(/:\d+$/, '')
      postMessage({ type: 'openFile', filePath: cleanPath })
    } else {
      // External links -> open in default browser via VS Code API
      postMessage({ type: 'openExternal', url: href })
    }
  }

  return (
    <a
      href={href}
      onClick={handleClick}
      className="text-[var(--vscode-textLink-foreground)] hover:underline cursor-pointer"
      {...props}
    >
      {children}
    </a>
  )
}

/** Paragraph that detects and linkifies file paths in plain text */
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

/** Convert file path strings into clickable elements */
function linkifyFilePaths(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  let lastIndex = 0

  // Reset regex
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
        className="text-[var(--vscode-textLink-foreground)] hover:underline cursor-pointer"
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
      className="hover:opacity-100 opacity-60 cursor-pointer bg-transparent border-none text-inherit text-[10px]"
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
      <div className="my-2 rounded-md overflow-hidden border border-[var(--vscode-panel-border)]">
        <div className="flex items-center justify-between px-3 py-1 bg-[var(--vscode-sideBar-background)] text-[10px] opacity-60">
          <span>{match[1]}</span>
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
      className="px-1 py-0.5 rounded bg-[var(--vscode-textCodeBlock-background)] text-[0.9em] font-mono"
      {...props}
    >
      {children}
    </code>
  )
}
