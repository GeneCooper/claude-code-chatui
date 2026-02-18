import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { postMessage, getState, setState } from '../hooks'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { useSettingsStore } from '../store'
import { useQueueStore } from '../store'
import { markOptimisticUserInput } from '../mutations'
import { SlashCommandPicker } from './SlashCommandPicker'
import { ThinkingIntensityModal } from './ThinkingIntensityModal'
import { ModelSelectorModal, MODELS } from './ModelSelectorModal'

export function InputArea() {
  const [text, setText] = useState('')
  const [ctrlEnterSend, setCtrlEnterSend] = useState(false)
  const [planMode, setPlanMode] = useState(true)
  const [thinkingMode, setThinkingMode] = useState(true)
  const [continueMode, setContinueMode] = useState(false)
  const [selectedModel, setSelectedModel] = useState('default')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCountRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const sessionId = useChatStore((s) => s.sessionId)
  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [editorSelection, setEditorSelection] = useState<{ filePath: string; startLine: number; endLine: number; text: string } | null>(null)
  const [activeFile, setActiveFile] = useState<{ filePath: string; languageId: string } | null>(null)
  const thinkingIntensity = useSettingsStore((s) => s.thinkingIntensity)
  const showSlashPicker = useUIStore((s) => s.showSlashPicker)
  const setShowSlashPicker = useUIStore((s) => s.setShowSlashPicker)
  const draftText = useUIStore((s) => s.draftText)
  const setDraftText = useUIStore((s) => s.setDraftText)

  const [slashFilter, setSlashFilter] = useState('')

  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string; planMode?: boolean; thinkingMode?: boolean; ctrlEnterSend?: boolean }>()
    if (saved?.draft) setText(saved.draft)
    if (saved?.model) setSelectedModel(saved.model)
    if (saved?.planMode !== undefined) setPlanMode(saved.planMode)
    if (saved?.thinkingMode !== undefined) setThinkingMode(saved.thinkingMode)
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
    setState({ draft: text, model: selectedModel, planMode, thinkingMode, ctrlEnterSend, sessionId })
  }, [text, selectedModel, thinkingMode, ctrlEnterSend, sessionId])

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
        setAttachedFiles((prev) =>
          prev.includes(detail.filePath) ? prev : [...prev, detail.filePath]
        )
        textareaRef.current?.focus()
      }
    }
    const onEditorSelection = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filePath: string; startLine: number; endLine: number; text: string } | null
      setEditorSelection(detail)
    }
    const onActiveFile = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filePath: string; languageId: string } | null
      setActiveFile(detail)
    }
    const onModelRestored = (e: Event) => {
      const detail = (e as CustomEvent).detail as { model: string }
      if (detail?.model) setSelectedModel(detail.model)
    }

    window.addEventListener('imageFilePicked', onImagePicked)
    window.addEventListener('clipboardContent', onClipboard)
    window.addEventListener('attachFileContext', onAttachFile)
    window.addEventListener('editorSelection', onEditorSelection)
    window.addEventListener('activeFileChanged', onActiveFile)
    window.addEventListener('modelRestored', onModelRestored)
    return () => {
      window.removeEventListener('imageFilePicked', onImagePicked)
      window.removeEventListener('clipboardContent', onClipboard)
      window.removeEventListener('attachFileContext', onAttachFile)
      window.removeEventListener('editorSelection', onEditorSelection)
      window.removeEventListener('activeFileChanged', onActiveFile)
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
    const hasFiles = attachedFiles.length > 0
    if ((!trimmed && images.length === 0 && !hasFiles) || isProcessing) return

    if (trimmed.startsWith('/')) {
      const cmd = trimmed.substring(1).split(/\s+/)[0]
      postMessage({ type: 'executeSlashCommand', command: cmd })
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    // Prepend attached file paths as @references
    const fileRefs = attachedFiles.map((f) => `@${f}`).join(' ')
    // Include editor selection context if present
    const selRef = editorSelection
      ? `@${editorSelection.filePath}#${editorSelection.startLine}-${editorSelection.endLine}`
      : ''
    const refs = [fileRefs, selRef].filter(Boolean).join(' ')
    const userText = refs ? `${refs} ${trimmed}` : trimmed

    const imageData = images.length > 0 ? images.map((img) => img.dataUrl) : undefined

    // Optimistic update: immediately show message + processing state
    // This eliminates the IPC round-trip delay before the user sees their message
    const store = useChatStore.getState()
    markOptimisticUserInput()
    store.addMessage({ type: 'userInput', data: { text: userText, images: imageData } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())

    // Then tell extension to process
    postMessage({
      type: 'sendMessage',
      text: userText,
      planMode,
      thinkingMode,
      continueConversation: continueMode,
      model: selectedModel !== 'default' ? selectedModel : undefined,
      images: imageData,
    })
    setText('')
    setImages([])
    setAttachedFiles([])
    setContinueMode(false) // one-shot: auto-disable after first send
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleStop = () => { postMessage({ type: 'stopRequest' }) }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashPicker) return
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
    const value = e.target.value
    setText(value)

    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setSlashFilter(value.substring(1))
      setShowSlashPicker(true)
    } else if (!value.startsWith('/')) {
      setShowSlashPicker(false)
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
    dragCountRef.current = 0
    setIsDragging(false)

    const toFileUri = (p: string) =>
      p.startsWith('file://') ? p : `file:///${p.replace(/\\/g, '/')}`
    const isFilePath = (s: string) =>
      s.startsWith('file://') || s.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(s)

    // Collect all URIs from every available dataTransfer format (de-duplicated)
    const seen = new Set<string>()
    const uris: string[] = []
    const addUri = (u: string) => {
      if (!seen.has(u)) { seen.add(u); uris.push(u) }
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
        postMessage({ type: 'showInfo', data: `图片 "${fileName}" 尺寸过大（${img.width}x${img.height}），已自动缩放至 ${canvas.width}x${canvas.height}。` })
        resolve(resized)
      }
      img.src = dataUrl
    })
  }

  const addImageFile = (file: File) => {
    if (file.size > MAX_IMAGE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(1)
      postMessage({ type: 'showWarning', data: `图片 "${file.name}" 太大（${sizeMB}MB），最大支持 5MB。请压缩后重试。` })
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = await resizeImageIfNeeded(reader.result as string, file.name)
      setImages((prev) => [...prev, { name: file.name, dataUrl }])
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
      {/* Pickers & Modals */}
      <SlashCommandPicker filter={slashFilter} onSelect={handleSlashSelect} />
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
        {/* Think toggle */}
        <button
          onClick={() => useUIStore.getState().setShowIntensityModal(true)}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            border: `1px solid ${thinkingMode ? 'var(--chatui-accent)' : 'var(--vscode-panel-border)'}`,
            background: thinkingMode ? 'rgba(237, 110, 29, 0.1)' : 'transparent',
            color: thinkingMode ? 'var(--chatui-accent)' : 'inherit',
            opacity: thinkingMode ? 1 : 0.7,
            transition: 'all 0.2s ease',
          }}
          title="Think mode"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4l2 2" />
          </svg>
          <span>Think{thinkingMode ? ` · ${thinkingIntensity}` : ''}</span>
        </button>

        {/* Plan toggle */}
        <button
          onClick={() => setPlanMode(!planMode)}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            border: `1px solid ${planMode ? '#3b82f6' : 'var(--vscode-panel-border)'}`,
            background: planMode ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
            color: planMode ? '#3b82f6' : 'inherit',
            opacity: planMode ? 1 : 0.7,
            transition: 'all 0.2s ease',
          }}
          title="Plan mode - Claude plans before executing"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="2" />
          </svg>
          <span>PLAN</span>
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

        {/* Continue mode — only useful when no active session */}
        {!sessionId && (
          <button
            onClick={() => setContinueMode(!continueMode)}
            className="flex items-center gap-1 cursor-pointer border-none"
            style={{
              padding: '2px 10px',
              borderRadius: '12px',
              border: `1px solid ${continueMode ? '#8b5cf6' : 'var(--vscode-panel-border)'}`,
              background: continueMode ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
              color: continueMode ? '#8b5cf6' : 'inherit',
              opacity: continueMode ? 1 : 0.7,
              transition: 'all 0.2s ease',
            }}
            title="Continue last conversation — resumes the most recent Claude session"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 .49-3.75" />
            </svg>
            <span>Continue</span>
          </button>
        )}
      </div>

      {/* Attached files & editor selection */}
      {(attachedFiles.length > 0 || editorSelection) && (
        <div className="flex gap-1.5 pb-2 flex-wrap">
          {/* Editor selection chip */}
          {editorSelection && (
            <span
              className="flex items-center gap-1"
              style={{
                padding: '2px 6px 2px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                background: 'rgba(100, 149, 237, 0.1)',
                color: 'var(--vscode-textLink-foreground)',
                border: '1px solid rgba(100, 149, 237, 0.2)',
              }}
            >
              <span className="truncate" style={{ maxWidth: '220px' }}>
                {editorSelection.filePath}#{editorSelection.startLine}-{editorSelection.endLine}
              </span>
              <span style={{ opacity: 0.6, fontSize: '10px' }}>
                ({editorSelection.endLine - editorSelection.startLine + 1} lines)
              </span>
            </span>
          )}

          {/* Attached file chips */}
          {attachedFiles.map((file) => (
            <span
              key={file}
              className="flex items-center gap-1"
              style={{
                padding: '2px 6px 2px 8px',
                fontSize: '11px',
                borderRadius: '4px',
                background: 'rgba(237, 110, 29, 0.1)',
                color: 'var(--chatui-accent)',
                border: '1px solid rgba(237, 110, 29, 0.2)',
              }}
            >
              <span className="truncate" style={{ maxWidth: '200px' }}>{file}</span>
              <button
                onClick={() => setAttachedFiles((prev) => prev.filter((f) => f !== file))}
                className="cursor-pointer border-none bg-transparent flex items-center justify-center"
                style={{
                  color: 'inherit',
                  opacity: 0.6,
                  padding: '0 2px',
                  fontSize: '13px',
                  lineHeight: 1,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6' }}
              >
                ×
              </button>
            </span>
          ))}
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
              background: 'rgba(237, 110, 29, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--chatui-accent)', fontWeight: 500 }}>
              Hold Shift + Drop to attach files
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

            <InputSep />

            {/* Send mode toggle */}
            <button
              onClick={() => setCtrlEnterSend(!ctrlEnterSend)}
              className="cursor-pointer border-none"
              style={{
                background: 'transparent',
                padding: '2px 4px',
                fontWeight: 500,
                opacity: 0.7,
                color: ctrlEnterSend ? 'var(--chatui-accent)' : 'inherit',
                transition: 'all 0.2s ease',
                fontSize: '10px',
              }}
              title={ctrlEnterSend ? 'Click to switch: Enter to send' : 'Click to switch: Ctrl+Enter to send'}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.7' }}
            >
              {ctrlEnterSend ? 'Ctrl+⏎' : '⏎'}
            </button>
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1">
            {/* Attach file button */}
            <button
              onClick={() => postMessage({ type: 'pickWorkspaceFile' })}
              className="cursor-pointer flex items-center justify-center"
              style={{
                background: 'transparent',
                border: '1px solid var(--vscode-panel-border, rgba(255,255,255,0.15))',
                padding: '0',
                width: '24px',
                height: '24px',
                borderRadius: 'var(--radius-md)',
                color: 'inherit',
                opacity: 0.7,
                transition: 'all 0.15s ease',
              }}
              title="Attach workspace file"
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                e.currentTarget.style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.opacity = '0.7'
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

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
              const hasContent = !!(text.trim() || images.length > 0 || attachedFiles.length > 0)
              return (
                <>
                  {/* Queue button — shown in YOLO mode when there's content */}
                  {yoloMode && hasContent && (
                    <button
                      onClick={() => {
                        const trimmed = text.trim()
                        if (!trimmed) return
                        const fileRefs = attachedFiles.map((f) => `@${f}`).join(' ')
                        const selRef = editorSelection
                          ? `@${editorSelection.filePath}#${editorSelection.startLine}-${editorSelection.endLine}`
                          : ''
                        const refs = [fileRefs, selRef].filter(Boolean).join(' ')
                        const prompt = refs ? `${refs} ${trimmed}` : trimmed
                        useQueueStore.getState().addItem({ prompt, planMode, thinkingMode, model: selectedModel !== 'default' ? selectedModel : undefined })
                        setText('')
                        setImages([])
                        setAttachedFiles([])
                        if (textareaRef.current) textareaRef.current.style.height = 'auto'
                      }}
                      className="cursor-pointer flex items-center justify-center shrink-0"
                      style={{
                        background: 'rgba(237, 110, 29, 0.1)',
                        border: '1px solid rgba(237, 110, 29, 0.35)',
                        padding: '0 8px',
                        height: '28px',
                        borderRadius: '8px',
                        color: 'var(--chatui-accent)',
                        fontSize: '11px',
                        fontWeight: 600,
                        transition: 'all 0.15s ease',
                        marginLeft: '2px',
                        whiteSpace: 'nowrap',
                      }}
                      title="Add to task queue (runs after current task)"
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(237, 110, 29, 0.2)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(237, 110, 29, 0.1)' }}
                    >
                      + Queue
                    </button>
                  )}
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
                </>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Bottom status bar: permission mode + active file */}
      <div
        className="flex items-center gap-2"
        style={{
          fontSize: '11px',
          opacity: 0.6,
          padding: '4px 2px 0',
          minHeight: '20px',
        }}
      >
        {activeFile && (
          <>
            <span style={{ opacity: 0.4 }}>·</span>
            <span className="flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.85 4.44l-3.28-3.3A.5.5 0 0 0 10.21 1H3.5A1.5 1.5 0 0 0 2 2.5v11A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V4.8a.5.5 0 0 0-.15-.36zM10 2l3 3h-2.5a.5.5 0 0 1-.5-.5V2z" />
              </svg>
              <span className="truncate" style={{ maxWidth: '200px' }}>{activeFile.filePath}</span>
            </span>
          </>
        )}
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
