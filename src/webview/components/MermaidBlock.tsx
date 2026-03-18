import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { CopyButton } from './CopyButton'

let mermaidInstance: typeof import('mermaid')['default'] | null = null
let mermaidLoadPromise: Promise<void> | null = null
let idCounter = 0

function loadMermaid(): Promise<void> {
  if (mermaidInstance) return Promise.resolve()
  if (mermaidLoadPromise) return mermaidLoadPromise
  mermaidLoadPromise = import('mermaid').then((mod) => {
    mermaidInstance = mod.default
    mermaidInstance.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: 'transparent',
        primaryColor: '#6366f1',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#4f46e5',
        lineColor: '#64748b',
        secondaryColor: '#1e293b',
        tertiaryColor: '#0f172a',
        fontFamily: 'var(--vscode-font-family, system-ui, sans-serif)',
        fontSize: '13px',
      },
      flowchart: { curve: 'basis', padding: 12 },
      sequence: { mirrorActors: false },
    })
  })
  return mermaidLoadPromise
}

interface Props {
  code: string
}

export const MermaidBlock = memo(function MermaidBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const idRef = useRef(`mermaid-${++idCounter}`)

  const render = useCallback(async () => {
    try {
      await loadMermaid()
      if (!mermaidInstance) return
      const { svg: rendered } = await mermaidInstance.render(idRef.current, code.trim())
      setSvg(rendered)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Mermaid render error')
      setSvg(null)
    }
  }, [code])

  useEffect(() => { render() }, [render])

  return (
    <div
      className="my-2 overflow-hidden"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '8px',
        background: 'var(--vscode-textCodeBlock-background)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '5px 10px',
          background: 'var(--chatui-surface-2)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '11px',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontFamily: 'var(--vscode-editor-font-family)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            fontSize: '10px',
          }}>
            MERMAID
          </span>
          {svg && (
            <button
              onClick={() => setShowSource(!showSource)}
              className="cursor-pointer bg-transparent border-none text-inherit"
              style={{ fontSize: '10px', opacity: 0.5, padding: '0 4px' }}
            >
              {showSource ? '◆ Diagram' : '◇ Source'}
            </button>
          )}
        </div>
        <CopyButton text={code} />
      </div>

      {/* Content */}
      {error ? (
        <>
          <div style={{ padding: '8px 12px', fontSize: '11px', color: '#f87171', opacity: 0.8 }}>
            Render failed: {error}
          </div>
          <pre style={{
            margin: 0, padding: '12px', fontSize: '12px',
            background: 'var(--vscode-editor-background)',
            overflowX: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {code}
          </pre>
        </>
      ) : svg && !showSource ? (
        <div
          ref={containerRef}
          className="mermaid-diagram"
          style={{
            padding: '16px',
            display: 'flex', justifyContent: 'center',
            overflowX: 'auto',
            background: 'var(--vscode-editor-background)',
          }}
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <pre style={{
          margin: 0, padding: '12px', fontSize: '12px',
          background: 'var(--vscode-editor-background)',
          overflowX: 'auto', whiteSpace: 'pre-wrap',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          opacity: svg ? 0.7 : 1,
        }}>
          {!svg && <span style={{ opacity: 0.5, fontSize: '11px' }}>Loading diagram...</span>}
          {(showSource || !svg) && code}
        </pre>
      )}
    </div>
  )
})
