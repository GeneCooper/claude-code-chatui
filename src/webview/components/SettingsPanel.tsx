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
// Agent Mode Selector
// ============================================================================

const AGENT_MODES = [
  { value: 'fast', label: 'Fast', desc: 'Minimal thinking, act immediately', icon: '\u26A1', color: 'var(--chatui-accent)' },
  { value: 'deep', label: 'Deep', desc: 'Balanced reasoning and execution', icon: '\uD83E\uDDE0', color: '#22c55e' },
  { value: 'precise', label: 'Precise', desc: 'Thorough analysis, verify before acting', icon: '\uD83C\uDFAF', color: '#f59e0b' },
] as const

function AgentModeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      {AGENT_MODES.map((mode) => {
        const selected = value === mode.value
        return (
          <button
            key={mode.value}
            onClick={() => onChange(mode.value)}
            className="cursor-pointer border-none text-left"
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: '8px',
              background: selected ? `color-mix(in srgb, ${mode.color} 12%, transparent)` : 'rgba(255,255,255,0.04)',
              border: selected ? `1.5px solid color-mix(in srgb, ${mode.color} 50%, transparent)` : '1.5px solid transparent',
              color: 'var(--vscode-editor-foreground)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!selected) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'
              }
            }}
            onMouseLeave={(e) => {
              if (!selected) {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
                e.currentTarget.style.borderColor = 'transparent'
              }
            }}
          >
            <div style={{ fontSize: '18px', marginBottom: '6px' }}>{mode.icon}</div>
            <div style={{
              fontSize: '13px',
              fontWeight: 600,
              color: selected ? mode.color : 'inherit',
              marginBottom: '2px',
            }}>
              {mode.label}
            </div>
            <div style={{ fontSize: '10px', opacity: 0.55, lineHeight: 1.3 }}>{mode.desc}</div>
          </button>
        )
      })}
    </div>
  )
}

// ============================================================================
// Main SettingsPanel
// ============================================================================

export function SettingsPanel() {
  const { thinkingIntensity, yoloMode } = useSettingsStore()
  const setActiveView = useUIStore((s) => s.setActiveView)

  useEffect(() => {
    postMessage({ type: 'getSettings' })
  }, [])

  const updateSetting = (key: string, value: unknown) => {
    postMessage({ type: 'updateSettings', settings: { [key]: value } })
    if (key === 'thinking.intensity') {
      useSettingsStore.getState().updateSettings({ thinkingIntensity: value as string })
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
        {/* Agent Mode */}
        <div style={cardStyle}>
          <div style={sectionTitleStyle}>Agent Mode</div>
          <AgentModeSelector value={thinkingIntensity} onChange={(v) => updateSetting('thinking.intensity', v)} />
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
