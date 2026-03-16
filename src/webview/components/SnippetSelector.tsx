import { useState, useRef, useEffect, memo, useMemo, useCallback } from 'react'
import { useSnippetStore, type CustomSnippet } from '../store'
import { postMessage } from '../hooks'
import { PROMPT_SNIPPET_PRESETS } from '../../shared/constants'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function persistSnippetState() {
  const { selectedIds, customSnippets, snippetMode } = useSnippetStore.getState()
  postMessage({ type: 'updateSettings', settings: { selectedSnippetIds: selectedIds, customSnippets, snippetMode } })
}

/** Inject a <style> block once for keyframes & scrollbar */
let styleInjected = false
function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes snippetFadeIn {
      from { opacity: 0; transform: scale(0.96) translateY(8px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes snippetOverlayIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes snippetCardIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes snippetPulse {
      0%, 100% { box-shadow: 0 0 0 0 var(--pulse-color, rgba(167,139,250,0.4)); }
      50%      { box-shadow: 0 0 0 4px var(--pulse-color, rgba(167,139,250,0)); }
    }
    .snippet-scroll::-webkit-scrollbar { width: 5px; }
    .snippet-scroll::-webkit-scrollbar-track { background: transparent; }
    .snippet-scroll::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,0.08);
      border-radius: 4px;
    }
    .snippet-scroll::-webkit-scrollbar-thumb:hover {
      background: rgba(255,255,255,0.15);
    }
  `
  document.head.appendChild(style)
}

function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `${r},${g},${b}`
}

// ---------------------------------------------------------------------------
// SnippetButton — toolbar trigger
// ---------------------------------------------------------------------------

export const SnippetButton = memo(function SnippetButton({ onClick }: { onClick: () => void }) {
  const selectedIds = useSnippetStore((s) => s.selectedIds)
  const customSnippets = useSnippetStore((s) => s.customSnippets)
  const count = selectedIds.length
  const [hovered, setHovered] = useState(false)

  const allSnippets = useMemo(
    () => [...PROMPT_SNIPPET_PRESETS, ...customSnippets],
    [customSnippets],
  )

  const selectedSnippets = useMemo(
    () => allSnippets.filter((s) => selectedIds.includes(s.id)),
    [allSnippets, selectedIds],
  )

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="cursor-pointer border-none flex items-center gap-1"
      style={{
        background: 'transparent',
        padding: '2px 4px',
        fontWeight: 500,
        opacity: hovered ? 1 : count > 0 ? 0.9 : 0.5,
        color: count > 0 ? 'var(--chatui-accent, #a78bfa)' : 'inherit',
        transition: 'all 0.2s ease',
        position: 'relative',
      }}
      title="Prompt snippets — attach reusable prompts to messages"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>

      {count === 0 && <span>提示词</span>}

      {/* Selected snippet pills */}
      {selectedSnippets.length > 0 && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', flexWrap: 'nowrap' }}>
          {selectedSnippets.slice(0, 3).map((s) => (
            <span
              key={s.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                padding: '1px 5px',
                fontSize: '9px',
                fontWeight: 600,
                borderRadius: '3px',
                background: `rgba(${hexToRgb(s.color)}, 0.15)`,
                color: s.color,
                letterSpacing: '0.2px',
                lineHeight: '14px',
                whiteSpace: 'nowrap',
                border: `1px solid rgba(${hexToRgb(s.color)}, 0.25)`,
              }}
            >
              {s.name}
            </span>
          ))}
          {selectedSnippets.length > 3 && (
            <span style={{
              fontSize: '9px',
              opacity: 0.6,
              fontWeight: 600,
              padding: '1px 4px',
              borderRadius: '3px',
              background: 'rgba(255,255,255,0.06)',
            }}>
              +{selectedSnippets.length - 3}
            </span>
          )}
        </span>
      )}
    </button>
  )
})

// ---------------------------------------------------------------------------
// SnippetCard — individual snippet item
// ---------------------------------------------------------------------------

const SnippetCard = memo(function SnippetCard({
  snippet,
  isSelected,
  isBuiltIn,
  index,
  onToggle,
  onEdit,
  onRemove,
}: {
  snippet: { id: string; name: string; prompt: string; color: string }
  isSelected: boolean
  isBuiltIn: boolean
  index: number
  onToggle: () => void
  onEdit: () => void
  onRemove: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const rgb = hexToRgb(snippet.color)

  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'stretch',
        cursor: 'pointer',
        borderRadius: '8px',
        margin: '3px 8px',
        background: isSelected
          ? `rgba(${rgb}, 0.08)`
          : hovered
            ? 'rgba(255,255,255,0.03)'
            : 'transparent',
        border: isSelected
          ? `1px solid rgba(${rgb}, 0.25)`
          : '1px solid transparent',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
        animation: `snippetCardIn 0.25s ease both`,
        animationDelay: `${index * 30}ms`,
      }}
    >
      {/* Color accent bar */}
      <div style={{
        width: '3px',
        flexShrink: 0,
        background: isSelected
          ? snippet.color
          : hovered
            ? `rgba(${rgb}, 0.5)`
            : `rgba(${rgb}, 0.2)`,
        borderRadius: '3px 0 0 3px',
        transition: 'background 0.2s ease',
      }} />

      {/* Content area */}
      <div style={{ flex: 1, padding: '8px 10px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Checkbox indicator */}
          <div style={{
            width: '14px',
            height: '14px',
            borderRadius: '4px',
            border: isSelected ? `1.5px solid ${snippet.color}` : '1.5px solid rgba(255,255,255,0.18)',
            background: isSelected ? snippet.color : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.2s ease',
            ...(isSelected ? {
              boxShadow: `0 0 6px rgba(${rgb}, 0.3)`,
            } : {}),
          }}>
            {isSelected && (
              <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            )}
          </div>

          {/* Name */}
          <span style={{
            fontSize: '12px',
            fontWeight: 600,
            color: isSelected ? snippet.color : 'var(--vscode-foreground)',
            transition: 'color 0.2s ease',
            letterSpacing: '0.1px',
          }}>
            {snippet.name}
          </span>

          {!isBuiltIn && (
            <span style={{
              fontSize: '8px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              padding: '1px 4px',
              borderRadius: '3px',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.35)',
            }}>
              custom
            </span>
          )}

          {/* Spacer */}
          <div style={{ flex: 1 }} />

          {/* Action buttons for custom snippets */}
          {!isBuiltIn && hovered && (
            <div style={{
              display: 'flex',
              gap: '2px',
              animation: 'snippetCardIn 0.15s ease both',
            }}>
              <button
                onClick={(e) => { e.stopPropagation(); onEdit() }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)',
                  padding: '3px 5px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
                title="Edit snippet"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onRemove() }}
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)',
                  padding: '3px 5px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  transition: 'all 0.15s ease',
                }}
                title="Delete snippet"
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.15)'
                  e.currentTarget.style.color = '#ef4444'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Prompt preview */}
        <div style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.35)',
          marginTop: '3px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          paddingLeft: '20px',
          lineHeight: '15px',
        }}>
          {snippet.prompt}
        </div>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// EditForm — inline edit / add form
// ---------------------------------------------------------------------------

const EditForm = memo(function EditForm({
  name,
  prompt,
  onChangeName,
  onChangePrompt,
  onSave,
  onCancel,
  saveLabel,
  color,
}: {
  name: string
  prompt: string
  onChangeName: (v: string) => void
  onChangePrompt: (v: string) => void
  onSave: () => void
  onCancel: () => void
  saveLabel: string
  color?: string
}) {
  const accentColor = color || 'var(--chatui-accent, #a78bfa)'
  const canSave = name.trim() && prompt.trim()

  return (
    <div style={{
      padding: '12px',
      animation: 'snippetCardIn 0.2s ease both',
    }}>
      {/* Name field */}
      <div style={{ position: 'relative', marginBottom: '8px' }}>
        <input
          autoFocus
          value={name}
          onChange={(e) => onChangeName(e.target.value)}
          placeholder="Snippet name"
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '12px',
            fontWeight: 500,
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border, rgba(255,255,255,0.1))',
            borderRadius: '6px',
            outline: 'none',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = accentColor }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border, rgba(255,255,255,0.1))' }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel()
            if (e.key === 'Enter' && !e.shiftKey && canSave) onSave()
          }}
        />
      </div>

      {/* Prompt field */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <textarea
          value={prompt}
          onChange={(e) => onChangePrompt(e.target.value)}
          placeholder="Enter the prompt content that will be prepended to your messages..."
          rows={4}
          style={{
            width: '100%',
            padding: '8px 10px',
            fontSize: '11px',
            lineHeight: '1.5',
            background: 'var(--vscode-input-background)',
            color: 'var(--vscode-input-foreground)',
            border: '1px solid var(--vscode-input-border, rgba(255,255,255,0.1))',
            borderRadius: '6px',
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = accentColor }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--vscode-input-border, rgba(255,255,255,0.1))' }}
          onKeyDown={(e) => { if (e.key === 'Escape') onCancel() }}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '5px 12px',
            fontSize: '11px',
            fontWeight: 500,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '6px',
            cursor: 'pointer',
            color: 'rgba(255,255,255,0.6)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.8)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
            e.currentTarget.style.color = 'rgba(255,255,255,0.6)'
          }}
        >
          Cancel
        </button>
        <button
          onClick={onSave}
          disabled={!canSave}
          style={{
            padding: '5px 14px',
            fontSize: '11px',
            fontWeight: 600,
            background: canSave ? accentColor : 'rgba(255,255,255,0.06)',
            border: 'none',
            borderRadius: '6px',
            cursor: canSave ? 'pointer' : 'not-allowed',
            color: canSave ? '#fff' : 'rgba(255,255,255,0.25)',
            transition: 'all 0.15s ease',
            ...(canSave ? { boxShadow: `0 2px 8px rgba(${hexToRgb(accentColor.startsWith('#') ? accentColor : '#a78bfa')}, 0.3)` } : {}),
          }}
        >
          {saveLabel}
        </button>
      </div>
    </div>
  )
})

// ---------------------------------------------------------------------------
// SnippetDropdown — modal panel
// ---------------------------------------------------------------------------

export const SnippetDropdown = memo(function SnippetDropdown({ onClose }: { onClose: () => void }) {
  const selectedIds = useSnippetStore((s) => s.selectedIds)
  const customSnippets = useSnippetStore((s) => s.customSnippets)
  const snippetMode = useSnippetStore((s) => s.snippetMode)
  const toggleSnippet = useSnippetStore((s) => s.toggleSnippet)
  const addCustomSnippet = useSnippetStore((s) => s.addCustomSnippet)
  const removeCustomSnippet = useSnippetStore((s) => s.removeCustomSnippet)
  const updateCustomSnippet = useSnippetStore((s) => s.updateCustomSnippet)
  const setSelectedIds = useSnippetStore((s) => s.setSelectedIds)
  const setSnippetMode = useSnippetStore((s) => s.setSnippetMode)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => { injectStyles() }, [])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

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

  const handleToggle = useCallback((id: string) => {
    toggleSnippet(id)
    setTimeout(persistSnippetState, 0)
  }, [toggleSnippet])

  const handleAdd = useCallback(() => {
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
  }, [newName, newPrompt, customSnippets.length, addCustomSnippet])

  const handleRemove = useCallback((id: string) => {
    removeCustomSnippet(id)
    setTimeout(persistSnippetState, 0)
  }, [removeCustomSnippet])

  const handleStartEdit = useCallback((snippet: { id: string; name: string; prompt: string }) => {
    setEditingId(snippet.id)
    setEditName(snippet.name)
    setEditPrompt(snippet.prompt)
  }, [])

  const handleSaveEdit = useCallback(() => {
    if (!editingId || !editName.trim() || !editPrompt.trim()) return
    updateCustomSnippet(editingId, { name: editName.trim(), prompt: editPrompt.trim() })
    setEditingId(null)
    setTimeout(persistSnippetState, 0)
  }, [editingId, editName, editPrompt, updateCustomSnippet])

  const handleClearAll = useCallback(() => {
    setSelectedIds([])
    setTimeout(persistSnippetState, 0)
  }, [setSelectedIds])

  const builtInSnippets = useMemo(
    () => PROMPT_SNIPPET_PRESETS.map((s) => ({ ...s, isBuiltIn: true })),
    [],
  )
  const userSnippets = useMemo(
    () => customSnippets.map((s) => ({ ...s, isBuiltIn: false })),
    [customSnippets],
  )

  const filteredBuiltIn = useMemo(() => {
    if (!searchQuery.trim()) return builtInSnippets
    const q = searchQuery.toLowerCase()
    return builtInSnippets.filter(
      (s) => s.name.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q),
    )
  }, [builtInSnippets, searchQuery])

  const filteredCustom = useMemo(() => {
    if (!searchQuery.trim()) return userSnippets
    const q = searchQuery.toLowerCase()
    return userSnippets.filter(
      (s) => s.name.toLowerCase().includes(q) || s.prompt.toLowerCase().includes(q),
    )
  }, [userSnippets, searchQuery])

  const selectedCount = selectedIds.length

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'snippetOverlayIn 0.2s ease both',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={dropdownRef}
        style={{
          width: '460px',
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--vscode-editorWidget-background, #1e1e2e)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.55), 0 0 1px rgba(255,255,255,0.1)',
          animation: 'snippetFadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) both',
          overflow: 'hidden',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '14px 16px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '7px',
              background: 'linear-gradient(135deg, rgba(167,139,250,0.2), rgba(139,92,246,0.1))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <div>
              <div style={{
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--vscode-foreground)',
                letterSpacing: '-0.1px',
              }}>
                Prompt Snippets
              </div>
              <div style={{
                fontSize: '10px',
                color: 'rgba(255,255,255,0.35)',
                marginTop: '1px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    const newMode = snippetMode === 'single' ? 'multi' : 'single'
                    setSnippetMode(newMode)
                    setTimeout(persistSnippetState, 0)
                  }}
                  style={{
                    background: snippetMode === 'single' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                    border: `1px solid ${snippetMode === 'single' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                    cursor: 'pointer',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontSize: '9px',
                    fontWeight: 600,
                    color: snippetMode === 'single' ? '#10b981' : '#f59e0b',
                    transition: 'all 0.15s ease',
                  }}
                  title={snippetMode === 'single'
                    ? 'Single mode (recommended): One focused role per message for best results. Click to switch to multi-select.'
                    : 'Multi mode: Multiple roles at once (may reduce focus). Click to switch to single-select.'
                  }
                >
                  {snippetMode === 'single' ? '● Single' : '◆ Multi'}
                </button>
                <span>{snippetMode === 'single' ? 'One role, maximum focus' : 'Multiple roles combined'}</span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {selectedCount > 0 && (
              <button
                onClick={handleClearAll}
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  fontSize: '10px',
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.5)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(239,68,68,0.1)'
                  e.currentTarget.style.borderColor = 'rgba(239,68,68,0.2)'
                  e.currentTarget.style.color = '#ef4444'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.color = 'rgba(255,255,255,0.5)'
                }}
              >
                <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
                </svg>
                Clear {selectedCount}
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)',
                width: '24px',
                height: '24px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
              }}
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Search ── */}
        <div style={{
          padding: '8px 12px',
          flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.04)',
        }}>
          <div style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
          }}>
            <svg
              width="12" height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                position: 'absolute',
                left: '9px',
                pointerEvents: 'none',
              }}
            >
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search snippets..."
              style={{
                width: '100%',
                padding: '7px 10px 7px 28px',
                fontSize: '11px',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--vscode-input-foreground)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '8px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s ease',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'rgba(167,139,250,0.3)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); searchRef.current?.focus() }}
                style={{
                  position: 'absolute',
                  right: '6px',
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.4)',
                  width: '16px',
                  height: '16px',
                  borderRadius: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                }}
              >
                <svg width="8" height="8" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Snippet list ── */}
        <div
          className="snippet-scroll"
          style={{
            flex: 1,
            overflowY: 'auto',
            minHeight: 0,
            padding: '4px 0',
          }}
        >
          {/* Built-in section */}
          {filteredBuiltIn.length > 0 && (
            <>
              <div style={{
                padding: '8px 16px 4px',
                fontSize: '9px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span>Built-in</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
                <span style={{ fontWeight: 500, letterSpacing: '0', textTransform: 'none', fontSize: '9px' }}>
                  {filteredBuiltIn.length}
                </span>
              </div>
              {filteredBuiltIn.map((snippet, i) => (
                <SnippetCard
                  key={snippet.id}
                  snippet={snippet}
                  isSelected={selectedIds.includes(snippet.id)}
                  isBuiltIn
                  index={i}
                  onToggle={() => handleToggle(snippet.id)}
                  onEdit={() => {}}
                  onRemove={() => {}}
                />
              ))}
            </>
          )}

          {/* Custom section */}
          {filteredCustom.length > 0 && (
            <>
              <div style={{
                padding: '10px 16px 4px',
                fontSize: '9px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1px',
                color: 'rgba(255,255,255,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span>Custom</span>
                <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.04)' }} />
                <span style={{ fontWeight: 500, letterSpacing: '0', textTransform: 'none', fontSize: '9px' }}>
                  {filteredCustom.length}
                </span>
              </div>
              {filteredCustom.map((snippet, i) => {
                if (editingId === snippet.id) {
                  return (
                    <div key={snippet.id} style={{ margin: '3px 8px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                      <EditForm
                        name={editName}
                        prompt={editPrompt}
                        onChangeName={setEditName}
                        onChangePrompt={setEditPrompt}
                        onSave={handleSaveEdit}
                        onCancel={() => setEditingId(null)}
                        saveLabel="Save"
                        color={snippet.color}
                      />
                    </div>
                  )
                }
                return (
                  <SnippetCard
                    key={snippet.id}
                    snippet={snippet}
                    isSelected={selectedIds.includes(snippet.id)}
                    isBuiltIn={false}
                    index={i}
                    onToggle={() => handleToggle(snippet.id)}
                    onEdit={() => handleStartEdit(snippet)}
                    onRemove={() => handleRemove(snippet.id)}
                  />
                )
              })}
            </>
          )}

          {/* Empty search state */}
          {filteredBuiltIn.length === 0 && filteredCustom.length === 0 && (
            <div style={{
              padding: '32px 16px',
              textAlign: 'center',
              color: 'rgba(255,255,255,0.25)',
              fontSize: '12px',
            }}>
              <div style={{ fontSize: '20px', marginBottom: '8px', opacity: 0.4 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto' }}>
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              No snippets match "{searchQuery}"
            </div>
          )}
        </div>

        {/* ── Bottom: Add custom ── */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                width: '100%',
                padding: '11px 16px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.4)',
                fontSize: '11px',
                fontWeight: 500,
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                e.currentTarget.style.color = 'var(--chatui-accent, #a78bfa)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none'
                e.currentTarget.style.color = 'rgba(255,255,255,0.4)'
              }}
            >
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '5px',
                border: '1.5px dashed rgba(255,255,255,0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" />
                </svg>
              </div>
              Create custom snippet
            </button>
          ) : (
            <div style={{
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              <div style={{
                padding: '8px 12px 0',
                fontSize: '10px',
                fontWeight: 600,
                color: 'rgba(255,255,255,0.3)',
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
              }}>
                New Snippet
              </div>
              <EditForm
                name={newName}
                prompt={newPrompt}
                onChangeName={setNewName}
                onChangePrompt={setNewPrompt}
                onSave={handleAdd}
                onCancel={() => { setShowAddForm(false); setNewName(''); setNewPrompt('') }}
                saveLabel="Create"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
})
