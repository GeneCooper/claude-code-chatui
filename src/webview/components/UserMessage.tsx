import { useState } from 'react'

interface Props {
  text: string
}

export function UserMessage({ text }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className="flex justify-end"
      style={{ animation: 'fadeInUp 0.3s var(--ease-out-expo)' }}
    >
      <div
        className="group relative max-w-[85%] message-bar-user"
        style={{
          background: 'linear-gradient(135deg, var(--chatui-accent-subtle) 0%, transparent 100%)',
          border: '1px solid rgba(237, 110, 29, 0.2)',
          borderRadius: 'var(--radius-md) var(--radius-md) var(--radius-md) var(--radius-sm)',
          padding: '10px 14px',
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
              background: 'linear-gradient(135deg, var(--chatui-accent) 0%, var(--chatui-accent-dark) 100%)',
              fontSize: '10px',
              color: 'white',
              fontWeight: 600,
            }}
          >
            U
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
            User
          </span>
          <button
            onClick={handleCopy}
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
        <div className="text-sm whitespace-pre-wrap wrap-break-word" style={{ paddingLeft: '8px' }}>
          {text}
        </div>
      </div>
    </div>
  )
}
