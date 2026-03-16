import { memo, useState } from 'react'

// ============================================================================
// Tree Structure Detection & Parsing
// ============================================================================

/** Characters that indicate tree structure content */
const TREE_CONNECTOR_CHARS = /[├└┌┐┘┤┬┴┼│]/

/** Detect if a text block contains tree structure patterns */
export function isTreeStructure(text: string): boolean {
  if (!TREE_CONNECTOR_CHARS.test(text)) return false
  // Must have at least one tree branch connector (├ or └)
  return /[├└]/.test(text)
}

interface TreeNode {
  name: string
  annotation?: string
  children: TreeNode[]
  isDirectory?: boolean
}

/**
 * Parse tree text into a tree data structure.
 * Handles both multi-line (indented) and single-line (connectors inline) formats.
 */
function parseTree(text: string): TreeNode[] {
  const lines = text.split('\n').filter(l => l.trim().length > 0)

  // Check if it's truly multi-line with proper structure
  const hasMultiLines = lines.length > 1 && lines.some(l => /^\s*[├└│]/.test(l))

  if (hasMultiLines) {
    return parseMultiLineTree(lines)
  }

  // Single-line or few lines without proper indentation — try to reconstruct
  const fullText = lines.join(' ')
  return parseSingleLineTree(fullText)
}

/**
 * Parse multi-line tree format:
 * ```
 * Root
 * ├─ Child1
 * │  └─ Grandchild
 * └─ Child2
 * ```
 */
function parseMultiLineTree(lines: string[]): TreeNode[] {
  const roots: TreeNode[] = []

  interface StackEntry {
    node: TreeNode
    depth: number
  }
  const stack: StackEntry[] = []

  for (const line of lines) {
    // Calculate depth by counting leading whitespace and tree chars
    const stripped = line.replace(/^[\s│|]*/, '')
    const connectorMatch = stripped.match(/^[├└┌┐┤┬┴┼]─+\s*/)
    const depth = (line.length - line.trimStart().length) +
      (line.match(/│/g) || []).length

    const nodeText = connectorMatch
      ? stripped.slice(connectorMatch[0].length)
      : stripped.replace(/^─+\s*/, '')

    if (!nodeText.trim()) continue

    const node = createNode(nodeText.trim())

    if (stack.length === 0 || depth === 0) {
      // Root level
      roots.push(node)
      stack.length = 0
      stack.push({ node, depth })
    } else {
      // Pop stack until we find the parent
      while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
        stack.pop()
      }
      const parent = stack[stack.length - 1]
      parent.node.children.push(node)
      stack.push({ node, depth })
    }
  }

  return roots
}

/**
 * Parse single-line tree format where everything is on one line:
 * "Root └─ Child ├─ Sub1 ├─ Sub2 └─ Sub3"
 */
function parseSingleLineTree(text: string): TreeNode[] {
  // Split by tree connectors, keeping the connector type
  const segments = text.split(/\s*([├└]─+)\s*/).filter(Boolean)

  if (segments.length === 0) return []

  // First segment is the root (or could contain "label: root" pattern)
  const rootText = segments[0].trim()
  const root = createNode(rootText)
  const roots: TreeNode[] = [root]

  // Track parent stack for nested └─ (last child = go up)
  const parentStack: TreeNode[] = [root]
  let lastConnector = ''

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i].trim()

    // Is this a connector?
    if (/^[├└]─+$/.test(seg)) {
      lastConnector = seg
      continue
    }

    if (!seg) continue

    const node = createNode(seg)
    const parent = parentStack[parentStack.length - 1]

    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }

    // If ├─: sibling follows (stay at same level)
    // If └─: last child at this level, but next item could be a new branch
    if (lastConnector.startsWith('├')) {
      // More siblings expected — don't push to stack
    } else if (lastConnector.startsWith('└')) {
      // Last child — next connector starts at parent level
      // But also push this node as potential parent for deeper nesting
    }

    // Always allow children under this node
    parentStack.push(node)

    lastConnector = ''
  }

  return roots
}

/** Create a TreeNode from text like "ComponentName (annotation)" or "folder/" */
function createNode(text: string): TreeNode {
  const isDir = text.endsWith('/')

  // Match "Name（annotation）" or "Name (annotation)"
  const match = text.match(/^(.+?)\s*[（(](.+?)[）)]$/)
  if (match) {
    return {
      name: match[1].trim(),
      annotation: match[2].trim(),
      children: [],
      isDirectory: isDir,
    }
  }

  // Match "Name x N (annotation)" pattern
  const multMatch = text.match(/^(.+?)\s*(x\s*\w+)\s*[（(](.+?)[）)]$/)
  if (multMatch) {
    return {
      name: multMatch[1].trim(),
      annotation: `${multMatch[2]} · ${multMatch[3].trim()}`,
      children: [],
    }
  }

  // Match "Name x N" without annotation
  const multSimple = text.match(/^(.+?)\s*(x\s*\w+)$/)
  if (multSimple) {
    return {
      name: multSimple[1].trim(),
      annotation: multSimple[2],
      children: [],
    }
  }

  return { name: text, children: [], isDirectory: isDir }
}

// ============================================================================
// Components
// ============================================================================

interface TreeBlockProps {
  text: string
}

export const TreeBlock = memo(function TreeBlock({ text }: TreeBlockProps) {
  const roots = parseTree(text)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  if (roots.length === 0) return null

  const toggleCollapse = (path: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div
      className="tree-block-container"
      style={{
        margin: '8px 0',
        padding: '12px 16px',
        borderRadius: '8px',
        background: 'var(--chatui-surface-1)',
        border: '1px solid var(--chatui-glass-border)',
        fontFamily: 'var(--vscode-editor-font-family)',
        fontSize: '12px',
        lineHeight: 1.6,
        overflowX: 'auto',
      }}
    >
      {roots.map((root, i) => (
        <TreeNodeView
          key={i}
          node={root}
          path={`${i}`}
          isLast={i === roots.length - 1}
          depth={0}
          collapsed={collapsed}
          onToggle={toggleCollapse}
          parentLines={[]}
        />
      ))}
    </div>
  )
})

interface TreeNodeViewProps {
  node: TreeNode
  path: string
  isLast: boolean
  depth: number
  collapsed: Set<string>
  onToggle: (path: string) => void
  parentLines: boolean[] // which parent levels need a continuing vertical line
}

function TreeNodeView({ node, path, isLast, depth, collapsed, onToggle, parentLines }: TreeNodeViewProps) {
  const hasChildren = node.children.length > 0
  const isCollapsed = collapsed.has(path)

  return (
    <div>
      {/* Node row */}
      <div
        className="tree-block-node"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0',
          whiteSpace: 'nowrap',
          cursor: hasChildren ? 'pointer' : 'default',
          borderRadius: '3px',
          padding: '1px 4px 1px 0',
          marginLeft: '-4px',
        }}
        onClick={hasChildren ? () => onToggle(path) : undefined}
      >
        {/* Tree connector lines */}
        {depth > 0 && (
          <span style={{ color: 'var(--vscode-foreground)', opacity: 0.2, userSelect: 'none' }}>
            {parentLines.map((needsLine, i) => (
              <span key={i} style={{ display: 'inline-block', width: '20px', textAlign: 'center' }}>
                {needsLine ? '│' : ' '}
              </span>
            ))}
            <span style={{ display: 'inline-block', width: '20px', textAlign: 'center' }}>
              {isLast ? '└' : '├'}
            </span>
            <span style={{ display: 'inline-block', width: '8px' }}>─</span>
          </span>
        )}

        {/* Collapse indicator for nodes with children */}
        {hasChildren && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '14px',
              height: '14px',
              fontSize: '8px',
              color: 'var(--chatui-accent, #6366f1)',
              opacity: 0.7,
              flexShrink: 0,
              marginRight: '3px',
              transition: 'transform 0.15s',
              transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
            }}
          >
            ▼
          </span>
        )}
        {!hasChildren && depth > 0 && <span style={{ width: '17px', display: 'inline-block' }} />}

        {/* Icon */}
        <span style={{ marginRight: '5px', fontSize: '13px', flexShrink: 0 }}>
          {node.isDirectory ? '📁' : hasChildren ? '📦' : getNodeIcon(node.name)}
        </span>

        {/* Node name */}
        <span
          style={{
            fontWeight: depth === 0 ? 600 : 500,
            color: depth === 0 ? 'var(--chatui-accent, #6366f1)' : 'var(--vscode-foreground)',
          }}
        >
          {node.name}
        </span>

        {/* Annotation */}
        {node.annotation && (
          <span
            style={{
              marginLeft: '6px',
              fontSize: '11px',
              color: 'var(--vscode-foreground)',
              opacity: 0.45,
              fontWeight: 400,
            }}
          >
            {node.annotation}
          </span>
        )}

        {/* Collapsed children count */}
        {hasChildren && isCollapsed && (
          <span
            style={{
              marginLeft: '6px',
              fontSize: '10px',
              padding: '0 5px',
              borderRadius: '8px',
              background: 'var(--chatui-surface-2)',
              color: 'var(--vscode-foreground)',
              opacity: 0.5,
            }}
          >
            {node.children.length}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div>
          {node.children.map((child, i) => (
            <TreeNodeView
              key={i}
              node={child}
              path={`${path}-${i}`}
              isLast={i === node.children.length - 1}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              parentLines={[...parentLines, !isLast]}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** Pick an icon based on node name heuristics */
function getNodeIcon(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return '📄'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return '📄'
  if (lower.endsWith('.vue')) return '📄'
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return '🎨'
  if (lower.includes('modal') || lower.includes('dialog')) return '💬'
  if (lower.includes('button') || lower.includes('btn')) return '🔘'
  if (lower.includes('progress') || lower.includes('bar')) return '📊'
  if (lower.includes('panel') || lower.includes('view')) return '🪟'
  if (lower.includes('hook') || lower.startsWith('use')) return '🪝'
  if (lower.includes('store') || lower.includes('state')) return '🗃️'
  if (lower.includes('error') || lower.includes('fail')) return '⚠️'
  if (lower.includes('step') || lower.includes('node')) return '📌'
  return '◆'
}
