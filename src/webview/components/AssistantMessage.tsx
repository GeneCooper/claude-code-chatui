import { useState, useMemo, useRef, useEffect, memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { LazySyntaxHighlighter } from './LazySyntaxHighlighter'
import { CopyButton } from './CopyButton'
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
          minWidth: '100%',
          width: 'max-content',
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
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  ),
}

/**
 * Debounce markdown rendering during streaming — only re-render every 150ms
 * to avoid expensive markdown parsing on every character.
 */
function useDebouncedText(text: string, isStreaming: boolean, delayMs = 150): string {
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

/**
 * Detect tree-like structures (using box-drawing chars or ASCII pipes with ├──/└──)
 * that remarkGfm would misinterpret as tables, and wrap them in fenced code blocks.
 */
function escapeTreeStructures(md: string): string {
  // Split into code-fenced vs non-code sections to avoid double-wrapping
  const parts = md.split(/(```[\s\S]*?```)/g)
  return parts.map((part) => {
    if (part.startsWith('```')) return part // already a code block
    // Match consecutive lines that look like tree output:
    // lines containing box-drawing chars (│├└─┌┐┘┤┬┴┼) or ASCII tree patterns (|  ├── etc.)
    return part.replace(
      /(?:^|\n)((?:[ \t]*[│├└┌┐┘┤┬┴┼─|].*\n?){2,})/g,
      (match, treeBlock: string) => {
        // Only wrap if the block contains actual tree connectors (├── or └──)
        if (/[├└┌┐┘┤┬┴┼]/.test(treeBlock) || /\|[\s]*[├└]/.test(treeBlock)) {
          const trimmed = treeBlock.replace(/\n$/, '')
          return match.replace(treeBlock, `\`\`\`\n${trimmed}\n\`\`\`\n`)
        }
        return match
      },
    )
  }).join('')
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

  // Memoize tree-structure escaping separately, then markdown rendering
  const escapedText = useMemo(() => escapeTreeStructures(displayText), [displayText])
  const renderedMarkdown = useMemo(() => (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {escapedText}
    </ReactMarkdown>
  ), [escapedText])

  return (
    <div
      className="group relative max-w-[95%]"
      style={{ padding: '4px 0' }}
    >
      {/* Message content */}
      <div className="markdown-content text-sm leading-relaxed">
        {renderedMarkdown}
      </div>

      {/* Action buttons - appear above message on hover */}
      <div className="absolute -top-7 right-0 opacity-0 group-hover:opacity-100 flex items-center gap-1" style={{ transition: 'opacity 0.2s ease' }}>
        {showOpenAsDoc && (
          <button
            onClick={handleOpenAsDoc}
            className="cursor-pointer bg-transparent border-none flex items-center gap-1"
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '11px',
              color: 'var(--vscode-descriptionForeground)',
              opacity: 0.6,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
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
