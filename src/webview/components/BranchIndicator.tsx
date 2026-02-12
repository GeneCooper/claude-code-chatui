
interface Props {
  parentTitle?: string
}

export function BranchIndicator({ parentTitle }: Props) {
  if (!parentTitle) return null

  return (
    <span
      className="flex items-center gap-1"
      style={{
        fontSize: '10px',
        opacity: 0.6,
        padding: '1px 6px',
        borderRadius: '8px',
        border: '1px solid var(--vscode-panel-border)',
        whiteSpace: 'nowrap',
        maxWidth: '150px',
      }}
      title={`Forked from: ${parentTitle}`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </svg>
      <span className="truncate">{parentTitle}</span>
    </span>
  )
}
