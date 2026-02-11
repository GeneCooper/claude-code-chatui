import { useState, useMemo, useCallback } from 'react'
import { computeLineDiff } from '../utils'
import { postMessage } from '../hooks'

interface Props {
  oldContent: string
  newContent: string
  filePath: string
  startLine?: number
  startLines?: number[]
}

export function DiffView({ oldContent, newContent, filePath, startLine }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const [reverted, setReverted] = useState(false)
  const fileName = filePath.split(/[\\/]/).pop() || 'file'

  const diff = useMemo(
    () => computeLineDiff(oldContent, newContent),
    [oldContent, newContent],
  )

  // Map diff lines to display format
  const diffLines = useMemo(() => {
    return diff.lines.map((line) => ({
      type: line.type === 'insert' ? 'add' as const : line.type === 'delete' ? 'remove' as const : 'context' as const,
      content: line.content,
      oldLineNum: line.oldLineNumber,
      newLineNum: line.newLineNumber,
    }))
  }, [diff])

  const addCount = diff.additions
  const removeCount = diff.deletions

  const CONTEXT = 3
  const changedIndices = useMemo(() => {
    const indices = new Set<number>()
    diffLines.forEach((line, idx) => {
      if (line.type !== 'context') {
        for (let c = Math.max(0, idx - CONTEXT); c <= Math.min(diffLines.length - 1, idx + CONTEXT); c++) {
          indices.add(c)
        }
      }
    })
    return indices
  }, [diffLines])

  const handleOpenFile = useCallback(() => {
    postMessage({ type: 'openFile', filePath, line: startLine })
  }, [filePath, startLine])

  const handleOpenDiff = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    postMessage({ type: 'openDiff', oldContent, newContent, filePath })
  }, [oldContent, newContent, filePath])

  const handleRevert = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    postMessage({ type: 'revertFile', filePath, oldContent })
    setReverted(true)
  }, [filePath, oldContent])

  if (addCount === 0 && removeCount === 0) return null

  return (
    <div
      className="my-1 overflow-hidden"
      style={{
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: 'var(--radius-sm)',
        opacity: reverted ? 0.5 : 1,
      }}
    >
      {/* Diff header */}
      <div
        className="flex items-center gap-2 cursor-pointer select-none"
        style={{
          padding: '8px 12px',
          background: 'var(--vscode-panel-background)',
          fontSize: '11px',
          fontWeight: 600,
          borderBottom: collapsed ? 'none' : '1px solid var(--vscode-panel-border)',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="opacity-60">{collapsed ? '\u25B6' : '\u25BC'}</span>
        <button
          className="font-mono opacity-80 cursor-pointer border-none bg-transparent text-inherit p-0 hover:underline"
          style={{ fontSize: 'inherit', fontWeight: 'inherit' }}
          onClick={(e) => { e.stopPropagation(); handleOpenFile() }}
          title={filePath}
        >
          {fileName}
        </button>
        {startLine && <span className="opacity-40">L{startLine}</span>}
        <span className="ml-auto flex items-center gap-2">
          {addCount > 0 && (
            <span style={{ color: 'var(--vscode-gitDecoration-addedResourceForeground, rgba(76, 175, 80, 0.9))' }}>
              +{addCount}
            </span>
          )}
          {removeCount > 0 && (
            <span style={{ color: 'var(--vscode-gitDecoration-deletedResourceForeground, rgba(244, 67, 54, 0.9))' }}>
              -{removeCount}
            </span>
          )}
          {/* Action buttons */}
          <button
            className="cursor-pointer border-none bg-transparent p-0 opacity-40 hover:opacity-100"
            style={{ fontSize: '12px', color: 'inherit', lineHeight: 1 }}
            onClick={handleOpenDiff}
            title="Open in VS Code diff editor"
          >
            <span style={{ fontFamily: 'codicon', fontSize: '14px' }}>&#xEA61;</span>
          </button>
          {!reverted && (
            <button
              className="cursor-pointer border-none bg-transparent p-0 opacity-40 hover:opacity-100"
              style={{ fontSize: '12px', color: 'inherit', lineHeight: 1 }}
              onClick={handleRevert}
              title="Revert changes"
            >
              <span style={{ fontFamily: 'codicon', fontSize: '14px' }}>&#xEB99;</span>
            </button>
          )}
          {reverted && (
            <span className="text-[10px] opacity-60">reverted</span>
          )}
        </span>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full border-collapse" style={{ fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace", fontSize: '12px', lineHeight: 1.5 }}>
            <tbody>
              {diffLines.map((line, idx) => {
                if (!changedIndices.has(idx)) {
                  const prevShown = idx > 0 && changedIndices.has(idx - 1)
                  if (prevShown) {
                    return (
                      <tr key={`sep-${idx}`}>
                        <td colSpan={3} className="text-center opacity-30 py-0.5 text-[10px]">
                          ···
                        </td>
                      </tr>
                    )
                  }
                  return null
                }

                const bgStyle: React.CSSProperties =
                  line.type === 'add'
                    ? { background: 'rgba(76, 175, 80, 0.1)' }
                    : line.type === 'remove'
                      ? { background: 'rgba(244, 67, 54, 0.1)' }
                      : { opacity: 0.8 }

                const textColor =
                  line.type === 'add'
                    ? 'var(--vscode-gitDecoration-addedResourceForeground, rgba(76, 175, 80, 0.9))'
                    : line.type === 'remove'
                      ? 'var(--vscode-gitDecoration-deletedResourceForeground, rgba(244, 67, 54, 0.9))'
                      : undefined

                const prefix =
                  line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '

                return (
                  <tr key={idx} style={{ ...bgStyle, color: textColor }}>
                    <td className="w-8 text-right pr-1 opacity-30 select-none" style={{ padding: '2px 4px' }}>
                      {line.oldLineNum ?? ''}
                    </td>
                    <td className="w-8 text-right pr-1 opacity-30 select-none" style={{ padding: '2px 4px' }}>
                      {line.newLineNum ?? ''}
                    </td>
                    <td style={{ padding: '2px 12px', whiteSpace: 'pre' }}>
                      <span className="opacity-50 select-none">{prefix}</span>
                      {line.content}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
