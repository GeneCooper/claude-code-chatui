import { useState, memo } from 'react'

interface Props {
  text: string
  images?: string[]
  onFork?: () => void
  onRewind?: () => void
  isProcessing?: boolean
}

export const UserMessage = memo(function UserMessage({ text, images, onFork, onRewind, isProcessing }: Props) {
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
        style={{ animation: 'fadeIn 0.15s ease' }}
      >
        <div
          className="group relative max-w-[85%]"
          style={{
            background: 'var(--chatui-user-bubble)',
            borderRadius: '16px',
            padding: '8px 14px',
          }}
        >
          {/* Action bar - appears above bubble on hover */}
          <div
            className="absolute -top-7 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100"
            style={{
              transition: 'opacity 0.15s ease',
              pointerEvents: 'auto',
            }}
          >
            {onFork && !isProcessing && (
              <button
                onClick={(e) => { e.stopPropagation(); onFork() }}
                className="checkpoint-action-btn"
                title="Fork from here"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="3" x2="6" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
              </button>
            )}
            {onRewind && !isProcessing && (
              <button
                onClick={(e) => { e.stopPropagation(); onRewind() }}
                className="checkpoint-action-btn"
                title="Rewind to here"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); handleCopy() }}
              className="checkpoint-action-btn"
              title="Copy message"
            >
              {copied ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>

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
})
