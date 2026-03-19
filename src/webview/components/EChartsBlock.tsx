import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { CopyButton } from './CopyButton'

let echartsModule: typeof import('echarts') | null = null
let echartsLoadPromise: Promise<void> | null = null

function loadECharts(): Promise<void> {
  if (echartsModule) return Promise.resolve()
  if (echartsLoadPromise) return echartsLoadPromise
  echartsLoadPromise = import('echarts').then((mod) => {
    echartsModule = mod
  })
  return echartsLoadPromise
}

interface Props {
  code: string
}

export const EChartsBlock = memo(function EChartsBlock({ code }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof import('echarts')['init']> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [showSource, setShowSource] = useState(false)

  const render = useCallback(async () => {
    try {
      await loadECharts()
      if (!echartsModule || !containerRef.current) return

      const option = JSON.parse(code.trim())

      // Dispose previous instance
      if (chartRef.current) {
        chartRef.current.dispose()
        chartRef.current = null
      }

      chartRef.current = echartsModule.init(containerRef.current, 'dark', {
        renderer: 'svg',
      })

      // Apply transparent background for dark theme integration
      chartRef.current.setOption({
        backgroundColor: 'transparent',
        ...option,
      })

      setReady(true)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ECharts render error')
      setReady(false)
    }
  }, [code])

  useEffect(() => { render() }, [render])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose()
        chartRef.current = null
      }
    }
  }, [])

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !chartRef.current) return
    const chart = chartRef.current
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [ready])

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
            ECHARTS
          </span>
          {ready && (
            <button
              onClick={() => setShowSource(!showSource)}
              className="cursor-pointer bg-transparent border-none text-inherit"
              style={{ fontSize: '10px', opacity: 0.5, padding: '0 4px' }}
            >
              {showSource ? '◆ Chart' : '◇ Source'}
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
            fontFamily: 'var(--vscode-editor-font-family, monospace)',
          }}>
            {code}
          </pre>
        </>
      ) : !showSource ? (
        <div
          ref={containerRef}
          style={{
            width: '100%',
            height: '400px',
            background: 'var(--vscode-editor-background)',
          }}
        />
      ) : (
        <pre style={{
          margin: 0, padding: '12px', fontSize: '12px',
          background: 'var(--vscode-editor-background)',
          overflowX: 'auto', whiteSpace: 'pre-wrap',
          fontFamily: 'var(--vscode-editor-font-family, monospace)',
          opacity: 0.7,
        }}>
          {code}
        </pre>
      )}
    </div>
  )
})
