import { useState } from 'react'

interface Props {
  text: string
}

export function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="message-bar-thinking overflow-hidden"
      style={{
        border: '1px solid rgba(186, 85, 211, 0.2)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeInUp 0.3s var(--ease-out-expo)',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer border-none text-inherit"
        style={{
          padding: '8px 12px',
          paddingLeft: '16px',
          background: 'var(--chatui-surface-1)',
          fontSize: '12px',
          opacity: 0.9,
          fontStyle: 'italic',
        }}
      >
        {/* Thinking icon */}
        <div
          className="flex items-center justify-center shrink-0"
          style={{
            width: '18px',
            height: '18px',
            borderRadius: '4px',
            background: 'linear-gradient(180deg, #ba55d3 0%, #9932cc 100%)',
            fontSize: '10px',
            color: 'white',
            fontWeight: 600,
            fontStyle: 'normal',
          }}
        >
          ?
        </div>
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>&#9654;</span>
        <span>Thinking...</span>
        <span className="ml-auto text-[10px] opacity-50" style={{ fontStyle: 'normal' }}>
          {text.length > 100 ? `${Math.ceil(text.length / 4)} words` : ''}
        </span>
      </button>
      {expanded && (
        <div className="relative" style={{ borderTop: '1px solid rgba(186, 85, 211, 0.15)' }}>
          <button
            onClick={handleCopy}
            className="absolute right-2 top-1 opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px] z-10"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <div
            className="text-xs whitespace-pre-wrap max-h-60 overflow-y-auto"
            style={{
              padding: '8px 12px',
              paddingLeft: '16px',
              opacity: 0.9,
              fontStyle: 'italic',
            }}
          >
            {text}
          </div>
        </div>
      )}
    </div>
  )
}
