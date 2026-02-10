import { useState, useRef, useCallback, useEffect } from 'react'
import { postMessage, getState, setState } from '../lib/vscode'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { SlashCommandPicker } from './SlashCommandPicker'
import { FilePicker } from './FilePicker'

const MODELS = [
  { value: 'default', label: 'Default' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5' },
  { value: 'claude-opus-4-6', label: 'Opus 4.6' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
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

  // Track slash command filter text
  const [slashFilter, setSlashFilter] = useState('')

  // Restore draft from webview state on mount
  useEffect(() => {
    const saved = getState<{ draft?: string; model?: string }>()
    if (saved?.draft) {
      setText(saved.draft)
    }
    if (saved?.model) {
      setSelectedModel(saved.model)
    }
  }, [])

  // Save draft to webview state on change
  useEffect(() => {
    setState({ draft: text, model: selectedModel })
  }, [text, selectedModel])

  // Pick up draft text from welcome screen hints
  useEffect(() => {
    if (draftText) {
      setText(draftText)
      setDraftText('')
      textareaRef.current?.focus()
    }
  }, [draftText, setDraftText])

  // Auto-resize textarea
  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 150)}px`
  }, [])

  useEffect(() => {
    adjustHeight()
  }, [text, adjustHeight])

  const handleSend = () => {
    const trimmed = text.trim()
    if (!trimmed || isProcessing) return

    // Check if it's a slash command
    if (trimmed.startsWith('/')) {
      const cmd = trimmed.substring(1).split(/\s+/)[0]
      postMessage({ type: 'executeSlashCommand', command: cmd })
      setText('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
      return
    }

    // Attach image data if present
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

  const handleStop = () => {
    postMessage({ type: 'stopRequest' })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Don't handle Enter when pickers are open
    if (showSlashPicker || showFilePicker) return

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setText(value)

    // Check for slash command trigger
    if (value === '/' || (value.startsWith('/') && !value.includes(' '))) {
      setSlashFilter(value.substring(1))
      setShowSlashPicker(true)
      setShowFilePicker(false)
    } else if (!value.startsWith('/')) {
      setShowSlashPicker(false)
    }

    // Check for @ file reference trigger
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

  // Handle paste for images
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

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const files = e.dataTransfer.files
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        addImageFile(file)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

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
      // Execute native command directly
      postMessage({ type: 'executeSlashCommand', command })
      setText('')
    } else {
      // Insert snippet command as message
      setText(`/${command} `)
    }
    setShowSlashPicker(false)
    textareaRef.current?.focus()
  }

  const handleFileSelect = (filePath: string) => {
    // Replace the @... with @filepath
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

  const currentModelLabel = MODELS.find((m) => m.value === selectedModel)?.label || 'Default'

  return (
    <div
      className="relative border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      {/* Pickers */}
      <SlashCommandPicker filter={slashFilter} onSelect={handleSlashSelect} />
      <FilePicker onSelect={handleFileSelect} />

      {/* Image previews */}
      {images.length > 0 && (
        <div className="flex gap-2 px-3 pt-2 flex-wrap">
          {images.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.dataUrl}
                alt={img.name}
                className="w-12 h-12 rounded border border-[var(--vscode-panel-border)] object-cover"
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

      {/* Mode toggles + model selector */}
      <div className="flex items-center gap-2 px-3 pt-2">
        <ModeToggle
          label="Plan"
          active={planMode}
          onClick={() => setPlanMode(!planMode)}
        />
        <ModeToggle
          label="Think"
          active={thinkingMode}
          onClick={() => setThinkingMode(!thinkingMode)}
        />

        {/* Model selector */}
        <div className="relative ml-auto">
          <button
            onClick={() => setShowModelPicker(!showModelPicker)}
            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] cursor-pointer bg-transparent text-inherit opacity-50 hover:opacity-80"
          >
            {currentModelLabel}
          </button>
          {showModelPicker && (
            <div className="absolute bottom-full right-0 mb-1 bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-editorWidget-border)] rounded-lg shadow-lg z-50 min-w-[140px]">
              {MODELS.map((model) => (
                <button
                  key={model.value}
                  onClick={() => handleModelChange(model.value)}
                  className={`w-full text-left px-3 py-1.5 text-xs cursor-pointer border-none text-inherit ${
                    model.value === selectedModel
                      ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                      : 'bg-transparent hover:bg-[var(--vscode-list-hoverBackground)]'
                  }`}
                >
                  {model.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Image upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-input-border)] cursor-pointer bg-transparent text-inherit opacity-50 hover:opacity-80"
          title="Upload image"
        >
          IMG
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
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder="Message Claude... (/ for commands, @ for files)"
          rows={1}
          className="flex-1 resize-none rounded-md px-3 py-2 text-sm bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] text-[var(--vscode-input-foreground,inherit)] focus:outline-none focus:border-[var(--vscode-focusBorder)] placeholder:opacity-40"
          disabled={isProcessing}
        />

        {isProcessing ? (
          <button
            onClick={handleStop}
            className="px-3 py-2 rounded-md text-sm bg-red-700 text-white hover:bg-red-600 cursor-pointer border-none shrink-0"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim() && images.length === 0}
            className="px-3 py-2 rounded-md text-sm bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] cursor-pointer border-none shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}

function ModeToggle({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
        active
          ? 'bg-[#ed6e1d] text-white border-[#ed6e1d]'
          : 'bg-transparent border-[var(--vscode-input-border)] opacity-50 hover:opacity-80 text-inherit'
      }`}
    >
      {label}
    </button>
  )
}
