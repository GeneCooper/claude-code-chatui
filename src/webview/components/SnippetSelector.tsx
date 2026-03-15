import { useState, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import { useSnippetStore, type CustomSnippet } from '../store'
import { postMessage } from '../hooks'
import { PROMPT_SNIPPET_PRESETS } from '../../shared/constants'

// Persist snippet state to extension settings
function persistSnippetState() {
  const { selectedIds, customSnippets } = useSnippetStore.getState()
  postMessage({ type: 'updateSettings', settings: { selectedSnippetIds: selectedIds, customSnippets } })
}

/** Compact button shown in InputArea toolbar */
export const SnippetButton = memo(function SnippetButton({ onClick }: { onClick: () => void }) {
  const selectedIds = useSnippetStore((s) => s.selectedIds)
  const count = selectedIds.length

  return (
    <button
      onClick={onClick}
      className="cursor-pointer border-none flex items-center gap-1"
      style={{
        background: 'transparent',
        padding: '2px 4px',
        fontWeight: 500,
        opacity: count > 0 ? 1 : 0.5,
        color: count > 0 ? '#a78bfa' : 'inherit',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      title="Prompt snippets — attach reusable prompts to messages"
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = count > 0 ? '1' : '0.5' }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
      <span>Snippets</span>
      {count > 0 && (
        <span style={{
          background: '#a78bfa',
          color: '#fff',
          fontSize: '9px',
          fontWeight: 700,
          borderRadius: '6px',
          padding: '0 4px',
          lineHeight: '14px',
          minWidth: '14px',
          textAlign: 'center',
        }}>{count}</span>
      )}
    </button>
  )
})

/** Tooltip component for showing full snippet prompt on hover */
const SnippetTooltip = memo(function SnippetTooltip({ text, anchorRect }: { text: string; anchorRect: DOMRect | null }) {
  if (!anchorRect) return null

  // Position tooltip to the right of the item, or left if not enough space
  const tooltipWidth = 280
  const viewportWidth = window.innerWidth
  const showOnRight = anchorRect.right + tooltipWidth + 12 < viewportWidth
  const left = showOnRight ? anchorRect.right + 8 : anchorRect.left - tooltipWidth - 8
  const top = Math.min(anchorRect.top, window.innerHeight - 160)

  return createPortal(
    <div style={{
      position: 'fixed',
      left: `${left}px`,
      top: `${top}px`,
      width: `${tooltipWidth}px`,
      maxHeight: '200px',
      overflowY: 'auto',
      padding: '10px 12px',
      background: 'var(--vscode-editorHoverWidget-background, #1e1e2e)',
      border: '1px solid var(--vscode-editorHoverWidget-border, var(--vscode-panel-border))',
      borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      fontSize: '11px',
      lineHeight: '1.5',
      opacity: 0.95,
      zIndex: 1100,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      pointerEvents: 'none',
    }}>
      {text}
    </div>,
    document.body
  )
})

/** Dropdown panel for selecting/managing snippets */
export const SnippetDropdown = memo(function SnippetDropdown({ onClose }: { onClose: () => void }) {
  const selectedIds = useSnippetStore((s) => s.selectedIds)
  const customSnippets = useSnippetStore((s) => s.customSnippets)
  const toggleSnippet = useSnippetStore((s) => s.toggleSnippet)
  const addCustomSnippet = useSnippetStore((s) => s.addCustomSnippet)
  const removeCustomSnippet = useSnippetStore((s) => s.removeCustomSnippet)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [hoveredSnippet, setHoveredSnippet] = useState<{ text: string; rect: DOMRect } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // Cleanup hover timer on unmount
  useEffect(() => {
    return () => { if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current) }
  }, [])

  const handleToggle = (id: string) => {
    toggleSnippet(id)
    setTimeout(persistSnippetState, 0)
  }

  const handleAdd = () => {
    const name = newName.trim()
    const prompt = newPrompt.trim()
    if (!name || !prompt) return
    const id = `custom-${Date.now().toString(36)}`
    const colors = ['#6366f1', '#14b8a6', '#f43f5e', '#eab308', '#0ea5e9', '#d946ef']
    const color = colors[customSnippets.length % colors.length]
    addCustomSnippet({ id, name, prompt, color })
    setNewName('')
    setNewPrompt('')
    setShowAddForm(false)
    setTimeout(persistSnippetState, 0)
  }

  const handleRemove = (id: string) => {
    removeCustomSnippet(id)
    setTimeout(persistSnippetState, 0)
  }

  const handleSnippetMouseEnter = (prompt: string, e: React.MouseEvent<HTMLDivElement>) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    hoverTimerRef.current = setTimeout(() => {
      setHoveredSnippet({ text: prompt, rect })
    }, 400)
  }

  const handleSnippetMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setHoveredSnippet(null)
  }

  const allSnippets: Array<{ id: string; name: string; prompt: string; color: string; isBuiltIn: boolean }> = [
    ...PROMPT_SNIPPET_PRESETS.map((s) => ({ ...s, isBuiltIn: true })),
    ...customSnippets.map((s) => ({ ...s, isBuiltIn: false })),
  ]

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
    <div
      ref={dropdownRef}
      style={{
        width: '420px',
        maxHeight: '70vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--vscode-editorWidget-background, var(--vscode-input-background))',
        border: '1px solid var(--vscode-editorWidget-border, var(--vscode-panel-border))',
        borderRadius: '12px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}
    >
      {/* Fixed Header */}
      <div style={{
        padding: '12px 16px',
        fontSize: '13px',
        fontWeight: 600,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--vscode-panel-border)',
        flexShrink: 0,
      }}>
        <span style={{ opacity: 0.8, textTransform: 'uppercase' as const, letterSpacing: '0.5px', fontSize: '11px' }}>Prompt Snippets</span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'inherit',
            opacity: 0.5,
            fontSize: '16px',
            lineHeight: 1,
            padding: '2px 4px',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
        >
          ✕
        </button>
      </div>

      {/* Scrollable Snippet list */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '4px 0',
        minHeight: 0,
      }}>
        {allSnippets.map((snippet) => {
          const isSelected = selectedIds.includes(snippet.id)
          return (
            <div
              key={snippet.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                padding: '6px 12px',
                cursor: 'pointer',
                background: isSelected ? 'rgba(167, 139, 250, 0.08)' : 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                handleSnippetMouseEnter(snippet.prompt, e)
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isSelected ? 'rgba(167, 139, 250, 0.08)' : 'transparent'
                handleSnippetMouseLeave()
              }}
              onClick={() => handleToggle(snippet.id)}
            >
              {/* Checkbox */}
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '3px',
                border: isSelected ? 'none' : '1.5px solid rgba(255,255,255,0.25)',
                background: isSelected ? snippet.color : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginRight: '8px',
                marginTop: '1px',
                transition: 'all 0.15s',
              }}>
                {isSelected && (
                  <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.5 8.5l3 3 6-7" />
                  </svg>
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: snippet.color,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: '12px', fontWeight: 500 }}>{snippet.name}</span>
                  {!snippet.isBuiltIn && (
                    <span style={{ fontSize: '9px', opacity: 0.4, fontStyle: 'italic' }}>custom</span>
                  )}
                </div>
                <div style={{
                  fontSize: '10px',
                  opacity: 0.5,
                  marginTop: '2px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '100%',
                }}>
                  {snippet.prompt}
                </div>
              </div>

              {/* Delete button for custom snippets */}
              {!snippet.isBuiltIn && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemove(snippet.id) }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    opacity: 0.3,
                    padding: '2px 4px',
                    fontSize: '14px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="Delete snippet"
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.color = '#ef4444' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.3'; e.currentTarget.style.color = 'inherit' }}
                >
                  ×
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Fixed Bottom - Add custom button / form */}
      <div style={{
        borderTop: '1px solid var(--vscode-panel-border)',
        flexShrink: 0,
      }}>
        {!showAddForm ? (
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              padding: '10px 12px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--chatui-accent, #a78bfa)',
              fontSize: '11px',
              fontWeight: 500,
              textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
            Add custom snippet
          </button>
        ) : (
          <div style={{ padding: '8px 12px' }}>
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (e.g. API reviewer)"
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '11px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                borderRadius: '4px',
                outline: 'none',
                marginBottom: '4px',
                boxSizing: 'border-box',
              }}
            />
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Prompt content..."
              rows={3}
              style={{
                width: '100%',
                padding: '4px 8px',
                fontSize: '11px',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
                borderRadius: '4px',
                outline: 'none',
                resize: 'vertical',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowAddForm(false); setNewName(''); setNewPrompt('') }}
                style={{
                  padding: '3px 10px',
                  fontSize: '11px',
                  background: 'none',
                  border: '1px solid var(--vscode-panel-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  color: 'inherit',
                  opacity: 0.7,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                disabled={!newName.trim() || !newPrompt.trim()}
                style={{
                  padding: '3px 10px',
                  fontSize: '11px',
                  background: newName.trim() && newPrompt.trim() ? 'var(--chatui-accent, #a78bfa)' : 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: newName.trim() && newPrompt.trim() ? 'pointer' : 'not-allowed',
                  color: '#fff',
                  fontWeight: 500,
                }}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* Hover tooltip for full prompt */}
    <SnippetTooltip text={hoveredSnippet?.text ?? ''} anchorRect={hoveredSnippet?.rect ?? null} />
    </div>
  )
})
