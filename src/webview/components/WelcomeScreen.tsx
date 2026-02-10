const HINTS = [
  { label: 'Fix a bug', prompt: 'Help me fix a bug in ' },
  { label: 'Write tests', prompt: 'Write comprehensive tests for ' },
  { label: 'Explain code', prompt: 'Explain how this code works: ' },
  { label: 'Refactor', prompt: 'Refactor this code for better readability: ' },
  { label: 'Code review', prompt: 'Review this code for issues: ' },
  { label: 'Performance', prompt: 'Analyze this code for performance issues: ' },
]

interface Props {
  onHintClick: (text: string) => void
}

export function WelcomeScreen({ onHintClick }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 gap-6">
      <div className="text-center">
        <div className="text-3xl mb-2 opacity-20">{'{ }'}</div>
        <h2 className="text-base font-medium opacity-70 m-0">Claude Code</h2>
        <p className="text-xs opacity-40 mt-1">AI-powered coding assistant</p>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
        {HINTS.map((hint) => (
          <button
            key={hint.label}
            onClick={() => onHintClick(hint.prompt)}
            className="px-3 py-2 text-[11px] rounded-lg border border-[var(--vscode-panel-border)] bg-transparent text-inherit opacity-60 hover:opacity-100 hover:border-[var(--vscode-focusBorder)] cursor-pointer transition-all text-left"
          >
            {hint.label}
          </button>
        ))}
      </div>

      <div className="text-center text-[10px] opacity-30 space-y-1">
        <p>Type <span className="font-mono">/</span> for commands, <span className="font-mono">@</span> for files</p>
        <p>Shift+Enter for new line</p>
      </div>
    </div>
  )
}
