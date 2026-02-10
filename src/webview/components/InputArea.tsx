import { useState, useRef, useCallback, useEffect } from 'react'
import { postMessage, getState, setState } from '../lib/vscode'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { SlashCommandPicker } from './SlashCommandPicker'
import { FilePicker } from './FilePicker'

const MODELS = [
  { value: 'claude-opus-4-6', label: 'Opus', desc: 'Most capable, complex tasks', color: '#a78bfa', icon: '★' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet', desc: 'Fast and balanced', color: '#60a5fa', icon: '◆' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Lightweight and quick', color: '#4ade80', icon: '●' },
  { value: 'default', label: 'Default', desc: 'User configured model', color: '#9ca3af', icon: '○' },
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
  const { showSlashPicker, showFilePicker, setShowSlashPicker, setShowFilePicker, draftText, setDraftText } = useUIStore()

  const [slashFilter, setSlashFilter] = useState('')

  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string }>()
    if (saved?.draft) setText(saved.draft)
    if (saved?.model) setSelectedModel(saved.model)
  }, [])

  useEffect(() => {
    setState({ draft: text, model: selectedModel })
  }, [text, selectedModel])

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
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
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
      {/* Pickers */}
      <SlashCommandPicker filter={slashFilter} onSelect={handleSlashSelect} />
      <FilePicker onSelect={handleFileSelect} />

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
          onClick={() => setThinkingMode(!thinkingMode)}
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
          <span>{thinkingMode ? 'Think' : 'Think'}</span>
        </button>

        <div className="flex items-center gap-1" style={{ opacity: planMode ? 1 : 0.7, cursor: 'pointer' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="2" />
          </svg>
          <span onClick={() => setPlanMode(!planMode)} style={{ color: planMode ? 'var(--chatui-accent)' : 'inherit' }}>
            Plan
          </span>
          <div
            className={`mode-switch ${planMode ? 'active' : ''}`}
            onClick={() => setPlanMode(!planMode)}
          />
        </div>
      </div>

      {/* Textarea container */}
      <div
        className="textarea-glow"
        style={{
          background: 'var(--vscode-input-background)',
          border: '1px solid rgba(237, 110, 29, 0.3)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
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
                </div>
              )}
            </div>

            {/* MCP button */}
            <button
              onClick={() => useUIStore.getState().setActiveView('mcp')}
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
                className="cursor-pointer border-none flex items-center gap-1 shrink-0"
                style={{
                  background: 'linear-gradient(135deg, var(--chatui-accent) 0%, var(--chatui-accent-dark) 100%)',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  boxShadow: '0 2px 8px rgba(237, 110, 29, 0.3)',
                  transition: 'all 0.2s ease',
                  opacity: (!text.trim() && images.length === 0) ? 0.5 : 1,
                }}
                onMouseEnter={(e) => {
                  if (text.trim() || images.length > 0) {
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(237, 110, 29, 0.4)'
                    e.currentTarget.style.transform = 'translateY(-1px)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(237, 110, 29, 0.3)'
                  e.currentTarget.style.transform = 'translateY(0)'
                }}
              >
                <span>Send</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
