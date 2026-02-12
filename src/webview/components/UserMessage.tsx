import { useState, useRef, useEffect } from 'react'

interface Props {
  text: string
  images?: string[]
  onEdit?: (newText: string) => void
  isProcessing?: boolean
}

export function UserMessage({ text, images, onEdit, isProcessing }: Props) {
  const [copied, setCopied] = useState(false)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editText, setEditText] = useState(text)
  const editRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus()
      editRef.current.setSelectionRange(editRef.current.value.length, editRef.current.value.length)
    }
  }, [isEditing])

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const handleEditSave = () => {
    const trimmed = editText.trim()
    if (trimmed && trimmed !== text && onEdit) {
      onEdit(trimmed)
    }
    setIsEditing(false)
  }

  const handleEditCancel = () => {
    setEditText(text)
    setIsEditing(false)
  }

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleEditSave()
    } else if (e.key === 'Escape') {
      handleEditCancel()
    }
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
            borderRadius: '18px',
            padding: '10px 16px',
          }}
        >
          {/* Action bar - appears above bubble on hover */}
          {!isEditing && (
            <div
              className="absolute -top-7 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100"
              style={{
                transition: 'opacity 0.15s ease',
                pointerEvents: 'auto',
              }}
            >
              {onEdit && !isProcessing && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditText(text); setIsEditing(true) }}
                  className="checkpoint-action-btn"
                  title="Edit message"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
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
          )}

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

          {/* Message content or edit mode */}
          {isEditing ? (
            <div>
              <textarea
                ref={editRef}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={handleEditKeyDown}
                className="w-full resize-none border-none focus:outline-none text-sm"
                style={{
                  background: 'transparent',
                  color: 'var(--vscode-input-foreground)',
                  fontFamily: 'var(--vscode-editor-font-family)',
                  minHeight: '40px',
                  lineHeight: 1.4,
                  padding: 0,
                }}
                rows={Math.min(editText.split('\n').length + 1, 10)}
              />
              <div className="flex justify-end gap-1 mt-1">
                <button
                  onClick={handleEditCancel}
                  className="cursor-pointer border-none text-xs"
                  style={{
                    padding: '2px 8px', borderRadius: '6px',
                    background: 'rgba(255,255,255,0.08)', color: 'inherit', opacity: 0.7,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="cursor-pointer border-none text-xs"
                  style={{
                    padding: '2px 8px', borderRadius: '6px',
                    background: 'var(--chatui-accent)', color: '#fff',
                  }}
                >
                  Save &amp; Send
                </button>
              </div>
            </div>
          ) : (
            text && (
              <div className="text-sm whitespace-pre-wrap wrap-break-word">
                {text}
              </div>
            )
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
