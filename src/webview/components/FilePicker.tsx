import { useState, useEffect, useCallback } from 'react'
import { postMessage, onMessage } from '../lib/vscode'
import { useUIStore } from '../stores/uiStore'

interface FileItem {
  name: string
  path: string
  fsPath: string
}

interface Props {
  onSelect: (filePath: string) => void
}

export function FilePicker({ onSelect }: Props) {
  const show = useUIStore((s) => s.showFilePicker)
  const setShow = useUIStore((s) => s.setShowFilePicker)
  const [files, setFiles] = useState<FileItem[]>([])
  const [search, setSearch] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Listen for file list from extension
  useEffect(() => {
    const unsub = onMessage((msg) => {
      if (msg.type === 'workspaceFiles') {
        setFiles(msg.data as FileItem[])
        setSelectedIndex(0)
      }
    })
    return unsub
  }, [])

  // Request files when shown or search changes
  useEffect(() => {
    if (show) {
      postMessage({ type: 'getWorkspaceFiles', searchTerm: search || undefined })
    }
  }, [show, search])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!show || files.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex((i) => (i + 1) % files.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex((i) => (i - 1 + files.length) % files.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        onSelect(files[selectedIndex].path)
        setShow(false)
        setSearch('')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShow(false)
        setSearch('')
      }
    },
    [show, files, selectedIndex, onSelect, setShow],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  if (!show) return null

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase() || ''
    const codeExts = ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb', 'php']
    const markupExts = ['html', 'css', 'json', 'md', 'xml', 'yaml', 'yml', 'toml']
    const imageExts = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico']

    if (codeExts.includes(ext)) return '{ }'
    if (markupExts.includes(ext)) return '<>'
    if (imageExts.includes(ext)) return 'img'
    return 'file'
  }

  return (
    <>
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 49 }}
      onClick={() => { setShow(false); setSearch('') }}
    />
    <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--vscode-editorWidget-background)] border border-[var(--vscode-editorWidget-border)] rounded-lg shadow-lg z-50">
      <div className="px-3 py-2 border-b border-[var(--vscode-panel-border)]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search files..."
          autoFocus
          className="w-full px-2 py-1 text-xs bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded outline-none"
        />
      </div>

      <div className="max-h-52 overflow-y-auto">
        {files.length === 0 ? (
          <div className="px-3 py-2 text-xs opacity-40">No files found</div>
        ) : (
          files.map((file, idx) => (
            <button
              key={file.fsPath}
              onClick={() => {
                onSelect(file.path)
                setShow(false)
                setSearch('')
              }}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 cursor-pointer bg-transparent border-none text-inherit ${
                idx === selectedIndex
                  ? 'bg-[var(--vscode-list-activeSelectionBackground)] text-[var(--vscode-list-activeSelectionForeground)]'
                  : 'hover:bg-[var(--vscode-list-hoverBackground)]'
              }`}
            >
              <span className="opacity-40 font-mono text-[10px] w-6 text-center">{getFileIcon(file.name)}</span>
              <span className="truncate">{file.name}</span>
              <span className="opacity-30 truncate ml-auto text-[10px]">{file.path}</span>
            </button>
          ))
        )}
      </div>
    </div>
    </>
  )
}
