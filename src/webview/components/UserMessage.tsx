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
          className="group relative max-w-[85%]"
          style={{
            background: 'var(--chatui-user-bubble)',
            borderRadius: '18px',
            padding: '10px 16px',
          }}
        >
          {/* Copy button - appears above on hover */}
          <button
            onClick={handleCopy}
            className="absolute -top-6 right-0 opacity-0 group-hover:opacity-60 hover:opacity-100! cursor-pointer bg-transparent border-none"
            style={{
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '11px',
              transition: 'opacity 0.2s ease',
              color: 'var(--vscode-descriptionForeground)',
            }}
            title="Copy message"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>

          {/* Image thumbnails */}
          {images && images.length > 0 && (
            <div className="flex gap-2 flex-wrap" style={{ marginBottom: text ? '8px' : 0 }}>
              {images.map((src, idx) => (
                <img
                  key={idx}
                  src={src}
                  alt={`attachment ${idx + 1}`}
                  className="rounded cursor-pointer object-cover"
                  style={{
                    width: '80px',
                    height: '80px',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
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
            <div className="text-sm whitespace-pre-wrap wrap-break-word">
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
