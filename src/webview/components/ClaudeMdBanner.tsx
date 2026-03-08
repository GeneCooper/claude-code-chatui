import { postMessage } from '../hooks'
import { useChatStore, useUIStore } from '../store'
import { markOptimisticUserInput } from '../mutations'

export const GENERATE_CLAUDE_MD_PROMPT = `Analyze the current project's code and create a CLAUDE.md file in the project root.

IMPORTANT: Do NOT repeat information already available in README.md or package.json (project description, tech stack lists, install/build commands). CLAUDE.md should only contain what Claude cannot infer from those files.

CLAUDE.md should contain:

## 1. Project Overview (brief)
One sentence describing the project's purpose and architecture pattern (e.g., "Monorepo with Next.js frontend + Express API" or "VS Code extension with React webview"). Only include build/dev commands if they are non-obvious (not standard npm scripts).

## 2. Key File Index (core value)
List core files grouped by module, with responsibilities and key exports:
- \`src/xxx/foo.ts\` — Handles XX, key exports: funcA(), ClassB
- \`src/xxx/bar.tsx\` — XX component, manages XX state

Requirements:
- Cover all major functional modules
- Note dependencies and data flow between modules
- Skip test files, configs, and generated code

## 3. Architecture: Critical Paths
2-3 core workflows as call chains, e.g.:
- User action → Component → Service → API → Response rendering

## 4. Project-Specific Constraints
Rules that are unique to THIS project (do NOT include generic coding advice like "read before edit" or "keep code clean" — Claude already knows those). Examples:
- "Protocol changes must update both types.ts and handlers.ts"
- "Extension changes require \`npm run compile\`, webview changes require \`npm run build:webview\`"
- "All state mutations go through Zustand stores, never direct setState"

Keep the entire file between 40-120 lines. Be concise and actionable.`

export function ClaudeMdBanner() {
  const show = useUIStore((s) => s.showClaudeMdBanner)
  const isProcessing = useChatStore((s) => s.isProcessing)

  if (!show) return null

  const handleGenerate = () => {
    useUIStore.getState().setShowClaudeMdBanner(false)
    // Don't permanently dismiss — if generation fails, the banner should reappear next session.
    // Only the explicit "×" dismiss button should persist the dismissal.

    const store = useChatStore.getState()
    markOptimisticUserInput()
    store.addMessage({ type: 'userInput', data: { text: GENERATE_CLAUDE_MD_PROMPT } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())

    postMessage({ type: 'sendMessage', text: GENERATE_CLAUDE_MD_PROMPT })
  }

  const handleDismiss = () => {
    useUIStore.getState().setShowClaudeMdBanner(false)
    postMessage({ type: 'dismissClaudeMdBanner' })
  }

  return (
    <div style={{
      margin: '12px 0 8px',
      padding: '12px 16px',
      borderRadius: '8px',
      border: '1px solid var(--vscode-panel-border)',
      backgroundColor: 'var(--vscode-editor-background)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      animation: 'fadeIn 0.3s ease',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="var(--chatui-accent)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
        style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>
          No CLAUDE.md detected
        </div>
        <div style={{ fontSize: '11px', opacity: 0.6, marginTop: '2px' }}>
          Generate one to help Claude better understand your project
        </div>
      </div>

      <button onClick={handleGenerate} disabled={isProcessing} aria-label="Generate CLAUDE.md"
        style={{
          padding: '5px 12px', fontSize: '12px', fontWeight: 600,
          borderRadius: '4px', border: 'none',
          background: 'var(--chatui-accent)', color: '#fff',
          cursor: isProcessing ? 'not-allowed' : 'pointer',
          opacity: isProcessing ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}>
        Generate
      </button>
      <button onClick={handleDismiss} aria-label="Dismiss banner"
        style={{
          background: 'none', border: 'none',
          color: 'var(--vscode-foreground)',
          cursor: 'pointer', fontSize: '16px',
          padding: '2px 4px', opacity: 0.4,
          lineHeight: 1,
        }}
        title="Dismiss">
        &times;
      </button>
    </div>
  )
}
