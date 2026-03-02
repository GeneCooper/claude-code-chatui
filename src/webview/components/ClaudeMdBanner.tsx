import { postMessage } from '../hooks'
import { useChatStore, useUIStore } from '../store'
import { markOptimisticUserInput } from '../mutations'

export const GENERATE_CLAUDE_MD_PROMPT = `请深入分析当前项目的代码，然后在项目根目录创建 CLAUDE.md 文件。

CLAUDE.md 应包含以下内容：

## 第一部分：项目概况
- 项目名称、用途、整体架构
- 技术栈和主要依赖
- 开发常用命令（构建、测试、运行、lint 等）
- 代码风格和规范（命名、格式、导入顺序等）

## 第二部分：关键文件索引（重点）
按功能模块列出核心文件及其职责，格式示例：
- \`src/xxx/foo.ts\` — 负责XX功能，核心函数: funcA(), funcB()
- \`src/xxx/bar.tsx\` — XX组件，管理XX状态

要求：
- 覆盖所有主要功能模块
- 标注每个文件的核心职责和关键导出（函数、类、组件）
- 标注模块间的依赖关系（如 A 调用 B，C 监听 D 的事件）
- 标注重要的数据流方向

## 第三部分：架构关键路径
列出 2-3 个核心流程的调用链，例如：
- 用户操作 → 组件 → 服务 → API 的完整路径
- 关键状态如何在模块间流转

## 第四部分：工作规范
- 收到需求分析类任务时，先扫描项目结构，通读相关的 Controller、Entity、Mapper
- 对比需求文档与现有代码，明确列出已实现、未实现、有差异的部分
- 不要只基于用户提供的信息回答，主动去读代码验证

## 第五部分：Agent Rules (IMPORTANT - 必须原样包含)
在 CLAUDE.md 末尾原样包含以下规则，不要修改：

# Agent Rules

## Output Rules
1. Act immediately — no preamble, no restating the question.
2. Call tools directly. Batch independent reads/searches in parallel.
3. Code over prose. If asked to fix/change something, just do it.
4. After completing work, reply with ONE short sentence summarizing what changed.
5. No pleasantries, no bullet-list explanations, no unnecessary comments in code.

## Integrity Rules
11. Never fabricate file paths, function names, or APIs. If you haven't read it, don't cite it.
12. When referencing code, always include file_path:line_number. Read the file first.
13. If unsure, say so — never guess or hallucinate.

## Tool Strategy
14. PARALLEL FIRST: Batch all independent read-only operations (Read, Grep, Glob, WebFetch) in a single turn.
15. RIGHT TOOL: Use Grep/Glob for exact matching. Use semantic search for conceptual queries. Use Read for known paths.
16. EDIT SERIALIZE: File edits (Edit, Write, MultiEdit, NotebookEdit) MUST run one at a time.

## Task Complexity
17. SIMPLE: Execute immediately, no planning needed.
18. MODERATE (3-8 steps, 2-5 files): State a brief plan before executing.
19. COMPLEX (8+ steps): Outline the approach, get user confirmation, then execute in phases.
20. AUTONOMOUS COMPLETION: Keep working until fully resolved.

## Proactive Analysis
21. When analyzing requirements, flowcharts, design docs, or architecture diagrams:
  a. First Glob to get the file tree. Then Grep keywords to find relevant files.
  b. Read ONLY the relevant files (max 15). Prioritize: entities/models, then controllers, then services.
  c. Cross-reference requirements against existing code. Output a comparison table.
  d. After analysis, provide ACTIONABLE output: SQL DDL, skeleton code, implementation order.
  e. Do NOT stop at analysis — push through to executable artifacts.
22. Treat the current workspace as the target project. Search proactively.

请根据实际代码生成前四部分，第五部分的 Agent Rules 必须原样包含。前四部分保持 50-150 行。`

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

      <button onClick={handleGenerate} disabled={isProcessing}
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
      <button onClick={handleDismiss}
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
