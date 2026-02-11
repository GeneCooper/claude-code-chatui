import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { postMessage, getState, setState } from '../hooks'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { useSettingsStore } from '../store'
import { SlashCommandPicker } from './SlashCommandPicker'
import { FilePicker } from './FilePicker'
import { ThinkingIntensityModal } from './ThinkingIntensityModal'

const MODELS = [
  { value: 'claude-opus-4-6', label: 'Opus', desc: 'Most capable, complex tasks', color: '#a78bfa', icon: '\u2605' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet', desc: 'Fast and balanced', color: '#60a5fa', icon: '\u25C6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Lightweight and quick', color: '#4ade80', icon: '\u25CF' },
  { value: 'default', label: 'Default', desc: 'User configured model', color: '#9ca3af', icon: '\u25CB' },
]

export function InputArea() {
  const [text, setText] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(false)
  const [selectedModel, setSelectedModel] = useState('default')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const { showSlashPicker, showFilePicker, setShowSlashPicker, setShowFilePicker, draftText, setDraftText } = useUIStore()

  const [slashFilter, setSlashFilter] = useState('')

  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string }>()
    if (saved?.draft) setText(saved.draft)
    if (saved?.model) setSelectedModel(saved.model)
  }, [])

  // Debounced save to extension for persistence across panel reopens
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedSave = useMemo(() => (value: string) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      postMessage({ type: 'saveInputText', text: value })
    }, 500)
  }, [])

  useEffect(() => {
    setState({ draft: text, model: selectedModel })
    debouncedSave(text)
  }, [text, selectedModel, debouncedSave])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  useEffect(() => {
    if (draftText) {
      setText(draftText)
      setDraftText('')
      textareaRef.current?.focus()
    }
  }, [draftText, setDraftText])

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return

    // Reset to measure true scrollHeight
    el.style.height = 'auto'

    const computed = getComputedStyle(el)
    const lineHeight = parseFloat(computed.lineHeight) || 20
    const paddingTop = parseFloat(computed.paddingTop)
    const paddingBottom = parseFloat(computed.paddingBottom)
    const borderTop = parseFloat(computed.borderTopWidth)
    const borderBottom = parseFloat(computed.borderBottomWidth)

    const maxRows = 5
    const minHeight = lineHeight + paddingTop + paddingBottom + borderTop + borderBottom
    const maxHeight = (lineHeight * maxRows) + paddingTop + paddingBottom + borderTop + borderBottom

    if (el.scrollHeight <= maxHeight) {
      el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`
      el.style.overflowY = 'hidden'
    } else {
      el.style.height = `${maxHeight}px`
      el.style.overflowY = 'auto'
    }
  }, [])

  useEffect(() => { adjustHeight() }, [text, adjustHeight])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || isProcessing) return

    if (trimmed.startsWith('/')) {
      const cmd = trimmed.substring(1).split(/\s+/)[0]
      postMessage({ type: 'executeSlashCommand', command: cmd })
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    const imageData = images.length > 0 ? images.map((img) => img.dataUrl) : undefined
    postMessage({
      type: 'sendMessage',
      text: trimmed,
      planMode,
      thinkingMode,
      model: selectedModel !== 'default' ? selectedModel : undefined,
      images: imageData,
    })
    setText('')
    setImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleStop = () => { postMessage({ type: 'stopRequest' }) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashPicker || showFilePicker) return
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)

    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setSlashFilter(value.substring(1))
      setShowSlashPicker(true)
      setShowFilePicker(false)
    } else if (!value.startsWith('/')) {
      setShowSlashPicker(false)
    }

    const cursorPos = e.target.selectionStart || 0
    const textBefore = value.substring(0, cursorPos)
    const atMatch = textBefore.match(/@(\S*)$/)
    if (atMatch) {
      setShowFilePicker(true)
      setShowSlashPicker(false)
    } else {
      setShowFilePicker(false)
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) addImageFile(file)
        return
      }
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    for (const file of files) {
      if (file.type.startsWith('image/')) addImageFile(file)
    }
  }

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }

  const addImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImages((prev) => [...prev, { name: file.name, dataUrl }])
    }
    reader.readAsDataURL(file)
  }

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSlashSelect = (command: string, category: 'snippet' | 'native') => {
    if (category === 'native') {
      postMessage({ type: 'executeSlashCommand', command })
      setText('')
    } else {
      setText(`/${command} `)
    }
    setShowSlashPicker(false)
    textareaRef.current?.focus()
  }

  const handleFileSelect = (filePath: string) => {
    const el = textareaRef.current
    if (!el) return

    const cursorPos = el.selectionStart || 0
    const textBefore = text.substring(0, cursorPos)
    const textAfter = text.substring(cursorPos)

    const atIndex = textBefore.lastIndexOf('@')
    if (atIndex >= 0) {
      const newText = textBefore.substring(0, atIndex) + `@${filePath} ` + textAfter
      setText(newText)
    }

    setShowFilePicker(false)
    el.focus()
  }

  const handleModelChange = (model: string) => {
    setSelectedModel(model)
    setShowModelPicker(false)
    postMessage({ type: 'selectModel', model })
  }

  const currentModel = MODELS.find((m) => m.value === selectedModel) || MODELS[3]

  return (
    <div
      className="relative"
      style={{
        padding: '12px',
        borderTop: '1px solid var(--vscode-panel-border)',
        background: 'var(--vscode-panel-background)',
      }}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Pickers & Modals */}
      <SlashCommandPicker filter={slashFilter} onSelect={handleSlashSelect} />
      <FilePicker onSelect={handleFileSelect} />
      <ThinkingIntensityModal enabled={thinkingMode} onToggle={setThinkingMode} />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 pb-2 flex-wrap">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="w-12 h-12 rounded object-cover"
                style={{ border: '1px solid var(--vscode-panel-border)' }}
              />
              <button
                onClick={() => removeImage(idx)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center cursor-pointer border-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Mode toggles */}
      <div className="flex items-center gap-2 pb-2" style={{ fontSize: '11px' }}>
        <button
          onClick={() => useUIStore.getState().setShowIntensityModal(true)}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            border: `1px solid ${thinkingMode ? 'var(--chatui-accent)' : 'var(--vscode-panel-border)'}`,
            background: 'transparent',
            color: thinkingMode ? 'var(--chatui-accent)' : 'inherit',
            opacity: thinkingMode ? 1 : 0.7,
            transition: 'all 0.2s ease',
          }}
          title="Thinking mode"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l2 2" />
          </svg>
          <span>Think{thinkingMode ? ` · ${useSettingsStore.getState().thinkingIntensity.replace(/-/g, ' ')}` : ''}</span>
        </button>

        <button
          onClick={() => setPlanMode(!planMode)}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            border: `1px solid ${planMode ? 'var(--chatui-accent)' : 'var(--vscode-panel-border)'}`,
            background: 'transparent',
            color: planMode ? 'var(--chatui-accent)' : 'inherit',
            opacity: planMode ? 1 : 0.7,
            transition: 'all 0.2s ease',
          }}
          title="Plan mode"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="2" />
          </svg>
          <span>Plan</span>
        </button>

        <button
          onClick={() => {
            const next = !yoloMode
            postMessage({ type: 'updateSettings', settings: { 'permissions.yoloMode': next } })
            useSettingsStore.getState().updateSettings({ yoloMode: next })
          }}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            border: `1px solid ${yoloMode ? '#ef4444' : 'var(--vscode-panel-border)'}`,
            background: yoloMode ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
            color: yoloMode ? '#ef4444' : 'inherit',
            opacity: yoloMode ? 1 : 0.7,
            transition: 'all 0.2s ease',
            boxShadow: yoloMode ? '0 0 8px rgba(239, 68, 68, 0.3)' : 'none',
          }}
          title="YOLO mode - Skip all permission checks (dangerous!)"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
          <span>YOLO</span>
        </button>
      </div>

      {/* Textarea container */}
      <div
        className="textarea-glow"
        style={{
          background: 'var(--vscode-input-background)',
          border: '1px solid rgba(237, 110, 29, 0.3)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Type your message to Claude Code..."
          rows={1}
          className="w-full resize-none border-none focus:outline-none"
          style={{
            background: 'transparent',
            color: 'var(--vscode-input-foreground)',
            padding: '12px',
            fontFamily: 'var(--vscode-editor-font-family)',
            fontSize: '13px',
            minHeight: '68px',
            lineHeight: 1.4,
          }}
          disabled={isProcessing}
        />

        {/* Input controls row */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '2px 4px',
            borderTop: '1px solid var(--vscode-panel-border)',
            background: 'var(--vscode-input-background)',
          }}
        >
          {/* Left controls */}
          <div className="flex items-center gap-1">
            {/* Model selector */}
            <div className="relative">
              <button
                onClick={() => setShowModelPicker(!showModelPicker)}
                className="cursor-pointer border-none flex items-center gap-1"
                style={{
                  background: 'transparent',
                  padding: '2px 4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  opacity: 0.7,
                  color: currentModel.color,
                  transition: 'all 0.2s ease',
                }}
                title="Select model"
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m7.08 7.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m7.08-7.08l4.24-4.24" />
                </svg>
                <span>{currentModel.label}</span>
              </button>

              {/* Model popup panel */}
              {showModelPicker && (
                <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 999 }}
                  onClick={() => setShowModelPicker(false)}
                />
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    left: 0,
                    width: '260px',
                    background: 'var(--vscode-editor-background)',
                    border: '1px solid var(--vscode-panel-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '16px',
                    zIndex: 1000,
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                  }}
                >
                  <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '12px', opacity: 0.7 }}>
                    Select Model
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {MODELS.map((model) => (
                      <button
                        key={model.value}
                        onClick={() => handleModelChange(model.value)}
                        className="flex items-center gap-2.5 cursor-pointer border-none text-left text-inherit"
                        style={{
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: model.value === selectedModel ? `1px solid ${model.color}` : '1px solid transparent',
                          background: model.value === selectedModel ? `${model.color}15` : 'rgba(128, 128, 128, 0.04)',
                          transition: 'all 0.15s ease',
                        }}
                        onMouseEnter={(e) => {
                          if (model.value !== selectedModel) {
                            e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (model.value !== selectedModel) {
                            e.currentTarget.style.background = 'rgba(128, 128, 128, 0.04)'
                          }
                        }}
                      >
                        <div
                          className="flex items-center justify-center shrink-0"
                          style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: 'var(--radius-sm)',
                            background: `${model.color}20`,
                            color: model.color,
                            fontSize: '14px',
                          }}
                        >
                          {model.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: '12px', fontWeight: 600 }}>{model.label}</div>
                          <div style={{ fontSize: '10px', opacity: 0.7 }}>{model.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {/* Configure in Terminal footer */}
                  <div
                    className="flex items-center gap-1.5 cursor-pointer"
                    style={{
                      marginTop: '8px',
                      paddingTop: '8px',
                      borderTop: '1px solid var(--vscode-panel-border)',
                      fontSize: '11px',
                      opacity: 0.7,
                      transition: 'all 0.2s ease',
                    }}
                    onClick={() => {
                      postMessage({ type: 'openModelTerminal' })
                      setShowModelPicker(false)
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--chatui-accent)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'inherit' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="4 17 10 11 4 5" />
                      <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    <span>Configure in Terminal</span>
                  </div>
                </div>
                </>
              )}
            </div>

            {/* Separator */}
            <span style={{ color: 'var(--vscode-panel-border)', fontSize: '11px', userSelect: 'none' }}>|</span>

            {/* MCP button */}
            <button
              onClick={() => useUIStore.getState().setShowMCPModal(true)}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontSize: '11px',
                fontWeight: 500,
                opacity: 0.7,
                color: 'inherit',
                transition: 'all 0.2s ease',
              }}
              title="Configure MCP servers"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--chatui-accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7'; e.currentTarget.style.color = 'inherit' }}
            >
              MCP
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-0.5">
            {/* Slash command button */}
            <button
              onClick={() => { setShowSlashPicker(true); setSlashFilter('') }}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'inherit',
                transition: 'all 0.15s ease',
              }}
              title="Slash commands"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              /
            </button>

            {/* File reference button */}
            <button
              onClick={() => setShowFilePicker(true)}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'inherit',
                transition: 'all 0.15s ease',
              }}
              title="Reference files"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              @
            </button>

            {/* Image button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer border-none flex items-center justify-center"
              style={{
                background: 'transparent',
                padding: '4px',
                width: '24px',
                height: '24px',
                borderRadius: 'var(--radius-sm)',
                color: 'inherit',
                transition: 'all 0.15s ease',
              }}
              title="Attach images"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = e.target.files
                if (files) {
                  for (const file of files) addImageFile(file)
                }
                e.target.value = ''
              }}
            />

            {/* Send / Stop button */}
            {isProcessing ? (
              <button
                onClick={handleStop}
                className="cursor-pointer border-none flex items-center gap-1 shrink-0"
                style={{
                  background: 'transparent',
                  color: 'var(--vscode-descriptionForeground)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  padding: '4px 8px',
                  fontSize: '12px',
                  borderRadius: 'var(--radius-md)',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'
                  e.currentTarget.style.color = '#e74c3c'
                  e.currentTarget.style.borderColor = 'rgba(231, 76, 60, 0.3)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--vscode-descriptionForeground)'
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'
                }}
              >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                Stop
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!text.trim() && images.length === 0}
                className="cursor-pointer border-none flex items-center justify-center shrink-0"
                style={{
                  background: 'transparent',
                  padding: '4px',
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-sm)',
                  color: (text.trim() || images.length > 0) ? 'var(--chatui-accent)' : 'inherit',
                  opacity: (text.trim() || images.length > 0) ? 1 : 0.3,
                  transition: 'all 0.15s ease',
                }}
                title="Send message"
                onMouseEnter={(e) => {
                  if (text.trim() || images.length > 0) {
                    e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13" />
                  <polygon points="22 2 15 22 11 13 2 9 22 2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
