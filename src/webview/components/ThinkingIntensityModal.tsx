import { useUIStore } from '../store'
import { useSettingsStore } from '../store'
import { postMessage, useFocusTrap } from '../hooks'


const LEVELS = [
  { key: 'low', label: 'Low', desc: 'Minimal reasoning - fastest response', icon: '💡' },
  { key: 'medium', label: 'Medium', desc: 'Balanced reasoning and speed', icon: '🧠' },
  { key: 'high', label: 'High', desc: 'Maximum reasoning depth', icon: '⚡' },
]

export function ThinkingIntensityModal() {
  const show = useUIStore((s) => s.showIntensityModal)
  const setShow = useUIStore((s) => s.setShowIntensityModal)
  const currentIntensity = useSettingsStore((s) => s.thinkingIntensity)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const focusTrapRef = useFocusTrap<HTMLDivElement>(show, () => setShow(false))

  if (!show) return null

  const handleSelect = (key: string) => {
    updateSettings({ thinkingIntensity: key })
    postMessage({ type: 'updateSettings', settings: { 'thinking.intensity': key } })
    setShow(false)
  }

  return (
    <div
      ref={focusTrapRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intensity-modal-title"
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
      onClick={(e) => { if (e.target === e.currentTarget) setShow(false) }}
    >
      <div
        style={{
          backgroundColor: 'var(--vscode-editor-background)',
          border: '1px solid var(--vscode-panel-border)',
          borderRadius: 'var(--radius-lg)',
          width: 'calc(100% - 32px)',
          maxWidth: '400px',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          animation: 'installFadeIn 0.2s ease-out',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span id="intensity-modal-title" style={{ fontWeight: 600, fontSize: '14px' }}>Effort Level</span>
          <button
            onClick={() => setShow(false)}
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

        {/* Levels */}
        <div style={{ padding: '12px' }}>
          {LEVELS.map((level) => {
            const isSelected = currentIntensity === level.key
            return (
              <button
                key={level.key}
                onClick={() => handleSelect(level.key)}
                className="w-full text-left cursor-pointer border-none text-inherit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 16px',
                  marginBottom: '4px',
                  borderRadius: 'var(--radius-md)',
                  border: isSelected
                    ? '1px solid var(--chatui-accent)'
                    : '1px solid transparent',
                  background: isSelected
                    ? 'rgba(237, 110, 29, 0.1)'
                    : 'transparent',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) e.currentTarget.style.background = 'transparent'
                }}
              >
                <span style={{ fontSize: '20px' }}>{level.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>
                    {level.label}
                    {isSelected && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--chatui-accent)' }}>
                        Current
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', opacity: 0.7 }}>
                    {level.desc}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
