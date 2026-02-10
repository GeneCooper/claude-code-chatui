import { useState, useRef, useCallback, useEffect } from 'react'
import { postMessage } from '../lib/vscode'
import { useChatStore } from '../stores/chatStore'
import { useUIStore } from '../stores/uiStore'
import { SlashCommandPicker } from './SlashCommandPicker'
import { FilePicker } from './FilePicker'

export function InputArea() {
  const [text, setText] = useState('')
  const [planMode, setPlanMode] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const { showSlashPicker, showFilePicker, setShowSlashPicker, setShowFilePicker } = useUIStore()

  // Track slash command filter text
  const [slashFilter, setSlashFilter] = useState('')

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

    postMessage({ type: 'sendMessage', text: trimmed, planMode, thinkingMode })
    setText('')
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

  return (
    <div className="relative border-t border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
      {/* Pickers */}
      <SlashCommandPicker filter={slashFilter} onSelect={handleSlashSelect} />
      <FilePicker onSelect={handleFileSelect} />

      {/* Mode toggles */}
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
      </div>

      {/* Input row */}
      <div className="flex items-end gap-2 px-3 py-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
            disabled={!text.trim()}
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
