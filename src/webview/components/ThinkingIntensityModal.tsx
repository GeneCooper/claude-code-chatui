import { useUIStore } from '../store'
import { useSettingsStore } from '../store'
import { postMessage } from '../hooks'

const LEVELS = [
  { key: 'think', label: 'Think', desc: 'Basic reasoning - fastest response', icon: '💡' },
  { key: 'think-hard', label: 'Think Hard', desc: 'More detailed reasoning', icon: '🧠' },
  { key: 'think-harder', label: 'Think Harder', desc: 'Extended reasoning for complex tasks', icon: '🔬' },
  { key: 'ultrathink', label: 'Ultrathink', desc: 'Maximum reasoning depth', icon: '⚡' },
]

interface Props {
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

export function ThinkingIntensityModal({ enabled, onToggle }: Props) {
  const show = useUIStore((s) => s.showIntensityModal)
  const setShow = useUIStore((s) => s.setShowIntensityModal)
  const currentIntensity = useSettingsStore((s) => s.thinkingIntensity)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  if (!show) return null

  const handleSelect = (key: string) => {
    updateSettings({ thinkingIntensity: key })
    postMessage({ type: 'updateSettings', settings: { 'thinking.intensity': key } })
    if (!enabled) onToggle(true)
    setShow(false)
  }

  const handleToggle = () => {
    onToggle(!enabled)
    if (enabled) setShow(false)
  }

  return (
    <div
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
        {/* Header with toggle */}
        <div
          style={{
            padding: '16px',
            borderBottom: '1px solid var(--vscode-panel-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontWeight: 600, fontSize: '14px' }}>Thinking Mode</span>
          <div className="flex items-center gap-3">
            {/* On/Off toggle */}
            <div
              onClick={handleToggle}
              className="cursor-pointer"
              style={{
                width: '40px',
                height: '22px',
                borderRadius: '11px',
                background: enabled ? 'var(--chatui-accent)' : 'rgba(128, 128, 128, 0.3)',
                position: 'relative',
                transition: 'background 0.2s ease',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  background: '#fff',
                  position: 'absolute',
                  top: '2px',
                  left: enabled ? '20px' : '2px',
                  transition: 'left 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                }}
              />
            </div>
            {/* Close */}
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
        </div>

        {/* Levels */}
        <div style={{ padding: '12px', opacity: enabled ? 1 : 0.4, pointerEvents: enabled ? 'auto' : 'none', transition: 'opacity 0.2s ease' }}>
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
