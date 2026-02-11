import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { postMessage, getState, setState } from '../hooks'
import { useChatStore } from '../store'
import { useUIStore } from '../store'
import { useSettingsStore } from '../store'
import { markOptimisticUserInput } from '../mutations'
import { SlashCommandPicker } from './SlashCommandPicker'
import { ThinkingIntensityModal } from './ThinkingIntensityModal'
import { ModelSelectorModal, MODELS } from './ModelSelectorModal'

export function InputArea() {
  const [text, setText] = useState('')
  const [agentMode, setAgentMode] = useState(true)
  const [ctrlEnterSend, setCtrlEnterSend] = useState(false)
  const [planMode, setPlanMode] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(true)
  const [selectedModel, setSelectedModel] = useState('default')
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [images, setImages] = useState<{ name: string; dataUrl: string }[]>([])
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const dragCountRef = useRef(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const yoloMode = useSettingsStore((s) => s.yoloMode)
  const [attachedFiles, setAttachedFiles] = useState<string[]>([])
  const [editorSelection, setEditorSelection] = useState<{ filePath: string; startLine: number; endLine: number; text: string } | null>(null)
  const { showSlashPicker, setShowSlashPicker, draftText, setDraftText } = useUIStore()

  const [slashFilter, setSlashFilter] = useState('')

  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string; planMode?: boolean; thinkingMode?: boolean; agentMode?: boolean; ctrlEnterSend?: boolean }>()
    if (saved?.draft) setText(saved.draft)
    if (saved?.model) setSelectedModel(saved.model)
    if (saved?.planMode !== undefined) setPlanMode(saved.planMode)
    if (saved?.thinkingMode !== undefined) setThinkingMode(saved.thinkingMode)
    if (saved?.agentMode !== undefined) setAgentMode(saved.agentMode)
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
    setState({ draft: text, model: selectedModel, planMode, thinkingMode, agentMode, ctrlEnterSend })
    debouncedSave(text)
  }, [text, selectedModel, planMode, thinkingMode, agentMode, ctrlEnterSend, debouncedSave])

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
        setAttachedFiles((prev) =>
          prev.includes(detail.filePath) ? prev : [...prev, detail.filePath]
        )
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('attachFileContext', handler)
    return () => window.removeEventListener('attachFileContext', handler)
  }, [])

  // Listen for editor text selection changes
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { filePath: string; startLine: number; endLine: number; text: string } | null
      setEditorSelection(detail)
    }
    window.addEventListener('editorSelection', handler)
    return () => window.removeEventListener('editorSelection', handler)
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

    // Agent mode: inject directive prefix for adaptive behavior
    const agentDirective = 'Think briefly, then give a concise and actionable answer.\n\n'
    const fullText = agentMode ? `${agentDirective}${userText}` : userText

    // Agent mode forces thinking on
    const effectiveThinking = agentMode ? true : thinkingMode
    const effectivePlan = agentMode ? false : planMode

    const imageData = images.length > 0 ? images.map((img) => img.dataUrl) : undefined

    // Optimistic update: immediately show message + processing state
    // This eliminates the IPC round-trip delay before the user sees their message
    const store = useChatStore.getState()
    markOptimisticUserInput()
    // Show only user's original text in the chat (without agent directive)
    store.addMessage({ type: 'userInput', data: { text: userText, images: imageData } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())

    // Then tell extension to process
    postMessage({
      type: 'sendMessage',
      text: fullText,
      planMode: effectivePlan,
      thinkingMode: effectiveThinking,
      model: selectedModel !== 'default' ? selectedModel : undefined,
      images: imageData,
    })
    setText('')
    setImages([])
    setAttachedFiles([])
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
        {/* Agent mode toggle */}
        <button
          onClick={() => setAgentMode(!agentMode)}
          className="flex items-center gap-1 cursor-pointer border-none"
          style={{
            padding: '2px 10px',
            borderRadius: '12px',
            border: `1px solid ${agentMode ? '#10b981' : 'var(--vscode-panel-border)'}`,
            background: agentMode ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
            color: agentMode ? '#10b981' : 'inherit',
            opacity: agentMode ? 1 : 0.7,
            transition: 'all 0.2s ease',
            boxShadow: agentMode ? '0 0 8px rgba(16, 185, 129, 0.2)' : 'none',
          }}
          title="Agent mode - Auto think, plan & parallelize based on task complexity"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2a4 4 0 014 4v1a2 2 0 012 2v1a4 4 0 01-2 3.5V15l3 4h-4l-1.5-2h-3L9 19H5l3-4v-1.5A4 4 0 016 10V9a2 2 0 012-2V6a4 4 0 014-4z" />
            <circle cx="10" cy="10" r="1" fill="currentColor" />
            <circle cx="14" cy="10" r="1" fill="currentColor" />
          </svg>
          <span>Agent</span>
        </button>

        {/* Manual Think/Plan controls (only visible when Agent mode is off) */}
        {!agentMode && (
          <>
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
          </>
        )}

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
              Drop files to attach
            </span>
          </div>
        )}
        <textarea
          ref={textareaRef}
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
