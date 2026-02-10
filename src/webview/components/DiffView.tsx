import { useState, useMemo } from 'react'

interface Props {
  oldContent: string
  newContent: string
  filePath: string
  startLine?: number
  startLines?: number[]
}

interface DiffLine {
  type: 'add' | 'remove' | 'context'
  content: string
  oldLineNum?: number
  newLineNum?: number
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  const result: DiffLine[] = []

  const m = oldLines.length
  const n = newLines.length

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const diffOps: Array<{ type: 'keep' | 'add' | 'remove'; line: string; oldIdx?: number; newIdx?: number }> = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffOps.unshift({ type: 'keep', line: oldLines[i - 1], oldIdx: i, newIdx: j })
      i--
      j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffOps.unshift({ type: 'add', line: newLines[j - 1], newIdx: j })
      j--
    } else {
      diffOps.unshift({ type: 'remove', line: oldLines[i - 1], oldIdx: i })
      i--
    }
  }

  for (const op of diffOps) {
    if (op.type === 'keep') {
      result.push({ type: 'context', content: op.line, oldLineNum: op.oldIdx, newLineNum: op.newIdx })
    } else if (op.type === 'add') {
      result.push({ type: 'add', content: op.line, newLineNum: op.newIdx })
    } else {
      result.push({ type: 'remove', content: op.line, oldLineNum: op.oldIdx })
    }
  }

  return result
}

export function DiffView({ oldContent, newContent, filePath, startLine }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  const fileName = filePath.split(/[\\/]/).pop() || 'file'

  const diffLines = useMemo(
    () => computeDiff(oldContent, newContent),
    [oldContent, newContent],
  )

  const addCount = diffLines.filter((l) => l.type === 'add').length
  const removeCount = diffLines.filter((l) => l.type === 'remove').length

  const CONTEXT = 3
  const changedIndices = new Set<number>()
  diffLines.forEach((line, idx) => {
    if (line.type !== 'context') {
      for (let c = Math.max(0, idx - CONTEXT); c <= Math.min(diffLines.length - 1, idx + CONTEXT); c++) {
        changedIndices.add(c)
      }
    }
  })

  if (addCount === 0 && removeCount === 0) return null

  return (
    <div
      className="my-1 overflow-hidden"
      style={{
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: 'var(--radius-sm)',
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
        <span className="font-mono opacity-80">{fileName}</span>
        {startLine && <span className="opacity-40">L{startLine}</span>}
        <span className="ml-auto flex gap-2">
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
