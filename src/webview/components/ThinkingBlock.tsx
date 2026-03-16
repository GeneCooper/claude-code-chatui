import { useState, useMemo, memo } from 'react'

interface Props {
  text: string
}

export const ThinkingBlock = memo(function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  // Preview: first 3 lines
  const preview = useMemo(() => {
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length <= 3) return null
    return lines.slice(0, 3).join('\n')
  }, [text])

  const wordCount = text.length > 100 ? `${Math.ceil(text.length / 4)} words` : ''

  return (
    <div
      className="group z-10 overflow-hidden"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse thinking' : 'Expand thinking'}
        className="flex items-center gap-2 w-full text-left cursor-pointer border-none text-inherit"
        style={{
          padding: '5px 10px',
          background: 'var(--chatui-surface-1)',
          fontSize: '11px',
          opacity: 0.7,
        }}
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`} style={{ fontSize: '10px' }}>&#9654;</span>
        <span style={{ fontStyle: 'italic' }}>Thinking...</span>
        <span className="ml-auto flex items-center gap-2">
          {wordCount && <span className="text-[10px] opacity-50">{wordCount}</span>}
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleCopy() }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); handleCopy() } }}
            className="text-[10px] opacity-0 group-hover:opacity-60 hover:opacity-100! cursor-pointer"
            style={{ transition: 'opacity 0.15s ease', color: copied ? '#4ade80' : 'inherit' }}
          >
            {copied ? '✓' : '⎘'}
          </span>
        </span>
      </button>

      {/* Preview (when collapsed and text is long enough) */}
      {!expanded && preview && (
        <div
          className="text-xs whitespace-pre-wrap cursor-pointer"
          style={{
            padding: '6px 12px',
            opacity: 0.4,
            fontStyle: 'italic',
            maxHeight: '60px',
            overflow: 'hidden',
            borderTop: '1px solid rgba(255, 255, 255, 0.04)',
          }}
          onClick={() => setExpanded(true)}
        >
          {preview}...
        </div>
      )}

      {/* Full content */}
      {expanded && (
        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <div
            className="text-xs whitespace-pre-wrap max-h-60 overflow-y-auto"
            style={{
              padding: '8px 12px',
              opacity: 0.7,
              fontStyle: 'italic',
            }}
          >
            {text}
          </div>
        </div>
      )}
    </div>
  )
})
