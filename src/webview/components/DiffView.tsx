import { useState, useMemo, useCallback } from 'react'
import { computeLineDiff, computeCharDiff, type CharDiffSegment } from '../utils'
import { postMessage } from '../hooks'

interface Props {
  oldContent: string
  newContent: string
  filePath: string
  startLine?: number
  startLines?: number[]
}

type ViewMode = 'unified' | 'split'
type LineType = 'add' | 'remove' | 'context'

interface DiffLineDisplay {
  type: LineType
  content: string
  oldLineNum?: number
  newLineNum?: number
}

// ---------------------------------------------------------------------------
// Language detection from file extension
// ---------------------------------------------------------------------------
const EXT_LANG: Record<string, string> = {
  ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust',
  java: 'java', kt: 'kotlin', cs: 'csharp', cpp: 'cpp', c: 'c', h: 'c',
  swift: 'swift', dart: 'dart', php: 'php', scala: 'scala',
  vue: 'html', html: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
  md: 'markdown', sql: 'sql', sh: 'bash', bash: 'bash', zsh: 'bash',
  xml: 'xml', svg: 'xml', graphql: 'graphql', lua: 'lua',
}

function detectLang(filePath: string): string | undefined {
  const ext = filePath.split('.').pop()?.toLowerCase()
  return ext ? EXT_LANG[ext] : undefined
}

// ---------------------------------------------------------------------------
// Hunk grouping — splits diff lines into hunks with @@ headers
// ---------------------------------------------------------------------------
interface Hunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLineDisplay[]
}

function buildHunks(lines: DiffLineDisplay[], contextSize = 3): Hunk[] {
  // Find changed line indices
  const changed: number[] = []
  lines.forEach((l, i) => { if (l.type !== 'context') changed.push(i) })
  if (changed.length === 0) return []

  // Group changed indices into ranges with context
  const ranges: [number, number][] = []
  let start = Math.max(0, changed[0] - contextSize)
  let end = Math.min(lines.length - 1, changed[0] + contextSize)

  for (let i = 1; i < changed.length; i++) {
    const cs = Math.max(0, changed[i] - contextSize)
    const ce = Math.min(lines.length - 1, changed[i] + contextSize)
    if (cs <= end + 1) {
      end = ce
    } else {
      ranges.push([start, end])
      start = cs
      end = ce
    }
  }
  ranges.push([start, end])

  return ranges.map(([s, e]) => {
    const hunkLines = lines.slice(s, e + 1)
    const firstOld = hunkLines.find(l => l.oldLineNum != null)?.oldLineNum ?? 1
    const firstNew = hunkLines.find(l => l.newLineNum != null)?.newLineNum ?? 1
    const oldCount = hunkLines.filter(l => l.type !== 'add').length
    const newCount = hunkLines.filter(l => l.type !== 'remove').length
    return { oldStart: firstOld, oldCount, newStart: firstNew, newCount, lines: hunkLines }
  })
}

// ---------------------------------------------------------------------------
// Inline char highlight renderer
// ---------------------------------------------------------------------------
function CharHighlight({ segments, mode }: { segments: CharDiffSegment[]; mode: 'delete' | 'insert' }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'equal') return <span key={i}>{seg.value}</span>
        if (mode === 'delete' && seg.type === 'delete') {
          return <span key={i} style={{ background: 'rgba(244, 67, 54, 0.3)', borderRadius: '2px' }}>{seg.value}</span>
        }
        if (mode === 'insert' && seg.type === 'insert') {
          return <span key={i} style={{ background: 'rgba(76, 175, 80, 0.3)', borderRadius: '2px' }}>{seg.value}</span>
        }
        return null
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pair up adjacent delete+insert lines for char-level diff
// ---------------------------------------------------------------------------
interface LinePair {
  deleteLine?: DiffLineDisplay
  insertLine?: DiffLineDisplay
  charDiff?: CharDiffSegment[]
}

function pairLines(lines: DiffLineDisplay[]): LinePair[] {
  const pairs: LinePair[] = []
  let i = 0
  while (i < lines.length) {
    if (lines[i].type === 'remove') {
      // Collect consecutive deletes
      const deletes: DiffLineDisplay[] = []
      while (i < lines.length && lines[i].type === 'remove') {
        deletes.push(lines[i])
        i++
      }
      // Collect consecutive inserts
      const inserts: DiffLineDisplay[] = []
      while (i < lines.length && lines[i].type === 'add') {
        inserts.push(lines[i])
        i++
      }
      // Pair them up
      const max = Math.max(deletes.length, inserts.length)
      for (let j = 0; j < max; j++) {
        const del = deletes[j]
        const ins = inserts[j]
        const charDiff = del && ins ? computeCharDiff(del.content, ins.content) : undefined
        pairs.push({ deleteLine: del, insertLine: ins, charDiff })
      }
    } else {
      pairs.push(lines[i].type === 'add' ? { insertLine: lines[i] } : { deleteLine: lines[i], insertLine: lines[i] })
      i++
    }
  }
  return pairs
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const FONT = "'Cascadia Code', 'SF Mono', Monaco, 'Fira Code', 'Courier New', monospace"
const LINE_HEIGHT = 1.6
const FONT_SIZE = '11.5px'

const lineNumStyle: React.CSSProperties = {
  width: '42px', minWidth: '42px', textAlign: 'right', padding: '0 8px 0 4px',
  fontSize: '10px', opacity: 0.35, userSelect: 'none', whiteSpace: 'nowrap',
  borderRight: '1px solid rgba(255,255,255,0.06)',
}

const bgColors = {
  add: 'rgba(46, 160, 67, 0.12)',
  remove: 'rgba(248, 81, 73, 0.12)',
  context: 'transparent',
}

const gutterColors = {
  add: 'rgba(46, 160, 67, 0.22)',
  remove: 'rgba(248, 81, 73, 0.22)',
  context: 'transparent',
}

const textColors = {
  add: 'var(--vscode-gitDecoration-addedResourceForeground, #3fb950)',
  remove: 'var(--vscode-gitDecoration-deletedResourceForeground, #f85149)',
  context: 'inherit',
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
const SplitIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 2h6v12H1V2zm8 0h6v12H9V2zM2 3v10h4V3H2zm8 0v10h4V3h-4z"/>
  </svg>
)

const UnifiedIcon = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
    <path d="M1 2h14v12H1V2zm1 1v10h12V3H2z"/>
  </svg>
)

// ---------------------------------------------------------------------------
// Toolbar button
// ---------------------------------------------------------------------------
function ToolBtn({ onClick, title, active, children }: {
  onClick: (e: React.MouseEvent) => void; title: string; active?: boolean; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: '24px', height: '24px', padding: 0,
        border: 'none', borderRadius: '4px', cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.1)' : 'transparent',
        color: 'inherit', opacity: active ? 0.9 : 0.45,
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = active ? '0.9' : '0.45'; (e.currentTarget as HTMLButtonElement).style.background = active ? 'rgba(255,255,255,0.1)' : 'transparent' }}
    >
      {children}
    </button>
  )
}

// ===========================================================================
// Main DiffView component
// ===========================================================================
export function DiffView({ oldContent, newContent, filePath, startLine }: Props) {
  const [collapsed, setCollapsed] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('unified')

  const fileName = filePath.split(/[\\/]/).pop() || 'file'
  const _lang = detectLang(filePath)

  const diff = useMemo(() => computeLineDiff(oldContent, newContent), [oldContent, newContent])

  const diffLines: DiffLineDisplay[] = useMemo(() =>
    diff.lines.map(line => ({
      type: line.type === 'insert' ? 'add' as const : line.type === 'delete' ? 'remove' as const : 'context' as const,
      content: line.content,
      oldLineNum: line.oldLineNumber,
      newLineNum: line.newLineNumber,
    })),
    [diff],
  )

  const hunks = useMemo(() => buildHunks(diffLines, 3), [diffLines])
  const { additions: addCount, deletions: removeCount } = diff

  // Handlers
  const handleOpenFile = useCallback(() => {
    postMessage({ type: 'openFile', filePath, line: startLine })
  }, [filePath, startLine])

  if (addCount === 0 && removeCount === 0) return null

  return (
    <div
      className="my-1.5 overflow-hidden"
      style={{
        border: '1px solid var(--vscode-panel-border)',
        borderRadius: '6px',
      }}
    >
      {/* ====================== HEADER ====================== */}
      <div
        className="flex items-center gap-1.5 cursor-pointer select-none"
        style={{
          padding: '6px 10px',
          background: 'var(--chatui-surface-1)',
          fontSize: '11px',
          fontWeight: 600,
          borderBottom: collapsed ? 'none' : '1px solid var(--vscode-panel-border)',
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <span style={{ fontSize: '9px', opacity: 0.5 }}>{collapsed ? '▶' : '▼'}</span>

        {/* File icon */}
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style={{ opacity: 0.5, flexShrink: 0 }}>
          <path d="M13.71 4.29l-3-3A1 1 0 0010 1H4a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V5a1 1 0 00-.29-.71zM13 13a1 1 0 01-1 1H4a1 1 0 01-1-1V3a1 1 0 011-1h5.59L13 5.41V13z"/>
        </svg>

        <button
          className="font-mono cursor-pointer border-none bg-transparent text-inherit p-0"
          style={{
            fontSize: 'inherit', fontWeight: 'inherit', opacity: 0.85,
            textDecoration: 'none', transition: 'opacity 0.15s, text-decoration 0.15s',
          }}
          onClick={(e) => { e.stopPropagation(); handleOpenFile() }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.textDecoration = 'underline' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; e.currentTarget.style.textDecoration = 'none' }}
          title={`Open ${filePath}`}
        >
          {fileName}
          {startLine ? <span style={{ opacity: 0.45, fontSize: '10px' }}>:{startLine}</span> : null}
        </button>

        {/* Stats badge */}
        <span style={{
          display: 'inline-flex', gap: '6px', marginLeft: '6px',
          fontSize: '10px', fontWeight: 700, fontFamily: FONT,
        }}>
          {addCount > 0 && <span style={{ color: textColors.add }}>+{addCount}</span>}
          {removeCount > 0 && <span style={{ color: textColors.remove }}>-{removeCount}</span>}
        </span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Toolbar — view toggle only */}
        <span className="flex items-center" onClick={e => e.stopPropagation()}>
          <ToolBtn
            onClick={() => setViewMode(viewMode === 'unified' ? 'split' : 'unified')}
            title={viewMode === 'unified' ? 'Switch to side-by-side view' : 'Switch to unified view'}
            active
          >
            {viewMode === 'unified' ? <UnifiedIcon /> : <SplitIcon />}
          </ToolBtn>
        </span>
      </div>

      {/* ====================== DIFF BODY ====================== */}
      {!collapsed && (
        viewMode === 'unified'
          ? <UnifiedView hunks={hunks} />
          : <SplitView hunks={hunks} />
      )}
    </div>
  )
}

// ===========================================================================
// Unified view
// ===========================================================================
function UnifiedView({ hunks }: { hunks: Hunk[] }) {
  return (
    <div className="overflow-x-auto" style={{ maxHeight: '400px', overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }}>
        <tbody>
          {hunks.map((hunk, hi) => {
            const pairs = pairLines(hunk.lines)
            return (
              <HunkGroup key={hi} hunk={hunk}>
                {pairs.map((pair, pi) => {
                  if (pair.deleteLine && pair.insertLine && pair.deleteLine.type === 'context') {
                    // Context line
                    const line = pair.deleteLine
                    return (
                      <tr key={pi} style={{ background: bgColors.context }}>
                        <td style={{ ...lineNumStyle, background: gutterColors.context }}>{line.oldLineNum ?? ''}</td>
                        <td style={{ ...lineNumStyle, background: gutterColors.context }}>{line.newLineNum ?? ''}</td>
                        <td style={{ padding: '0 12px', whiteSpace: 'pre' }}>
                          <span style={{ opacity: 0.45, userSelect: 'none' }}>{' '}</span>
                          <span style={{ opacity: 0.75 }}>{line.content}</span>
                        </td>
                      </tr>
                    )
                  }

                  const rows: React.ReactNode[] = []

                  // Delete line
                  if (pair.deleteLine) {
                    rows.push(
                      <tr key={`${pi}-d`} style={{ background: bgColors.remove }}>
                        <td style={{ ...lineNumStyle, background: gutterColors.remove }}>{pair.deleteLine.oldLineNum ?? ''}</td>
                        <td style={{ ...lineNumStyle, background: gutterColors.remove }}></td>
                        <td style={{ padding: '0 12px', whiteSpace: 'pre', color: textColors.remove }}>
                          <span style={{ opacity: 0.6, userSelect: 'none' }}>{'−'}</span>
                          {pair.charDiff
                            ? <CharHighlight segments={pair.charDiff} mode="delete" />
                            : <span>{pair.deleteLine.content}</span>
                          }
                        </td>
                      </tr>,
                    )
                  }

                  // Insert line
                  if (pair.insertLine) {
                    rows.push(
                      <tr key={`${pi}-i`} style={{ background: bgColors.add }}>
                        <td style={{ ...lineNumStyle, background: gutterColors.add }}></td>
                        <td style={{ ...lineNumStyle, background: gutterColors.add }}>{pair.insertLine.newLineNum ?? ''}</td>
                        <td style={{ padding: '0 12px', whiteSpace: 'pre', color: textColors.add }}>
                          <span style={{ opacity: 0.6, userSelect: 'none' }}>{'+'}</span>
                          {pair.charDiff
                            ? <CharHighlight segments={pair.charDiff} mode="insert" />
                            : <span>{pair.insertLine.content}</span>
                          }
                        </td>
                      </tr>,
                    )
                  }

                  return rows
                })}
              </HunkGroup>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ===========================================================================
// Split (side-by-side) view
// ===========================================================================
function SplitView({ hunks }: { hunks: Hunk[] }) {
  return (
    <div className="overflow-x-auto" style={{ maxHeight: '400px', overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: FONT_SIZE, lineHeight: LINE_HEIGHT }}>
        <tbody>
          {hunks.map((hunk, hi) => {
            const pairs = pairLines(hunk.lines)
            return (
              <HunkGroup key={hi} hunk={hunk} colSpan={5}>
                {pairs.map((pair, pi) => {
                  const isContext = pair.deleteLine && pair.insertLine && pair.deleteLine.type === 'context'

                  // Left side (old)
                  const leftBg = isContext ? bgColors.context : pair.deleteLine ? bgColors.remove : 'transparent'
                  const leftGutter = isContext ? gutterColors.context : pair.deleteLine ? gutterColors.remove : 'transparent'
                  const leftColor = isContext ? 'inherit' : pair.deleteLine ? textColors.remove : 'inherit'

                  // Right side (new)
                  const rightBg = isContext ? bgColors.context : pair.insertLine ? bgColors.add : 'transparent'
                  const rightGutter = isContext ? gutterColors.context : pair.insertLine ? gutterColors.add : 'transparent'
                  const rightColor = isContext ? 'inherit' : pair.insertLine ? textColors.add : 'inherit'

                  return (
                    <tr key={pi}>
                      {/* Left gutter */}
                      <td style={{ ...lineNumStyle, background: leftGutter, width: '36px', minWidth: '36px' }}>
                        {pair.deleteLine?.oldLineNum ?? ''}
                      </td>
                      {/* Left content */}
                      <td style={{
                        padding: '0 8px', whiteSpace: 'pre', color: leftColor,
                        background: leftBg, width: '50%', overflow: 'hidden',
                      }}>
                        {pair.deleteLine && (
                          <>
                            {!isContext && <span style={{ opacity: 0.6, userSelect: 'none' }}>{'−'}</span>}
                            {isContext && <span style={{ opacity: 0.45, userSelect: 'none' }}>{' '}</span>}
                            {pair.charDiff && !isContext
                              ? <CharHighlight segments={pair.charDiff} mode="delete" />
                              : <span style={{ opacity: isContext ? 0.75 : 1 }}>{pair.deleteLine.content}</span>
                            }
                          </>
                        )}
                      </td>
                      {/* Divider */}
                      <td style={{ width: '1px', background: 'rgba(255,255,255,0.06)', padding: 0 }} />
                      {/* Right gutter */}
                      <td style={{ ...lineNumStyle, background: rightGutter, width: '36px', minWidth: '36px' }}>
                        {pair.insertLine?.newLineNum ?? ''}
                      </td>
                      {/* Right content */}
                      <td style={{
                        padding: '0 8px', whiteSpace: 'pre', color: rightColor,
                        background: rightBg, width: '50%', overflow: 'hidden',
                      }}>
                        {pair.insertLine && !isContext && (
                          <>
                            <span style={{ opacity: 0.6, userSelect: 'none' }}>{'+'}</span>
                            {pair.charDiff
                              ? <CharHighlight segments={pair.charDiff} mode="insert" />
                              : <span>{pair.insertLine.content}</span>
                            }
                          </>
                        )}
                        {isContext && pair.insertLine && (
                          <>
                            <span style={{ opacity: 0.45, userSelect: 'none' }}>{' '}</span>
                            <span style={{ opacity: 0.75 }}>{pair.insertLine.content}</span>
                          </>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </HunkGroup>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ===========================================================================
// Hunk header row
// ===========================================================================
function HunkGroup({ hunk, colSpan = 3, children }: { hunk: Hunk; colSpan?: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td
          colSpan={colSpan}
          style={{
            padding: '3px 12px',
            fontSize: '10px',
            fontFamily: FONT,
            color: 'var(--vscode-descriptionForeground, rgba(255,255,255,0.45))',
            background: 'rgba(56, 139, 253, 0.08)',
            borderTop: '1px solid rgba(255,255,255,0.04)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
            userSelect: 'none',
          }}
        >
          @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
        </td>
      </tr>
      {children}
    </>
  )
}
