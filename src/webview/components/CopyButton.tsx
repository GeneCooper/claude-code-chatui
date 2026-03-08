import { useState, useCallback, memo } from 'react'

interface CopyButtonProps {
  text: string
  label?: string
  className?: string
  style?: React.CSSProperties
  children?: (copied: boolean) => React.ReactNode
}

export const CopyButton = memo(function CopyButton({ text, label, className, style, children }: CopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }, [text])

  return (
    <button
      onClick={handleCopy}
      className={className || 'cursor-pointer border-none'}
      aria-label={copied ? 'Copied' : 'Copy to clipboard'}
      style={{
        background: 'none',
        color: copied ? '#4ade80' : 'var(--vscode-descriptionForeground)',
        padding: '4px 8px',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        opacity: copied ? 1 : 0.7,
        fontSize: '11px',
        transition: 'all 0.2s ease',
        ...style,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = copied ? '1' : '0.7' }}
    >
      {children ? children(copied) : (copied ? 'Copied!' : (label || 'Copy'))}
    </button>
  )
})
