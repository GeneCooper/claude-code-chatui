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

  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length

  // Build LCS table
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

  // Backtrack to get diff
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

  // Only show lines near changes (context window)
  const CONTEXT = 3
  const changedIndices = new Set<number>()
  diffLines.forEach((line, idx) => {
    if (line.type !== 'context') {
      for (let c = Math.max(0, idx - CONTEXT); c <= Math.min(diffLines.length - 1, idx + CONTEXT); c++) {
        changedIndices.add(c)
      }
    }
  })

  if (addCount === 0 && removeCount === 0) {
    return null
  }

  return (
    <div className="border border-[var(--vscode-panel-border)] rounded-lg overflow-hidden text-xs my-1">
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--vscode-sideBar-background)] cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="opacity-60">{collapsed ? '▶' : '▼'}</span>
        <span className="font-mono opacity-80">{fileName}</span>
        {startLine && <span className="opacity-40">L{startLine}</span>}
        <span className="ml-auto flex gap-2">
          {addCount > 0 && (
            <span className="text-[var(--vscode-gitDecoration-addedResourceForeground)]">
              +{addCount}
            </span>
          )}
          {removeCount > 0 && (
            <span className="text-[var(--vscode-gitDecoration-deletedResourceForeground)]">
              -{removeCount}
            </span>
          )}
        </span>
      </div>

      {!collapsed && (
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full border-collapse font-mono text-[11px] leading-[1.4]">
            <tbody>
              {diffLines.map((line, idx) => {
                if (!changedIndices.has(idx)) {
                  // Show separator for skipped context
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

                const bgClass =
                  line.type === 'add'
                    ? 'bg-[rgba(40,167,69,0.15)]'
                    : line.type === 'remove'
                      ? 'bg-[rgba(215,58,73,0.15)]'
                      : ''

                const prefix =
                  line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '

                return (
                  <tr key={idx} className={bgClass}>
                    <td className="w-8 text-right pr-1 opacity-30 select-none">
                      {line.oldLineNum ?? ''}
                    </td>
                    <td className="w-8 text-right pr-1 opacity-30 select-none">
                      {line.newLineNum ?? ''}
                    </td>
                    <td className="px-2 whitespace-pre">
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
