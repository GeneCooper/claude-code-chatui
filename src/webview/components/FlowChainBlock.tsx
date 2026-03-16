import { memo, useState } from 'react'

// ============================================================================
// Flow Chain Detection
// ============================================================================

/** Connectors that indicate a flow chain: ──, →, ->, =>, ➜, ➔, ⟶ */
const FLOW_SEPARATORS = /\s*(?:──+|─+›|─+>|[→➜➔⟶⟹]|->|=>)\s*/

/** Detect if a text line is a flow chain (3+ nodes connected by flow separators) */
export function isFlowChain(text: string): boolean {
  const trimmed = text.trim()
  // Must not be inside a code block or be a markdown heading/list
  if (trimmed.startsWith('```') || trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('*')) return false
  const parts = trimmed.split(FLOW_SEPARATORS).filter(Boolean)
  return parts.length >= 3
}

/** Parse a flow chain text into nodes with optional annotations */
function parseFlowNodes(text: string): FlowNode[] {
  return text.trim().split(FLOW_SEPARATORS).filter(Boolean).map((raw) => {
    // Match "Name（annotation）" or "Name (annotation)"
    const match = raw.match(/^(.+?)\s*[（(](.+?)[）)]$/)
    if (match) {
      return { name: match[1].trim(), annotation: match[2].trim() }
    }
    // Match "Name x N" pattern like "ChainStepNode x N"
    const multMatch = raw.match(/^(.+?)\s*(x\s*\w+)$/)
    if (multMatch) {
      return { name: multMatch[1].trim(), annotation: multMatch[2].trim() }
    }
    return { name: raw.trim() }
  })
}

// ============================================================================
// Types
// ============================================================================

interface FlowNode {
  name: string
  annotation?: string
}

interface FlowChainBlockProps {
  text: string
}

// ============================================================================
// Component
// ============================================================================

export const FlowChainBlock = memo(function FlowChainBlock({ text }: FlowChainBlockProps) {
  const nodes = parseFlowNodes(text)
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>(
    nodes.length > 5 ? 'vertical' : 'horizontal'
  )

  const toggleDirection = () => setDirection(d => d === 'horizontal' ? 'vertical' : 'horizontal')

  const isVertical = direction === 'vertical'

  return (
    <div
      className="flow-chain-container"
      style={{
        margin: '8px 0',
        padding: '12px',
        borderRadius: '8px',
        background: 'var(--chatui-surface-1)',
        border: '1px solid var(--chatui-glass-border)',
        overflow: 'hidden',
      }}
    >
      {/* Direction toggle */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button
          onClick={toggleDirection}
          style={{
            background: 'none',
            border: '1px solid var(--chatui-glass-border)',
            borderRadius: '4px',
            color: 'var(--vscode-foreground)',
            opacity: 0.5,
            fontSize: '10px',
            padding: '2px 6px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
          }}
          title={isVertical ? 'Switch to horizontal' : 'Switch to vertical'}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {isVertical ? (
              <path d="M5 12h14M12 5l7 7-7 7" />
            ) : (
              <path d="M12 5v14M5 12l7 7 7-7" />
            )}
          </svg>
        </button>
      </div>

      {/* Flow nodes */}
      <div
        style={{
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          flexWrap: isVertical ? 'nowrap' : 'wrap',
          alignItems: isVertical ? 'flex-start' : 'center',
          gap: '0',
          overflowX: isVertical ? 'visible' : 'auto',
          paddingBottom: isVertical ? '0' : '4px',
        }}
      >
        {nodes.map((node, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              flexDirection: isVertical ? 'row' : 'row',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            {/* Node card */}
            <div
              className="flow-chain-node"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                background: i === 0
                  ? 'var(--chatui-accent-subtle)'
                  : 'var(--chatui-surface-2)',
                border: `1px solid ${i === 0 ? 'var(--chatui-accent, #6366f1)' : 'var(--chatui-glass-border)'}`,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                minWidth: '60px',
                textAlign: 'center',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <span
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: i === 0 ? 'var(--chatui-accent, #6366f1)' : 'var(--vscode-foreground)',
                  fontFamily: 'var(--vscode-editor-font-family)',
                  whiteSpace: 'nowrap',
                }}
              >
                {node.name}
              </span>
              {node.annotation && (
                <span
                  style={{
                    fontSize: '10px',
                    color: 'var(--vscode-foreground)',
                    opacity: 0.5,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {node.annotation}
                </span>
              )}
            </div>

            {/* Arrow connector */}
            {i < nodes.length - 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: isVertical ? '4px 0 4px 18px' : '0 4px',
                  flexShrink: 0,
                }}
              >
                {isVertical ? (
                  <svg width="12" height="20" viewBox="0 0 12 20" fill="none">
                    <path
                      d="M6 0 L6 14 M2 10 L6 16 L10 10"
                      stroke="var(--chatui-accent, #6366f1)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.5"
                    />
                  </svg>
                ) : (
                  <svg width="20" height="12" viewBox="0 0 20 12" fill="none">
                    <path
                      d="M0 6 L14 6 M10 2 L16 6 L10 10"
                      stroke="var(--chatui-accent, #6366f1)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.5"
                    />
                  </svg>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
})
