import { postMessage } from '../hooks'
import { useChatStore, useUIStore } from '../store'
import { markOptimisticUserInput } from '../mutations'

const GENERATE_PROMPT = `请深入分析当前项目的代码，然后在项目根目录创建 CLAUDE.md 文件。

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

请根据实际代码生成，不要包含不存在的内容。保持总量在 50-150 行。`

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
    store.addMessage({ type: 'userInput', data: { text: GENERATE_PROMPT } })
    store.setProcessing(true)
    store.addMessage({ type: 'loading', data: 'Claude is working...' })
    useUIStore.getState().setRequestStartTime(Date.now())

    postMessage({ type: 'sendMessage', text: GENERATE_PROMPT })
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
