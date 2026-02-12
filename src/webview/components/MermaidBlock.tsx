import { useEffect, useRef, useState, useId } from 'react'

export function MermaidBlock({ code }: { code: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string>('')
  const uniqueId = useId().replace(/:/g, '-')

  useEffect(() => {
    let cancelled = false
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: 'var(--vscode-editor-font-family)',
      })
      mermaid.render(`mermaid-${uniqueId}`, code).then(({ svg: renderedSvg }) => {
        if (!cancelled) setSvg(renderedSvg)
      }).catch((err) => {
        if (!cancelled) setError(String(err))
      })
    })
    return () => { cancelled = true }
  }, [code, uniqueId])

  if (error) {
    return (
      <div
        className="my-2 overflow-hidden"
        style={{
          border: '1px solid rgba(255, 255, 255, 0.06)',
          borderRadius: '8px',
          padding: '12px',
          background: 'var(--vscode-textCodeBlock-background)',
        }}
      >
        <div style={{ fontSize: '11px', color: '#e74c3c', marginBottom: '8px' }}>Mermaid rendering error</div>
        <pre style={{ fontSize: '11px', opacity: 0.7, whiteSpace: 'pre-wrap', margin: 0 }}>{code}</pre>
      </div>
    )
  }

  if (!svg) {
    return (
      <div
        className="my-2 flex items-center gap-2"
        style={{ opacity: 0.5, fontSize: '12px', padding: '12px' }}
      >
        <div style={{ width: '14px', height: '14px', animation: 'spin 1s linear infinite', border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--chatui-accent)', borderRadius: '50%' }} />
        Rendering diagram...
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="my-2 overflow-x-auto"
      style={{
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '8px',
        padding: '16px',
        background: 'var(--vscode-textCodeBlock-background)',
        textAlign: 'center',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
