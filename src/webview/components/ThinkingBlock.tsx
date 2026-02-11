import { useState } from 'react'
import { t } from '../i18n'

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
      className="overflow-hidden"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: 'var(--radius-md)',
        animation: 'fadeIn 0.15s ease',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left cursor-pointer border-none text-inherit"
        style={{
          padding: '8px 12px',
          background: 'var(--chatui-surface-1)',
          fontSize: '12px',
          opacity: 0.7,
        }}
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`} style={{ fontSize: '10px' }}>&#9654;</span>
        <span style={{ fontStyle: 'italic' }}>{t('thinking.label')}</span>
        <span className="ml-auto text-[10px] opacity-50">
          {text.length > 100 ? `${Math.ceil(text.length / 4)} words` : ''}
        </span>
      </button>
      {expanded && (
        <div className="relative" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <button
            onClick={handleCopy}
            className="absolute right-2 top-1 opacity-40 hover:opacity-80 cursor-pointer bg-transparent border-none text-inherit text-[10px] z-10"
          >
            {copied ? t('message.copied') : t('message.copy')}
          </button>
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
}
