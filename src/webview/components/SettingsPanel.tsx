import { useEffect } from 'react'
import { postMessage } from '../hooks'
import { useSettingsStore } from '../store'
import { useUIStore } from '../store'

// ============================================================================
// Shared styles
// ============================================================================

const cardStyle: React.CSSProperties = {
  background: 'var(--chatui-surface-2, rgba(255,255,255,0.06))',
  borderRadius: '8px',
  padding: '14px 16px',
  border: '1px solid var(--chatui-glass-border, rgba(255,255,255,0.08))',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  marginBottom: '8px',
  color: 'var(--vscode-editor-foreground)',
}

const descStyle: React.CSSProperties = {
  fontSize: '11px',
  opacity: 0.65,
  marginTop: '6px',
  lineHeight: 1.5,
}

// ============================================================================
// Effort Level Selector
// ============================================================================

const EFFORT_LEVELS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'max', label: 'Max' },
] as const

function EffortSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const idx = EFFORT_LEVELS.findIndex((l) => l.value === value)
  const activeIdx = idx >= 0 ? idx : 0

  // Colors from left (cool) to right (warm)
  const dotColors = ['rgba(255,255,255,0.3)', '#6366f1', '#f59e0b', '#ef4444']
  const activeColor = dotColors[activeIdx]

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600 }}>Effort</span>
        <span style={{ fontSize: '12px', opacity: 0.7 }}>({EFFORT_LEVELS[activeIdx].label})</span>
      </div>

      {/* Slider track */}
      <div style={{ position: 'relative', padding: '8px 0' }}>
        {/* Track background */}
        <div style={{
          height: '4px',
          borderRadius: '2px',
          background: 'rgba(255,255,255,0.1)',
          position: 'relative',
        }}>
          {/* Active fill */}
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            height: '100%',
            width: `${(activeIdx / (EFFORT_LEVELS.length - 1)) * 100}%`,
            borderRadius: '2px',
            background: activeColor,
            transition: 'all 0.2s ease',
          }} />
        </div>

        {/* Dots */}
        <div className="flex justify-between" style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          transform: 'translateY(-50%)',
          padding: '0',
        }}>
          {EFFORT_LEVELS.map((level, i) => {
            const isActive = i <= activeIdx
            const isCurrent = i === activeIdx
            return (
              <button
                key={level.value}
                onClick={() => onChange(level.value)}
                className="cursor-pointer border-none"
                style={{
                  width: isCurrent ? '16px' : '10px',
                  height: isCurrent ? '16px' : '10px',
                  borderRadius: '50%',
                  background: isActive ? activeColor : 'rgba(255,255,255,0.2)',
                  border: isCurrent ? '2px solid #fff' : 'none',
                  padding: 0,
                  transition: 'all 0.2s ease',
                  boxShadow: isCurrent ? '0 0 6px rgba(0,0,0,0.3)' : 'none',
                }}
                title={level.label}
              />
            )
          })}
        </div>
      </div>

      {/* Labels */}
      <div className="flex justify-between" style={{ marginTop: '6px' }}>
        {EFFORT_LEVELS.map((level, i) => (
          <button
            key={level.value}
            onClick={() => onChange(level.value)}
            className="cursor-pointer border-none bg-transparent"
            style={{
              fontSize: '10px',
              opacity: i === activeIdx ? 1 : 0.4,
              fontWeight: i === activeIdx ? 600 : 400,
              color: i === activeIdx ? activeColor : 'var(--vscode-editor-foreground)',
              padding: '2px 4px',
              transition: 'all 0.2s ease',
            }}
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main SettingsPanel
// ============================================================================

export function SettingsPanel() {
  const { effortLevel, yoloMode } = useSettingsStore()
  const setActiveView = useUIStore((s) => s.setActiveView)

  useEffect(() => {
    postMessage({ type: 'getSettings' })
  }, [])

  const updateSetting = (key: string, value: unknown) => {
    postMessage({ type: 'updateSettings', settings: { [key]: value } })
    if (key === 'effortLevel') {
      useSettingsStore.getState().updateSettings({ effortLevel: value as string })
    } else if (key === 'yoloMode') {
      useSettingsStore.getState().updateSettings({ yoloMode: value as boolean })
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--vscode-editor-background)' }}>
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--chatui-glass-border, rgba(255,255,255,0.08))',
          background: 'var(--chatui-surface-1, rgba(255,255,255,0.03))',
        }}
      >
        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Settings</h3>
        <button
          onClick={() => setActiveView('chat')}
          className="cursor-pointer border-none"
          style={{
            fontSize: '12px',
            padding: '4px 12px',
            borderRadius: '6px',
            background: 'rgba(255,255,255,0.08)',
            color: 'var(--vscode-editor-foreground)',
            opacity: 0.8,
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'rgba(255,255,255,0.12)' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.8'; e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
        >
          {'<-'} Back to Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Effort Level */}
        <div style={cardStyle}>
          <EffortSelector value={effortLevel} onChange={(v) => updateSetting('effortLevel', v)} />
          <p style={descStyle}>
            Controls thinking depth. Higher levels prepend thinking prompts to guide Claude's reasoning.
          </p>
        </div>

        {/* YOLO Mode */}
        <div style={cardStyle}>
          <label className="flex items-center gap-3 cursor-pointer" style={{ marginBottom: '4px' }}>
            <div
              onClick={() => updateSetting('yoloMode', !yoloMode)}
              style={{
                width: '36px',
                height: '20px',
                borderRadius: '10px',
                background: yoloMode ? 'var(--chatui-accent)' : 'rgba(255,255,255,0.15)',
                position: 'relative',
                cursor: 'pointer',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: '2px',
                left: yoloMode ? '18px' : '2px',
                transition: 'left 0.2s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }} />
            </div>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>YOLO Mode</span>
            {yoloMode && (
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: 'rgba(34, 197, 94, 0.15)',
                color: '#22c55e',
                fontWeight: 600,
              }}>Default ON</span>
            )}
          </label>
          <p style={descStyle}>
            Skip all permission prompts. Claude will execute tools without asking for approval. Safe with Git version control.
          </p>
        </div>

      </div>
    </div>
  )
}
