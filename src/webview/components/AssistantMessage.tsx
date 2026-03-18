import { useState, useMemo, useRef, useEffect, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'

// Allow safe layout HTML tags + style attributes, block dangerous ones (script, iframe, etc.)
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'div', 'span', 'section', 'article', 'header', 'footer', 'nav', 'aside', 'main',
    'details', 'summary', 'mark', 'abbr', 'kbd', 'sub', 'sup', 'dl', 'dt', 'dd',
    'figure', 'figcaption', 'time', 'data', 'ins', 'del',
  ],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'style', 'className', 'class', 'data-*'],
    'abbr': ['title'],
    'time': ['dateTime'],
    'data': ['value'],
    'ol': ['start', 'type', 'reversed'],
    'td': ['colSpan', 'rowSpan'],
    'th': ['colSpan', 'rowSpan', 'scope'],
  },
}
import { LazySyntaxHighlighter } from './LazySyntaxHighlighter'
import { CopyButton } from './CopyButton'
import type { ComponentPropsWithoutRef } from 'react'
import { postMessage } from '../hooks'

// Regex to detect file paths in text (Unix and Windows paths)
const FILE_PATH_REGEX = /(?:^|\s)([A-Za-z]:\\[\w\\.\-/]+|\/(?:[\w.\-]+\/)+[\w.\-]+(?::\d+)?)/g

// Unicode range: U+2500–U+257F (Box Drawing), U+2580–U+259F (Block Elements)
const BOX_DRAWING_REGEX = /[\u2500-\u257F\u2580-\u259F]/

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
  table: TableComponent,
  thead: TableHead,
  tbody: TableBody,
  tr: TableRow,
  th: TableHeaderCell,
  td: TableDataCell,
}

/**
 * Debounce markdown rendering during streaming — only re-render every 150ms
 * to avoid expensive markdown parsing on every character.
 */
function useDebouncedText(text: string, isStreaming: boolean, delayMs = 80): string {
  const [debouncedText, setDebouncedText] = useState(text)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!isStreaming) {
      // When not streaming, render immediately
      if (timerRef.current) clearTimeout(timerRef.current)
      setDebouncedText(text)
      return
    }
    // During streaming, debounce updates
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setDebouncedText(text), delayMs)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [text, isStreaming, delayMs])

  return debouncedText
}


/** Heuristic: message is artifact-worthy if it has markdown headers and is long enough */
function isArtifactWorthy(text: string): boolean {
  if (text.length < 300) return false
  const headerCount = (text.match(/^#{1,3}\s+/gm) || []).length
  return headerCount >= 2
}

export const AssistantMessage = memo(function AssistantMessage({ text, isStreaming = false }: Props) {
  const [copied, setCopied] = useState(false)
  const displayText = useDebouncedText(text, isStreaming)
  const showOpenAsDoc = !isStreaming && isArtifactWorthy(text)

  const handleOpenAsDoc = () => {
    // Extract title from first heading or use default
    const titleMatch = text.match(/^#\s+(.+)/m)
    const title = titleMatch ? titleMatch[1].slice(0, 40) : 'Claude Output'
    postMessage({ type: 'openMarkdownArtifact', content: text, title })
  }

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

  const renderedContent = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
      rehypePlugins={[rehypeRaw, rehypeKatex, [rehypeSanitize, sanitizeSchema]]}
      components={markdownComponents}
    >
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
        {renderedContent}
      </div>

      {/* Action bar — bottom of message, appears on hover */}
      <div className="msg-actions">
        {showOpenAsDoc && (
          <button
            onClick={handleOpenAsDoc}
            className="msg-action-btn"
            title="Open as document"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
              <line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            Doc
          </button>
        )}
        <button
          onClick={handleCopyMessage}
          className="msg-action-btn"
          data-active={copied || undefined}
          title="Copy message"
          aria-label={copied ? 'Copied' : 'Copy message'}
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
})

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

function ParagraphWithPaths({ children }: ComponentPropsWithoutRef<'p'>) {
  // Detect box-drawing characters — render as monospace pre block for proper alignment
  const textContent = extractText(children)
  if (BOX_DRAWING_REGEX.test(textContent)) {
    return (
      <pre
        style={{
          fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", "Fira Code", Consolas, monospace)',
          fontSize: '12px',
          lineHeight: 1.4,
          whiteSpace: 'pre',
          overflowX: 'auto',
          margin: '0.6em 0',
          padding: 0,
          background: 'transparent',
          border: 'none',
        }}
      >
        {children}
      </pre>
    )
  }
  const processedChildren = processChildren(children)
  return <p>{processedChildren}</p>
}

/** Extract plain text from React children for content detection */
function extractText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>
    return extractText(el.props.children)
  }
  return ''
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

// CopyButton imported from shared component

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
            padding: '5px 10px',
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
        <LazySyntaxHighlighter
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
        </LazySyntaxHighlighter>
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

// ============================================================================
// Table Components — CLI-quality table rendering
// ============================================================================

function TableComponent({ children, ...props }: ComponentPropsWithoutRef<'table'>) {
  return (
    <div className="md-table-wrapper">
      <table {...props} className="md-table">
        {children}
      </table>
    </div>
  )
}

function TableHead({ children, ...props }: ComponentPropsWithoutRef<'thead'>) {
  return <thead {...props} className="md-thead">{children}</thead>
}

function TableBody({ children, ...props }: ComponentPropsWithoutRef<'tbody'>) {
  return <tbody {...props} className="md-tbody">{children}</tbody>
}

function TableRow({ children, ...props }: ComponentPropsWithoutRef<'tr'>) {
  return <tr {...props} className="md-tr">{children}</tr>
}

function TableHeaderCell({ children, style, ...props }: ComponentPropsWithoutRef<'th'>) {
  return (
    <th {...props} className="md-th" style={style}>
      {children}
    </th>
  )
}

function TableDataCell({ children, style, ...props }: ComponentPropsWithoutRef<'td'>) {
  return (
    <td {...props} className="md-td" style={style}>
      {children}
    </td>
  )
}
