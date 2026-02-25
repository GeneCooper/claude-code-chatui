# CLAUDE.md — Claude Code ChatUI

## 项目概况

VS Code 扩展，为 Claude Code CLI 提供图形化对话界面。架构分为 **Extension**（Node.js，管理进程/文件/状态）和 **Webview**（React 19 + Zustand，渲染 UI）两层，通过 `postMessage` 双向通信。

**技术栈**: TypeScript · React 19 · Zustand 5 · Vite · Tailwind CSS · react-markdown · react-syntax-highlighter · Mermaid · KaTeX

**常用命令**:
- `npm run compile` — 编译 Extension（tsc）
- `npm run build:webview` — 构建 Webview（Vite）
- `npm run watch` — Extension 监听模式
- `npm run dev:webview` — Webview 开发热更新
- `npm run lint` — ESLint 检查

**代码规范**: 函数式组件 · 命名 camelCase · 组件 PascalCase · 导入顺序: React → 三方库 → 本地模块

---

## 关键文件索引

### Extension 层（`src/extension/`）

- `extension.ts` — 入口，注册命令（openChat/openChatWithFile）、初始化服务、创建 PanelManager 和 sidebar
- `panelManager.ts` — **PanelManager**: 多面板管理，每面板独立 ClaudeService 进程。核心: `createNewPanel()`, `adoptRestoredPanel()`
- `panel.ts` — **PanelProvider**: 单会话管理，Webview 生命周期、消息路由、会话保存/恢复。核心: `_handleSendMessage()`, `_gatherIDEContext()`, `_replayConversation()`, `_saveConversation()`
- `claude.ts` — **ClaudeService**: 启动 `claude` CLI 子进程，解析 stream-json 输出。核心: `sendMessage()`, `stopProcess()`, `sendPermissionResponse()`。**PermissionService**: 持久化权限审批模式
- `handlers.ts` — 消息处理器调度中心。**SessionStateManager**: 会话状态。**ClaudeMessageProcessor**: 格式化 Claude 消息。**SettingsManager**: 读取配置。**DiffContentProvider**: 虚拟文件系统差异对比。`checkClaudeMdExists()`: 检测 CLAUDE.md 是否存在
- `storage.ts` — **ConversationService**: 会话持久化到 globalStorage。**MCPService**: MCP 服务器配置管理（默认含 context7 等）。**UsageService**: API 用量轮询与缓存

### Webview 层（`src/webview/`）

- `main.tsx` — React 根入口，渲染 App + ErrorBoundary
- `App.tsx` — 主组件，路由 activeView（chat/history/settings），组合 Header + ChatView + InputArea + 各弹窗
- `store.ts` — Zustand 状态管理：**useChatStore**（消息/处理状态）、**useUIStore**（视图/弹窗/通知）、**useSettingsStore**（YOLO/思考强度）、**useMCPStore**（MCP 配置）、**useConversationStore**（历史列表）
- `hooks.ts` — VS Code API 桥接：`postMessage()`, `getState()`/`setState()`, `onMessage()`。**useVSCode()**: 初始化连接发送 ready。**useAutoScroll()**: 自动滚动。`webviewMessageHandlers`: 消息→store 映射
- `mutations.ts` — 乐观更新辅助：`markOptimisticUserInput()`, `consumeOptimisticUserInput()`

### 组件（`src/webview/components/`）

- `ChatView.tsx` — 聊天主区域，渲染 JourneyTimeline 或 WelcomeScreen
- `InputArea.tsx` — 输入框 + 模式切换（Think/Plan/YOLO/CLAUDE.md）+ 模型选择 + 拖拽附件 + 图片粘贴
- `Header.tsx` — 顶部导航：Logo、会话 ID、处理计时器、用量指示、新建面板、历史切换
- `JourneyTimeline.tsx` — 时间线布局，按请求分组消息，支持折叠和编辑
- `AssistantMessage.tsx` — AI 回复渲染：Markdown + 语法高亮 + Mermaid 图表 + KaTeX 数学
- `PermissionDialog.tsx` — 权限审批弹窗：批准/拒绝 + 始终允许
- `ToolUseBlock.tsx` / `ToolResultBlock.tsx` — 工具调用/结果显示
- `ThinkingBlock.tsx` — 扩展思考内容展示
- `HistoryView.tsx` — 会话历史浏览器，搜索/加载/删除
- `SettingsPanel.tsx` — 设置面板（思考强度/YOLO/最大轮次/禁用工具）
- `MCPPanel.tsx` — MCP 服务器管理界面
- `ClaudeMdBanner.tsx` — CLAUDE.md 生成提示，导出 `GENERATE_CLAUDE_MD_PROMPT`
- `UsageIndicator.tsx` — API 用量条（会话/周限额 + 重置倒计时）
- `DiffView.tsx` — 文件差异可视化
- `ModelSelectorModal.tsx` — 模型选择弹窗
- `WelcomeScreen.tsx` — 欢迎页提示

### 共享（`src/shared/`）

- `types.ts` — 核心类型：Claude CLI 消息体、ConversationData、PermissionRequest、MCPServerConfig、UsageData
- `constants.ts` — AgentMode 定义、系统提示词、隐藏工具列表、文件搜索排除规则
- `logger.ts` — 集中日志工具

---

## 架构关键路径

### 1. 用户发送消息 → AI 回复

```
InputArea.handleSend()
  → markOptimisticUserInput() + chatStore.addMessage() [乐观更新]
  → postMessage({ type: 'sendMessage' })
  → PanelProvider._handleSendMessage()
    → ClaudeService.sendMessage() [启动 CLI 子进程]
    → stdout stream-json → ClaudeMessageProcessor.processMessage()
    → panel.postMessage(output/thinking/toolUse/toolResult)
  → hooks.ts webviewMessageHandlers 更新 chatStore
  → ChatView → JourneyTimeline 重新渲染
```

### 2. 权限审批流程

```
Claude CLI 请求权限 (control_request)
  → ClaudeService.onPermissionRequest
  → 检查 PermissionService.isToolPreApproved()
  → 未预批: postMessage({ type: 'permissionRequest' })
  → Webview 显示 PermissionDialog
  → 用户点击批准/拒绝
  → postMessage({ type: 'permissionResponse' })
  → ClaudeService.sendPermissionResponse() [写入 CLI stdin]
  → 若 alwaysAllow: PermissionService.savePermission()
```

### 3. 会话持久化与恢复

```
消息完成 → PanelProvider._saveConversation()
  → ConversationService.saveConversation() [JSON 文件 + 索引更新]

恢复: 用户从 HistoryView 选择 → postMessage({ type: 'loadConversation' })
  → PanelProvider.loadConversation() → _replayConversation()
  → batchReplay 消息 → chatStore.restoreState()
```
