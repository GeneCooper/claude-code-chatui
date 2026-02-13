import { useState, useMemo, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { ComponentPropsWithoutRef } from 'react'
import { postMessage } from '../hooks'

// Regex to detect file paths in text (Unix and Windows paths)
const FILE_PATH_REGEX = /(?:^|\s)([A-Za-z]:\\[\w\\.\-/]+|\/(?:[\w.\-]+\/)+[\w.\-]+(?::\d+)?)/g

interface Props {
  text: string
  timestamp?: string
  isStreaming?: boolean
}

// Stable reference for markdown components — avoids re-creating on each render
const markdownComponents = {
  code: CodeComponent,
  pre: ({ children }: ComponentPropsWithoutRef<'pre'>) => <>{children}</>,
  a: LinkComponent,
  p: ParagraphWithPaths,
  table: ({ children, ...props }: ComponentPropsWithoutRef<'table'>) => (
    <div style={{ overflowX: 'auto', margin: '8px 0' }}>
      <table
        {...props}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '12px',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: '6px',
        }}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }: ComponentPropsWithoutRef<'th'>) => (
    <th
      {...props}
      style={{
        padding: '6px 10px',
        textAlign: 'left',
        fontWeight: 600,
        borderBottom: '1px solid var(--vscode-panel-border)',
        background: 'rgba(128, 128, 128, 0.1)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children, ...props }: ComponentPropsWithoutRef<'td'>) => (
    <td
      {...props}
      style={{
        padding: '5px 10px',
        borderBottom: '1px solid rgba(128, 128, 128, 0.1)',
      }}
    >
      {children}
    </td>
  ),
}

/**
 * Hook to progressively reveal text for a streaming effect.
 * On first mount or when new text is appended, reveals content character-by-character
 * at a fast rate to simulate streaming output.
 */
function useStreamingText(fullText: string, isStreaming: boolean) {
  const [displayText, setDisplayText] = useState(isStreaming ? '' : fullText)
  const prevTextRef = useRef(fullText)
  const revealedRef = useRef(isStreaming ? 0 : fullText.length)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    if (!isStreaming) {
      setDisplayText(fullText)
      revealedRef.current = fullText.length
      prevTextRef.current = fullText
      return
    }

    // If text grew (new content appended), keep revealed portion and stream the rest
    const prevLen = prevTextRef.current.length
    if (fullText.length > prevLen && fullText.startsWith(prevTextRef.current)) {
      // Previous text is a prefix — keep the revealed count
    } else {
      // Text changed entirely — reset
      revealedRef.current = 0
    }
    prevTextRef.current = fullText

    if (revealedRef.current >= fullText.length) {
      setDisplayText(fullText)
      return
    }

    // Streaming reveal — ~30 chars per frame at 60fps = ~1800 chars/sec
    const CHARS_PER_FRAME = 30

    const reveal = () => {
      revealedRef.current = Math.min(revealedRef.current + CHARS_PER_FRAME, fullText.length)
      // Snap to next word boundary to avoid cutting mid-word
      if (revealedRef.current < fullText.length) {
        const nextSpace = fullText.indexOf(' ', revealedRef.current)
        if (nextSpace !== -1 && nextSpace - revealedRef.current < 20) {
          revealedRef.current = nextSpace + 1
        }
      }
      setDisplayText(fullText.substring(0, revealedRef.current))
      if (revealedRef.current < fullText.length) {
        rafRef.current = requestAnimationFrame(reveal)
      }
    }

    rafRef.current = requestAnimationFrame(reveal)
    return () => cancelAnimationFrame(rafRef.current)
  }, [fullText, isStreaming])

  return displayText
}

export function AssistantMessage({ text, isStreaming = false }: Props) {
  const [copied, setCopied] = useState(false)
  const displayText = useStreamingText(text, isStreaming)

  const handleCopyMessage = () => {
    // Normalize soft line breaks within paragraphs so copy produces continuous text,
    // while preserving intentional double-newline paragraph breaks and code blocks.
    const normalized = text.replace(/```[\s\S]*?```/g, (m) => m) // keep code blocks as-is (handled below)
    const parts = normalized.split(/(```[\s\S]*?```)/)
    const result = parts.map((part) => {
      if (part.startsWith('```')) return part // code block — preserve
      // Collapse single newlines (soft wraps) into spaces, keep double newlines (paragraph breaks)
      return part.replace(/([^\n])\n(?!\n)/g, '$1 ')
    }).join('')
    navigator.clipboard.writeText(result)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Memoize markdown rendering — only re-parse when displayText actually changes
  const renderedMarkdown = useMemo(() => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {displayText}
    </ReactMarkdown>
  ), [displayText])

  return (
    <div
      className="group max-w-[95%]"
      style={{ padding: '4px 0' }}
    >
      {/* Message content */}
      <div className="markdown-content text-sm leading-relaxed">
        {renderedMarkdown}
      </div>

      {/* Copy button - appears at bottom-right on hover */}
      <div className="flex justify-end opacity-0 group-hover:opacity-100" style={{ transition: 'opacity 0.2s ease', marginTop: '2px' }}>
        <button
          onClick={handleCopyMessage}
          className="cursor-pointer bg-transparent border-none flex items-center gap-1"
          style={{
            padding: '2px 8px',
            borderRadius: '4px',
            fontSize: '11px',
            color: copied ? '#4ade80' : 'var(--vscode-descriptionForeground)',
            opacity: copied ? 1 : 0.6,
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = copied ? '1' : '0.6' }}
          title="Copy message"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {copied ? 'Copied!' : 'Copy'}
        </button>
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

// Simple LRU-ish cache for linkifyFilePaths to avoid re-running regex on same text
const linkifyCache = new Map<string, React.ReactNode>()
const LINKIFY_CACHE_MAX = 200

function linkifyFilePaths(text: string): React.ReactNode {
  const cached = linkifyCache.get(text)
  if (cached !== undefined) return cached

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

  let result: React.ReactNode
  if (lastIndex === 0) {
    result = text
  } else {
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }
    result = parts
  }
  // Store in cache, evict oldest entries if too large
  if (linkifyCache.size >= LINKIFY_CACHE_MAX) {
    const firstKey = linkifyCache.keys().next().value
    if (firstKey !== undefined) linkifyCache.delete(firstKey)
  }
  linkifyCache.set(text, result)
  return result
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
        color: copied ? '#4ade80' : 'var(--vscode-descriptionForeground)',
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
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'none'
        e.currentTarget.style.opacity = copied ? '1' : '0.7'
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
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '8px',
          background: 'var(--vscode-textCodeBlock-background)',
        }}
      >
        <div
          className="flex items-center justify-between"
          style={{
            padding: '8px 12px',
            background: 'var(--chatui-surface-2)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
            fontSize: '11px',
          }}
        >
          <span
            style={{
              color: 'rgba(255, 255, 255, 0.5)',
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
        border: '1px solid rgba(255, 255, 255, 0.06)',
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
