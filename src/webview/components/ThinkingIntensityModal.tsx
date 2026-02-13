import { useEffect, useRef } from 'react'
import { useSettingsStore } from '../store'
import { postMessage } from '../hooks'

const LEVELS = [
  { key: 'think', label: 'Think', desc: 'Standard reasoning' },
  { key: 'think-hard', label: 'Think Hard', desc: 'Deeper analysis' },
  { key: 'think-harder', label: 'Think Harder', desc: 'Multi-angle reasoning' },
  { key: 'ultrathink', label: 'Ultrathink', desc: 'Maximum depth' },
]

interface ThinkingPopoverProps {
  show: boolean
  onClose: () => void
  thinkingMode: boolean
  onToggle: (enabled: boolean) => void
}

export function ThinkingPopover({ show, onClose, thinkingMode, onToggle }: ThinkingPopoverProps) {
  const currentIntensity = useSettingsStore((s) => s.thinkingIntensity)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!show) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [show, onClose])

  useEffect(() => {
    if (!show) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [show, onClose])

  if (!show) return null

  const handleSelect = (key: string) => {
    updateSettings({ thinkingIntensity: key })
    postMessage({ type: 'updateSettings', settings: { thinkingIntensity: key } })
    if (!thinkingMode) onToggle(true)
    onClose()
  }

  return (
    <div
      ref={popoverRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: '6px',
        width: '240px',
        backgroundColor: 'var(--vscode-editor-background)',
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
        zIndex: 100,
        animation: 'fadeIn 0.12s ease-out',
      }}
    >
      {/* Toggle row */}
      <button
        onClick={() => { onToggle(!thinkingMode); if (thinkingMode) onClose() }}
        className="w-full text-left cursor-pointer border-none text-inherit flex items-center justify-between"
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--vscode-panel-border)',
          background: 'transparent',
          fontSize: '13px',
          fontWeight: 600,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)' }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
      >
        <span>Think Mode</span>
        <span
          style={{
            width: '32px',
            height: '18px',
            borderRadius: '9px',
            background: thinkingMode ? '#3b82f6' : 'rgba(255,255,255,0.15)',
            position: 'relative',
            display: 'inline-block',
            transition: 'background 0.2s ease',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: '2px',
              left: thinkingMode ? '16px' : '2px',
              width: '14px',
              height: '14px',
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s ease',
            }}
          />
        </span>
      </button>

      {/* Intensity levels */}
      <div style={{ padding: '4px' }}>
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
                gap: '10px',
                padding: '8px 10px',
                borderRadius: 'var(--radius-md)',
                background: isSelected
                  ? 'rgba(59, 130, 246, 0.15)'
                  : 'transparent',
                borderLeft: isSelected
                  ? '3px solid #3b82f6'
                  : '3px solid transparent',
                opacity: thinkingMode ? 1 : 0.4,
                transition: 'all 0.12s ease',
                fontSize: '12px',
              }}
              onMouseEnter={(e) => {
                if (thinkingMode && !isSelected) e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = isSelected
                  ? 'rgba(59, 130, 246, 0.15)'
                  : 'transparent'
              }}
            >
              {/* Radio indicator */}
              <span
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: isSelected
                    ? '2px solid #3b82f6'
                    : '2px solid rgba(255,255,255,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  transition: 'border-color 0.12s ease',
                }}
              >
                {isSelected && (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#3b82f6',
                    }}
                  />
                )}
              </span>

              {/* Label + desc */}
              <div style={{ flex: 1 }}>
                <span style={{
                  fontWeight: isSelected ? 600 : 500,
                  color: isSelected ? '#3b82f6' : 'inherit',
                }}>
                  {level.label}
                </span>
                <span style={{ opacity: 0.45, marginLeft: '6px', fontSize: '11px' }}>
                  {level.desc}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
