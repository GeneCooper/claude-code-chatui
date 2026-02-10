import { useState } from 'react'

interface Props {
  text: string
}

export function ThinkingBlock({ text }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-xs opacity-60 hover:opacity-80 bg-[var(--vscode-sideBar-background)] cursor-pointer border-none text-inherit text-left"
      >
        <span className={`transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
        <span>Thinking...</span>
        <span className="ml-auto text-[10px] opacity-50">
          {text.length > 100 ? `${Math.ceil(text.length / 4)} words` : ''}
        </span>
      </button>
      {expanded && (
        <div className="px-3 py-2 text-xs opacity-70 whitespace-pre-wrap border-t border-[var(--vscode-panel-border)] max-h-60 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  )
}
