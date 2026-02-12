import { postMessage, useFocusTrap } from '../hooks'

const MODELS = [
  { value: 'claude-opus-4-6', label: 'Opus', desc: 'Most capable, complex tasks', color: '#a78bfa', icon: '★' },
  { value: 'claude-sonnet-4-5-20250929', label: 'Sonnet', desc: 'Fast and balanced', color: '#60a5fa', icon: '◆' },
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku', desc: 'Lightweight and quick', color: '#4ade80', icon: '●' },
  { value: 'default', label: 'Default', desc: 'User configured model', color: '#9ca3af', icon: '○' },
]

interface Props {
  show: boolean
  selectedModel: string
  onSelect: (model: string) => void
  onClose: () => void
}

export { MODELS }

export function ModelSelectorModal({ show, selectedModel, onSelect, onClose }: Props) {
  const focusTrapRef = useFocusTrap<HTMLDivElement>(show, onClose)

  if (!show) return null

  const handleSelect = (value: string) => {
    onSelect(value)
    onClose()
  }

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="model-modal-title"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          width: 'calc(100% - 32px)',
          maxWidth: '360px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          animation: 'installFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span id="model-modal-title" style={{ fontWeight: 600, fontSize: '14px' }}>Select Model</span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--vscode-foreground)',
              cursor: 'pointer',
              fontSize: '16px',
              padding: '4px',
              opacity: 0.6,
            }}
          >
            {'✕'}
          </button>
        </div>

        {/* Model list */}
        <div style={{ padding: '12px 16px' }}>
          <div className="flex flex-col gap-2">
            {MODELS.map((model) => (
              <button
                key={model.value}
                onClick={() => handleSelect(model.value)}
                className="flex items-center gap-3 cursor-pointer border-none text-left text-inherit w-full"
                style={{
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  border: model.value === selectedModel ? `1px solid ${model.color}` : '1px solid transparent',
                  background: model.value === selectedModel ? `${model.color}15` : 'rgba(128, 128, 128, 0.04)',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (model.value !== selectedModel) {
                    e.currentTarget.style.background = 'rgba(128, 128, 128, 0.1)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (model.value !== selectedModel) {
                    e.currentTarget.style.background = 'rgba(128, 128, 128, 0.04)'
                  }
                }}
              >
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: 'var(--radius-sm)',
                    background: `${model.color}20`,
                    color: model.color,
                    fontSize: '16px',
                  }}
                >
                  {model.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{model.label}</div>
                  <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>{model.desc}</div>
                </div>
                {model.value === selectedModel && (
                  <span style={{ color: model.color, fontSize: '14px' }}>✓</span>
                )}
              </button>
            ))}
          </div>

          {/* Configure in Terminal */}
          <div
            className="flex items-center gap-1.5 cursor-pointer"
            style={{
              marginTop: '12px',
              paddingTop: '12px',
              borderTop: '1px solid var(--vscode-panel-border)',
              fontSize: '12px',
              opacity: 0.6,
              transition: 'all 0.2s ease',
            }}
            onClick={() => {
              postMessage({ type: 'openModelTerminal' })
              onClose()
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--chatui-accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.color = 'inherit' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span>Configure in Terminal</span>
          </div>
        </div>
      </div>
    </div>
  )
}
