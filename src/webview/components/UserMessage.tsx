import { useState } from 'react'

interface Props {
  text: string
  images?: string[]
}

export function UserMessage({ text, images }: Props) {
  const [copied, setCopied] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <>
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

          {/* Image thumbnails */}
          {images && images.length > 0 && (
            <div className="flex gap-2 flex-wrap" style={{ paddingLeft: '8px', marginBottom: text ? '8px' : 0 }}>
              {images.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`attachment ${idx + 1}`}
                  className="rounded cursor-pointer object-cover"
                  style={{
                    width: '80px',
                    height: '80px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    transition: 'opacity 0.15s ease',
                  }}
                  onClick={() => setPreviewSrc(src)}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                />
              ))}
            </div>
          )}

          {/* Message content */}
          {text && (
            <div className="text-sm whitespace-pre-wrap wrap-break-word" style={{ paddingLeft: '8px' }}>
              {text}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox overlay */}
      {previewSrc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0, 0, 0, 0.85)', cursor: 'zoom-out' }}
          onClick={() => setPreviewSrc(null)}
        >
          <img
            src={previewSrc}
            alt="preview"
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            }}
          />
        </div>
      )}
    </>
  )
}
