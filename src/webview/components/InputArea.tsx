import { useState, useRef, useCallback, useEffect, useMemo, memo } from 'react'
import { postMessage, getState, setState } from '../hooks'
import { useChatStore, useSettingsStore, useDiscussionStore } from '../store'
import { useUIStore } from '../store'
import { markOptimisticUserInput } from '../mutations'
import { GENERATE_CLAUDE_MD_PROMPT } from './ClaudeMdBanner'

import { ModelSelectorModal, MODELS } from './ModelSelectorModal'

export const InputArea = memo(function InputArea() {
  const [text, setText] = useState('')
  const [ctrlEnterSend, setCtrlEnterSend] = useState(false)
  const [selectedModel, setSelectedModel] = useState('default')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCountRef = useRef(0)
  const recentAttachRef = useRef(new Set<string>())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const sessionId = useChatStore((s) => s.sessionId)
  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const showClaudeMdBanner = useUIStore((s) => s.showClaudeMdBanner)
  const draftText = useUIStore((s) => s.draftText)
  const setDraftText = useUIStore((s) => s.setDraftText)
  const editingContext = useUIStore((s) => s.editingContext)
  const setEditingContext = useUIStore((s) => s.setEditingContext)


  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string; ctrlEnterSend?: boolean }>()
    if (saved?.draft) setText(saved.draft)
    if (saved?.model) setSelectedModel(saved.model)
    if (saved?.ctrlEnterSend !== undefined) setCtrlEnterSend(saved.ctrlEnterSend)
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
    setState({ draft: text, model: selectedModel, ctrlEnterSend, sessionId })
  }, [text, selectedModel, ctrlEnterSend, sessionId])

  useEffect(() => {
    debouncedSave(text)
  }, [text, debouncedSave])

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }, [])

  useEffect(() => {
    if (draftText) {
      setText(draftText)
      setDraftText('')
      textareaRef.current?.focus()
    }
  }, [draftText, setDraftText])

  // When an edit is triggered, restore images from the original message
  useEffect(() => {
    if (!editingContext) return
    if (editingContext.images.length > 0) {
      setImages(editingContext.images.map((dataUrl, i) => ({ name: `image-${i + 1}`, dataUrl })))
    }
    textareaRef.current?.focus()
  }, [editingContext])


  // Listen for all custom events from extension in a single effect
  useEffect(() => {
    const onImagePicked = async (e: Event) => {
      const detail = (e as CustomEvent).detail as { name: string; dataUrl: string }
      if (detail) {
        const dataUrl = await resizeImageIfNeeded(detail.dataUrl, detail.name)
        setImages((prev) => [...prev, { name: detail.name, dataUrl }])
      }
    }
    const onClipboard = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string }
      if (detail?.text) {
        setText((prev) => prev + detail.text)
        textareaRef.current?.focus()
      }
    }
    const onAttachFile = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filePath: string }
      if (detail?.filePath) {
        // Deduplicate rapid duplicate events for the same path (e.g. from multiple dataTransfer formats)
        const key = detail.filePath.toLowerCase()
        if (recentAttachRef.current.has(key)) return
        recentAttachRef.current.add(key)
        setTimeout(() => recentAttachRef.current.delete(key), 200)

        const ref = `@${detail.filePath}\n`
        setText((prev) => {
          const ta = textareaRef.current
          if (ta && ta.selectionStart !== undefined) {
            const start = ta.selectionStart
            const end = ta.selectionEnd
            const next = prev.slice(0, start) + ref + prev.slice(end)
            requestAnimationFrame(() => {
              ta.selectionStart = ta.selectionEnd = start + ref.length
            })
            return next
          }
          return prev ? `${prev} ${ref}` : ref
        })
        textareaRef.current?.focus()
      }
    }
    const onModelRestored = (e: Event) => {
      const detail = (e as CustomEvent).detail as { model: string }
      if (detail?.model) setSelectedModel(detail.model)
    }

    window.addEventListener('imageFilePicked', onImagePicked)
    window.addEventListener('clipboardContent', onClipboard)
    window.addEventListener('attachFileContext', onAttachFile)
    window.addEventListener('modelRestored', onModelRestored)
    return () => {
      window.removeEventListener('imageFilePicked', onImagePicked)
      window.removeEventListener('clipboardContent', onClipboard)
      window.removeEventListener('attachFileContext', onAttachFile)
      window.removeEventListener('modelRestored', onModelRestored)
    }
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

    const imageData = images.length > 0 ? images.map((img) => img.dataUrl) : undefined

    const currentEditingContext = useUIStore.getState().editingContext

    if (currentEditingContext) {
      // Edit mode: rewind conversation to that point, then send the edited message
      postMessage({ type: 'rewindToMessage', userInputIndex: currentEditingContext.userInputIndex })
      postMessage({
        type: 'sendMessage',
        text: trimmed,
        model: selectedModel !== 'default' ? selectedModel : undefined,
        images: imageData,
      })
      setEditingContext(null)
    } else if (useDiscussionStore.getState().enabled) {
      // Discussion mode: send to multi-agent discussion
      const store = useChatStore.getState()
      markOptimisticUserInput()
      store.addMessage({ type: 'userInput', data: { text: trimmed, images: imageData } })
      store.setProcessing(true)
      useUIStore.getState().setRequestStartTime(Date.now())

      postMessage({
        type: 'sendDiscussionMessage',
        text: trimmed,
        model: selectedModel !== 'default' ? selectedModel : undefined,
      })
    } else {
      // Normal mode: optimistic update for instant feedback
      const store = useChatStore.getState()
      markOptimisticUserInput()
      store.addMessage({ type: 'userInput', data: { text: trimmed, images: imageData } })
      store.setProcessing(true)
      store.addMessage({ type: 'loading', data: 'Claude is working...' })
      useUIStore.getState().setRequestStartTime(Date.now())

      postMessage({
        type: 'sendMessage',
        text: trimmed,
        model: selectedModel !== 'default' ? selectedModel : undefined,
        images: imageData,
      })
    }
    setText('')
    setImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleStop = () => { postMessage({ type: 'stopRequest' }) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (ctrlEnterSend) {
        // Ctrl+Enter mode: send on Ctrl/Cmd+Enter, newline on plain Enter
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
          handleSend()
        }
      } else {
        // Default mode: send on Enter, newline on Shift+Enter
        if (!e.shiftKey) {
          e.preventDefault()
          handleSend()
        }
      }
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value)
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
    dragCountRef.current = 0
    setIsDragging(false)

    const toFileUri = (p: string) =>
      p.startsWith('file://') ? p : `file:///${p.replace(/\\/g, '/')}`
    const isFilePath = (s: string) =>
      s.startsWith('file://') || s.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(s)

    // Collect all URIs from every available dataTransfer format (de-duplicated, case-insensitive)
    const seen = new Set<string>()
    const uris: string[] = []
    const addUri = (u: string) => {
      const key = u.toLowerCase()
      if (!seen.has(key)) { seen.add(key); uris.push(u) }
    }

    // 1. text/uri-list (standard format, \r\n separated)
    const uriList = e.dataTransfer.getData('text/uri-list')
    if (uriList) {
      for (const line of uriList.split(/\r?\n/).filter(Boolean)) {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#')) addUri(trimmed)
      }
    }

    // 2. text/plain — may contain additional file paths not in uri-list
    const plain = e.dataTransfer.getData('text/plain')
    if (plain) {
      for (const line of plain.split(/\r?\n/).filter(Boolean)) {
        const trimmed = line.trim()
        if (isFilePath(trimmed)) addUri(toFileUri(trimmed))
      }
    }

    // 3. Iterate dataTransfer.items for any remaining string entries
    for (let i = 0; i < e.dataTransfer.items.length; i++) {
      const item = e.dataTransfer.items[i]
      if (item.kind === 'string' && item.type !== 'text/uri-list' && item.type !== 'text/plain') {
        const raw = e.dataTransfer.getData(item.type)
        if (raw) {
          for (const line of raw.split(/\r?\n/).filter(Boolean)) {
            const trimmed = line.trim()
            if (isFilePath(trimmed)) addUri(toFileUri(trimmed))
          }
        }
      }
    }

    // Resolve all collected URIs
    if (uris.length > 0) {
      for (const uri of uris) {
        postMessage({ type: 'resolveDroppedFile', uri })
      }
      return
    }

    // 4. Handle file drops (images/files from outside VS Code)
    for (const file of e.dataTransfer.files) {
      if (file.type.startsWith('image/')) {
        addImageFile(file)
      } else if (file.name) {
        postMessage({ type: 'resolveDroppedFile', uri: `file://${file.name}` })
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current++
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragCountRef.current--
    if (dragCountRef.current === 0) setIsDragging(false)
  }

  const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
  const MAX_IMAGE_DIMENSION = 8000 // Claude API max pixel limit

  const resizeImageIfNeeded = (dataUrl: string, fileName: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        if (img.width <= MAX_IMAGE_DIMENSION && img.height <= MAX_IMAGE_DIMENSION) {
          resolve(dataUrl)
          return
        }
        const scale = Math.min(MAX_IMAGE_DIMENSION / img.width, MAX_IMAGE_DIMENSION / img.height)
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        const resized = canvas.toDataURL('image/png')
        postMessage({ type: 'showInfo', data: `Image "${fileName}" too large (${img.width}x${img.height}), auto-scaled to ${canvas.width}x${canvas.height}.` })
        resolve(resized)
      }
      img.src = dataUrl
    })
  }

  const addImageFile = (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      postMessage({ type: 'showWarning', data: `Image "${file.name}" too large (${sizeMB}MB), max 5MB. Please compress and retry.` })
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = await resizeImageIfNeeded(reader.result as string, file.name)
      setImages((prev) => [...prev, { name: file.name, dataUrl }])
    }
    reader.readAsDataURL(file)
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
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
    >
      {/* Modals */}
      <ModelSelectorModal
        show={showModelPicker}
        selectedModel={selectedModel}
        onSelect={handleModelChange}
        onClose={() => setShowModelPicker(false)}
      />

      {/* Editing indicator */}
      {editingContext && (
        <div
          className="flex items-center justify-between"
          style={{
            marginBottom: '6px',
            padding: '3px 8px',
            borderRadius: '6px',
            background: 'rgba(99, 102, 241, 0.08)',
            border: '1px solid rgba(99, 102, 241, 0.25)',
            fontSize: '11px',
            color: 'var(--chatui-accent)',
          }}
        >
          <span style={{ opacity: 0.8 }}>Editing message</span>
          <button
            onClick={() => { setEditingContext(null); setText(''); setImages([]) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: '0 2px', fontSize: '13px', lineHeight: 1 }}
            title="Cancel edit"
          >
            ×
          </button>
        </div>
      )}

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

      {/* Textarea container */}
      <div
        className="textarea-glow"
        style={{
          background: 'var(--vscode-input-background)',
          border: isDragging ? '1px solid var(--chatui-accent)' : '1px solid var(--vscode-input-border, var(--vscode-panel-border))',
          borderRadius: 'var(--radius-md)',
          position: 'relative',
        }}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 10,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(99, 102, 241, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--chatui-accent)', fontWeight: 500 }}>
              Drop files to attach
            </span>
          </div>
        )}

        <textarea
          ref={textareaRef}
          autoFocus
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={ctrlEnterSend ? 'Type your message... (Ctrl+Enter to send)' : 'Type your message to Claude Code...'}
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
            outline: 'none',
            boxShadow: 'none',
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

            {/* Think — navigate to settings */}
            <button
              onClick={() => useUIStore.getState().setActiveView('settings')}
              className="cursor-pointer border-none flex items-center gap-1"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontWeight: 500,
                opacity: 0.85,
                color: 'var(--chatui-accent)',
                transition: 'all 0.2s ease',
              }}
              title="Think mode — open Settings"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4l2 2" />
              </svg>
              <span>Think</span>
            </button>

            <InputSep />

            {/* YOLO — navigate to settings */}
            <button
              onClick={() => useUIStore.getState().setActiveView('settings')}
              className="cursor-pointer border-none flex items-center gap-1"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontWeight: 500,
                opacity: yoloMode ? 1 : 0.5,
                color: yoloMode ? '#ef4444' : 'inherit',
                transition: 'all 0.2s ease',
              }}
              title="YOLO mode — open Settings"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = yoloMode ? '1' : '0.5' }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span>YOLO{yoloMode ? '' : ' · off'}</span>
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
                opacity: 0.5,
                color: 'inherit',
                transition: 'all 0.2s ease',
              }}
              title="Configure MCP servers"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--chatui-accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'inherit' }}
            >
              MCP
            </button>

            <InputSep />

            {/* Skills button */}
            <button
              onClick={() => useUIStore.getState().setShowSkillsModal(true)}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontWeight: 500,
                opacity: 0.5,
                color: 'inherit',
                transition: 'all 0.2s ease',
              }}
              title="Manage Skills"
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--chatui-accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'inherit' }}
            >
              Skills
            </button>

            <InputSep />

            {/* Discussion mode toggle */}
            <DiscussionToggle />

            <InputSep />

            {/* Send mode toggle */}
            <button
              onClick={() => setCtrlEnterSend(!ctrlEnterSend)}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontWeight: 500,
                opacity: 0.5,
                color: ctrlEnterSend ? 'var(--chatui-accent)' : 'inherit',
                transition: 'all 0.2s ease',
                fontSize: '10px',
              }}
              title={ctrlEnterSend ? 'Click to switch: Enter to send' : 'Click to switch: Ctrl+Enter to send'}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5' }}
            >
              {ctrlEnterSend ? 'Ctrl+⏎' : '⏎'}
            </button>

            {/* CLAUDE.md generate button */}
            {showClaudeMdBanner && (
              <>
                <InputSep />
                <button
                  onClick={() => {
                    useUIStore.getState().setShowClaudeMdBanner(false)
                    const store = useChatStore.getState()
                    markOptimisticUserInput()
                    store.addMessage({ type: 'userInput', data: { text: GENERATE_CLAUDE_MD_PROMPT } })
                    store.setProcessing(true)
                    store.addMessage({ type: 'loading', data: 'Claude is working...' })
                    useUIStore.getState().setRequestStartTime(Date.now())
                    postMessage({ type: 'sendMessage', text: GENERATE_CLAUDE_MD_PROMPT })
                  }}
                  disabled={isProcessing}
                  className="cursor-pointer border-none flex items-center gap-1"
                  style={{
                    background: 'transparent',
                    padding: '2px 4px',
                    fontWeight: 500,
                    opacity: isProcessing ? 0.3 : 0.7,
                    color: '#10b981',
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                  title="No CLAUDE.md detected — click to generate one"
                  onMouseEnter={(e) => { if (!isProcessing) e.currentTarget.style.opacity = '1' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = isProcessing ? '0.3' : '0.7' }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="12" y1="18" x2="12" y2="12"/>
                    <line x1="9" y1="15" x2="15" y2="15"/>
                  </svg>
                  <span>CLAUDE.md</span>
                </button>
              </>
            )}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Stop button (only visible when processing) */}
            {isProcessing && (
              <button
                onClick={handleStop}
                className="cursor-pointer flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--chatui-accent)',
                  border: 'none',
                  padding: '0',
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  color: '#fff',
                  transition: 'opacity 0.15s ease',
                  marginLeft: '2px',
                }}
                title="Stop"
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="2" y="2" width="12" height="12" rx="2" />
                </svg>
              </button>
            )}

            {/* Send button (only visible when not processing) */}
            {!isProcessing && (() => {
              const hasContent = !!(text.trim() || images.length > 0)
              return (
                <button
                  onClick={handleSend}
                  disabled={!hasContent}
                  className="cursor-pointer flex items-center justify-center shrink-0"
                  style={{
                    background: hasContent ? 'var(--chatui-accent)' : 'rgba(255, 255, 255, 0.08)',
                    border: 'none',
                    padding: '0',
                    width: '28px',
                    height: '28px',
                    borderRadius: '8px',
                    color: hasContent ? '#fff' : 'rgba(255, 255, 255, 0.3)',
                    transition: 'all 0.15s ease',
                    marginLeft: '2px',
                  }}
                  title="Send message"
                  onMouseEnter={(e) => { if (hasContent) e.currentTarget.style.opacity = '0.85' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 12V4" />
                    <path d="M4 7l4-4 4 4" />
                  </svg>
                </button>
              )
            })()}
          </div>
        </div>
      </div>

    </div>
  )
})

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

function DiscussionToggle() {
  const enabled = useDiscussionStore((s) => s.enabled)
  return (
    <button
      onClick={() => useDiscussionStore.getState().setEnabled(!enabled)}
      className="cursor-pointer border-none flex items-center gap-1"
      style={{
        background: 'transparent',
        padding: '2px 4px',
        fontWeight: 500,
        opacity: enabled ? 1 : 0.5,
        color: enabled ? '#8b5cf6' : 'inherit',
        transition: 'all 0.2s ease',
      }}
      title={enabled ? 'Discussion mode ON — click to disable' : 'Enable multi-agent discussion mode'}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = enabled ? '1' : '0.5' }}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
      <span style={{ fontSize: '11px' }}>Discuss</span>
    </button>
  )
}
