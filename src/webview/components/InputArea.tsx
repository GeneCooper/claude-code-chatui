import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { postMessage, getState, setState } from '../hooks'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { useSettingsStore } from '../store'
import { markOptimisticUserInput } from '../mutations'
import { SlashCommandPicker } from './SlashCommandPicker'
import { FilePicker } from './FilePicker'
import { ThinkingIntensityModal } from './ThinkingIntensityModal'
import { ModelSelectorModal, MODELS } from './ModelSelectorModal'

export function InputArea() {
  const [text, setText] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(true)
  const [selectedModel, setSelectedModel] = useState('default')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const { showSlashPicker, showFilePicker, setShowSlashPicker, setShowFilePicker, draftText, setDraftText } = useUIStore()

  const [slashFilter, setSlashFilter] = useState('')

  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string; planMode?: boolean; thinkingMode?: boolean }>()
    if (saved?.draft) setText(saved.draft)
    if (saved?.model) setSelectedModel(saved.model)
    if (saved?.planMode !== undefined) setPlanMode(saved.planMode)
    if (saved?.thinkingMode !== undefined) setThinkingMode(saved.thinkingMode)
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
    setState({ draft: text, model: selectedModel, planMode, thinkingMode })
    debouncedSave(text)
  }, [text, selectedModel, planMode, thinkingMode, debouncedSave])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  useEffect(() => {
    if (draftText) {
      setText(draftText)
      setDraftText('')
      textareaRef.current?.focus()
    }
  }, [draftText, setDraftText])


  // Listen for image file picked via native dialog
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: string; dataUrl: string }
      if (detail) setImages((prev) => [...prev, detail])
    }
    window.addEventListener('imageFilePicked', handler)
    return () => window.removeEventListener('imageFilePicked', handler)
  }, [])

  // Listen for clipboard content fallback from extension
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string }
      if (detail?.text) {
        setText((prev) => prev + detail.text)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('clipboardContent', handler)
    return () => window.removeEventListener('clipboardContent', handler)
  }, [])

  // Listen for file context attachment (from editor title button or file drop)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filePath: string }
      if (detail?.filePath) {
        setText((prev) => {
          const fileRef = `@${detail.filePath} `
          // Avoid duplicate @file references
          if (prev.includes(`@${detail.filePath}`)) return prev
          return prev ? `${prev}${fileRef}` : fileRef
        })
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('attachFileContext', handler)
    return () => window.removeEventListener('attachFileContext', handler)
  }, [])

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
    if ((!trimmed && images.length === 0) || isProcessing) return

    if (trimmed.startsWith('/')) {
      const cmd = trimmed.substring(1).split(/\s+/)[0]
      postMessage({ type: 'executeSlashCommand', command: cmd })
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    const imageData = images.length > 0 ? images.map((img) => img.dataUrl) : undefined

    // Optimistic update: immediately show message + processing state
    // This eliminates the IPC round-trip delay before the user sees their message
    const store = useChatStore.getState()
    markOptimisticUserInput()
    store.addMessage({ type: 'userInput', data: { text: trimmed, images: imageData } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())

    // Then tell extension to process
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
    // Webview clipboard restriction: when types is empty, fall back to extension API
    if (e.clipboardData.types.length === 0) {
      e.preventDefault()
      postMessage({ type: 'getClipboardText' })
      return
    }
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

    // Handle URI drops from VS Code explorer (text/uri-list)
    const uriList = e.dataTransfer.getData('text/uri-list')
    if (uriList) {
      for (const uri of uriList.split('\n').filter(Boolean)) {
        postMessage({ type: 'resolveDroppedFile', uri: uri.trim() })
      }
      return
    }

    // Handle file drops (images from outside VS Code)
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) {
        addImageFile(file)
      } else if (file.name) {
        // Non-image file drop — try to resolve as workspace file
        postMessage({ type: 'resolveDroppedFile', uri: `file://${file.name}` })
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const addImageFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      setImages((prev) => [...prev, { name: file.name, dataUrl: reader.result as string }])
    }
    reader.readAsDataURL(file)
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
    postMessage({ type: 'selectModel', model })
  }

  const currentModel = MODELS.find((m) => m.value === selectedModel) || MODELS[3]

  return (
    <div
      className="relative"
      style={{
        padding: '10px 10px 12px',
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
      <ModelSelectorModal
        show={showModelPicker}
        selectedModel={selectedModel}
        onSelect={handleModelChange}
        onClose={() => setShowModelPicker(false)}
      />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 pb-2 flex-wrap">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="w-12 h-12 rounded object-cover cursor-pointer"
                style={{ border: '1px solid var(--vscode-panel-border)' }}
                onClick={() => setPreviewSrc(img.dataUrl)}
              />
              <button
                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] flex items-center justify-center cursor-pointer border-none opacity-0 group-hover:opacity-100 transition-opacity"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Image lightbox */}
      {previewSrc && (
        <div
          onClick={() => setPreviewSrc(null)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'zoom-out',
          }}
        >
          <img
            src={previewSrc}
            alt="Preview"
            style={{ maxWidth: '90%', maxHeight: '90%', borderRadius: '8px', objectFit: 'contain' }}
          />
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
            postMessage({ type: 'updateSettings', settings: { yoloMode: next } })
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
          <div className="flex items-center" style={{ fontSize: '11px' }}>
            {/* Model selector */}
            <button
              onClick={() => setShowModelPicker(true)}
              className="cursor-pointer border-none flex items-center gap-1"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontWeight: 500,
                opacity: 0.7,
                color: currentModel.color,
                transition: 'all 0.2s ease',
              }}
              title="Select model"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
            >
              <span>{currentModel.label}</span>
            </button>

            <InputSep />

            {/* MCP button */}
            <button
              onClick={() => useUIStore.getState().setShowMCPModal(true)}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '2px 4px',
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
          <div className="flex items-center">
            {/* Slash command button */}
            <button
              onClick={() => { setShowSlashPicker(true); setSlashFilter('') }}
              className="cursor-pointer flex items-center justify-center"
              style={{
                background: 'transparent',
                border: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.15))',
                padding: '0 8px',
                height: '24px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                fontWeight: 600,
                color: 'inherit',
                opacity: 0.7,
                transition: 'all 0.15s ease',
              }}
              title="Slash commands"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.opacity = '0.7'
              }}
            >
              /
            </button>

            {/* Stop button (only visible when processing) */}
            {isProcessing && (
              <>
                <InputSep />
                <button
                  onClick={handleStop}
                  className="cursor-pointer flex items-center justify-center gap-1 shrink-0"
                  style={{
                    background: 'transparent',
                    color: '#e74c3c',
                    border: 'none',
                    padding: '0 8px',
                    height: '24px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.2s ease',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(231, 76, 60, 0.1)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2" /></svg>
                  Stop
                </button>
              </>
            )}

            {/* Send button (only visible when not processing) */}
            {!isProcessing && (
              <>
                <InputSep />
                <button
                  onClick={handleSend}
                  disabled={!text.trim() && images.length === 0}
                  className="cursor-pointer flex items-center justify-center shrink-0"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: '0',
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-md)',
                    color: (text.trim() || images.length > 0) ? 'var(--chatui-accent)' : 'inherit',
                    opacity: (text.trim() || images.length > 0) ? 1 : 0.4,
                    transition: 'all 0.15s ease',
                  }}
                  title="Send message"
                  onMouseEnter={(e) => {
                    if (text.trim() || images.length > 0) {
                      e.currentTarget.style.background = 'rgba(100,149,237,0.1)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13" />
                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InputSep() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '1px',
        height: '12px',
        background: 'var(--vscode-panel-border, rgba(255,255,255,0.2))',
        opacity: 0.5,
        margin: '0 6px',
        verticalAlign: 'middle',
      }}
    />
  )
}
