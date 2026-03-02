# Claude Code ChatUI

VS Code 扩展，为 Claude Code CLI 提供图形化聊天界面。采用 Extension Host (Node.js) + Webview (React) 双进程架构，通过 `postMessage` 通信。

## 技术栈

- **Extension**: TypeScript, VS Code Extension API, Node.js `child_process`
- **Webview**: React 19, Zustand 5, Tailwind CSS v4, Vite 7
- **渲染**: react-markdown, react-syntax-highlighter, KaTeX, Mermaid
- **构建**: `tsc` (extension) + `vite build` (webview), 输出到 `out/`

## 开发命令

```bash
npm run compile          # 编译 extension (tsc)
npm run watch            # extension 监听模式
npm run build:webview    # 构建 webview (vite)
npm run dev:webview      # webview 开发服务器
npm run package          # 打包 .vsix
npm run lint             # ESLint
```

## 代码规范

- TypeScript strict 模式，ES2022 target
- 私有成员用 `_` 前缀 (`_process`, `_sessionId`)
- 接口定义集中在 `src/shared/types.ts`，常量在 `src/shared/constants.ts`
- Webview 组件用函数式 + hooks，状态管理用 Zustand（多个独立 store）
- Extension 侧用 class + EventEmitter 模式

---

## 关键文件索引

### Extension 层 (`src/extension/`)

- `extension.ts` — **入口**。`activate()` 初始化所有服务（ClaudeService, ConversationService, MCPService, PermissionService, UsageService），注册命令（openChat, openChatWithFile），创建 PanelManager 和侧边栏 WebviewProvider。
- `claude.ts` — **核心服务**。`ClaudeService` 管理 Claude CLI 子进程（spawn/stdin/stdout/stderr 解析），处理 stream-json 协议、权限控制请求、rate-limit 解析。`PermissionService` 管理工具权限白名单（持久化到 JSON 文件）。
- `panel.ts` — **面板生命周期**。`PanelProvider` 是单会话控制器：管理 webview 绑定、消息发送（`_handleSendMessage`）、IDE 上下文注入（`_gatherIDEContext`）、文件引用预处理（`_preprocessFileReferences`）、需求分析探测（`_detectAndEnrich`）、系统提示切换（`_shouldUseSlimPrompt`）、会话保存/加载/回放。`WebviewProvider` 实现侧边栏。`getWebviewHtml()` 生成 HTML。
- `panelManager.ts` — **多面板管理**。`PanelManager` 创建/销毁独立的 Panel+ClaudeService 实例对，支持 fork 会话和面板恢复（`adoptRestoredPanel`）。
- `handlers.ts` — **消息路由与处理**。`handleWebviewMessage()` 分发 webview→extension 的所有消息类型。`ClaudeMessageProcessor` 处理 CLI stdout 消息流（解析 content blocks, token 统计, tool_use/tool_result 配对, diff 捕获）。`SessionStateManager` 跟踪处理状态和累计 token/cost。`SettingsManager` 读取 VS Code 配置。`DiffContentProvider` / `MarkdownContentProvider` 提供虚拟文档。
- `storage.ts` — **持久化服务**。`ConversationService` 管理对话存储（JSON 文件 + globalState 索引）。`MCPService` 管理 MCP 服务器配置（默认包含 context7 和 sequential-thinking）。`UsageService` 轮询 rate-limit 数据（从 CLI stderr 实时解析 + 定时轮询 + 本地缓存）。

### Shared 层 (`src/shared/`)

- `types.ts` — 全部 TypeScript 类型定义：CLI 消息类型（ClaudeMessage 联合类型）、权限类型、会话数据、MCP 配置、**Webview↔Extension 通信协议**（`WebviewToExtensionMessage` 联合类型，30+ 消息类型）。
- `constants.ts` — Agent 模式提示词（fast/deep/precise）、系统提示（AGENT_SYSTEM_PROMPT_FULL / slim）、工具分类常量（FILE_EDIT_TOOLS, HIDDEN_RESULT_TOOLS）。
- `logger.ts` — `createModuleLogger()` 工厂函数，带模块前缀的分级日志。

### Webview 层 (`src/webview/`)

- `App.tsx` — 根组件，根据 `activeView` 状态切换 Chat/History/Settings 视图。
- `store.ts` — **Zustand 状态中心**。4 个独立 store：`useChatStore`（消息列表、处理状态、token/cost 统计、todos）、`useConversationStore`（历史列表）、`useMCPStore`（MCP 服务器）、`useSettingsStore`（配置）、`useUIStore`（UI 状态、通知、模态框）。
- `hooks.ts` — `useVSCode()` 初始化 postMessage 桥接和消息分发（30+ handler 映射表），`useAutoScroll()` 智能滚动 hook，`postMessage()` / `getState()` / `setState()` VS Code API 封装。
- `mutations.ts` — 乐观更新去重跟踪（`markOptimisticUserInput`, `consumeOptimisticPermission`）。
- `utils.ts` — Myers diff 算法（`computeLineDiff`）、权限错误检测、usage limit 解析。
- **组件** (`components/`): `ChatView` 消息列表, `InputArea` 输入框, `JourneyTimeline` 消息分组时间线, `AssistantMessage` AI 回复渲染(Markdown), `ToolUseBlock` 工具调用展示, `ToolResultBlock` 工具结果, `DiffView` 文件差异, `PermissionDialog` 权限弹窗, `Header` 顶栏导航, `HistoryView` 历史列表, `SettingsPanel` 设置, `MCPPanel` MCP 管理, `UsageIndicator` 用量指示器, `TodoDisplay` 任务进度, `ThinkingBlock` 思考过程, `ModelSelectorModal` 模型选择, `WelcomeScreen` 欢迎页, `InstallModal`/`LoginModal` 安装/登录引导, `ClaudeMdBanner` CLAUDE.md 提示。

### 模块依赖关系

```
extension.ts → PanelManager, PanelProvider, ClaudeService, *Service
PanelManager → PanelProvider, ClaudeService (每个面板独立实例)
PanelProvider → ClaudeService (消息发送/接收), handlers (消息处理), storage (持久化)
handlers.ts → ClaudeService (权限响应), storage (会话/MCP/Usage), PanelManager (fork)
hooks.ts → store (所有 Zustand store), mutations (乐观更新)
App.tsx → hooks.ts (useVSCode), store (useUIStore), 各组件
```

---

## 架构关键路径

### 1. 用户发送消息 → Claude 响应

```
InputArea (postMessage: sendMessage)
  → hooks.ts handler → extension handleWebviewMessage
    → PanelProvider._handleSendMessage()
      → 注入 IDE 上下文 + 文件引用预处理 + 系统提示
      → ClaudeService.sendMessage() → spawn claude CLI 子进程
        → stdin 写入 stream-json 格式消息
        → stdout 解析 → ClaudeMessageProcessor.processMessage()
          → postMessage 到 webview (output/toolUse/toolResult/thinking...)
            → hooks.ts handler → useChatStore 更新 → React 重渲染
```

### 2. 权限请求流程

```
Claude CLI stdout → control_request (can_use_tool)
  → ClaudeService._handleControlRequest() → emit 'request'
    → PanelProvider → postMessage: permissionRequest → webview PermissionDialog
      → 用户批准/拒绝 → postMessage: permissionResponse
        → handleWebviewMessage → ClaudeService.sendPermissionResponse()
          → stdin 写入 control_response → CLI 继续/中断
```

### 3. 会话管理（多面板 + 持久化）

```
openChat 命令 → PanelManager.createNewPanel()
  → 新建 ClaudeService + PanelProvider + WebviewPanel
  → 独立会话，互不干扰
  → 会话结束 → ConversationService.saveConversation() (JSON 文件 + globalState 索引)
  → 历史列表 → loadConversation() → batchReplay 回放到 webview
  → VS Code 重启 → registerWebviewPanelSerializer → adoptRestoredPanel() 恢复面板
```

---

## 工作规范

- 收到需求分析类任务时，先扫描项目结构，通读相关的 Extension 服务、Webview 组件、Shared 类型
- 对比需求文档与现有代码，明确列出已实现、未实现、有差异的部分
- 不要只基于用户提供的信息回答，主动去读代码验证
- Extension 侧修改需要 `npm run compile` 验证，Webview 侧修改需要 `npm run build:webview` 验证
- 通信协议变更必须同步修改 `types.ts` 中的 `WebviewToExtensionMessage` 和 `handlers.ts` 中的处理逻辑

---

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
