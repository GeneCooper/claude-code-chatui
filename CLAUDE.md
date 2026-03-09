# CLAUDE.md

## Project Overview

VS Code extension (React webview + Node.js extension host) wrapping the Claude Code CLI with a GUI — multi-panel chat, inline diffs, permission management, conversation history, and MCP server support.

## Key File Index

### Extension Host (`src/extension/`)

- `extension.ts` — Activation entry point, registers commands (`openChat`, `openChatWithFile`, `loadConversation`), initializes shared services
- `panelManager.ts` — Multi-panel orchestration; creates/disposes independent chat panels, each with its own ClaudeService
- `panel.ts` — Single panel session manager (PanelProvider); binds WebView ↔ extension messaging, manages file attachments, conversation loading/rewinding, session persistence
- `claude.ts` — ClaudeService: spawns CLI process with `stream-json`, parses stdout JSON lines, handles permission control_requests via stdin; PermissionService: stores/matches wildcard allow-patterns
- `handlers.ts` — ClaudeMessageProcessor: routes CLI messages (system/assistant/user/result) to webview; SessionStateManager: tracks cost/tokens/tool metrics; DiffContentProvider & MarkdownContentProvider: virtual document schemes; handleWebviewMessage: dispatches 50+ webview message types
- `storage.ts` — ConversationService: saves/loads/indexes conversations as JSON; MCPService: manages MCP server configs with default migration; UsageService: polls `claude usage` CLI, parses rate limits

### Webview (`src/webview/`)

- `store.ts` — Five Zustand stores: useChatStore (messages, session, tokens), useConversationStore (history list), useMCPStore (servers), useSettingsStore (thinking, YOLO, tools), useUIStore (views, modals, usage, notifications)
- `hooks.ts` — useVSCode(): postMessage/getState/setState bridge + global message listener dispatching to 40+ handlers; useAutoScroll(): auto-scroll with manual override
- `mutations.ts` — Optimistic dedup tracking (markOptimisticUserInput/Permission) to prevent duplicates when extension echoes messages back
- `utils.ts` — Myers diff algorithm (line + char level), permission error detection, usage limit timestamp parsing
- `components/InputArea.tsx` — Chat input with `@` file picker, `/` slash commands, image/file drag-drop
- `components/JourneyTimeline.tsx` — Renders message groups (user input + assistant response chain)
- `components/ToolResultBlock.tsx` — Tool results with inline diff view (uses DiffView)
- `components/DiffView.tsx` — Inline diff viewer with line/char-level highlighting, expand/collapse
- `components/PermissionDialog.tsx` — Permission prompt modal (approve/deny/always-allow)

### Shared (`src/shared/`)

- `types.ts` — All TypeScript interfaces: CLI message types, permission types, conversation types, MCP types, 50+ webview↔extension message variants
- `constants.ts` — AGENT_SYSTEM_PROMPT (prepended to every message), FILE_EDIT_TOOLS, HIDDEN_RESULT_TOOLS, SUBAGENT_COLORS
- `logger.ts` — Centralized logger with module-based formatting

## Architecture: Critical Paths

1. **Send message:** InputArea → postMessage('sendMessage') → PanelProvider spawns ClaudeService → CLI stdout stream-json → ClaudeMessageProcessor parses & posts to webview → hooks.ts handlers update Zustand stores → components re-render
2. **Permission flow:** CLI stdout control_request → PermissionService pattern check → if not pre-approved: PermissionDialog shown → user response written to CLI stdin → ClaudeService continues
3. **Conversation restore:** HistoryView → postMessage('loadConversation') → ConversationService loads JSON → PanelProvider sends batchReplay → webview reconstructs timeline in single setState

## Project-Specific Constraints

- **Windows CLI escaping:** System prompt is passed as message text (not CLI arg) because `cmd.exe` interprets `>`, `<`, `|`, `&` in args as shell operators
- **Types ↔ Handlers sync:** Adding a new webview↔extension message requires updating the union type in `types.ts` AND adding a handler in both `handlers.ts` (extension side) and `hooks.ts` (webview side)
- **State via Zustand only:** All webview state mutations go through the five Zustand stores; never use direct React setState for shared state
- **Optimistic dedup required:** When the extension echoes user input or permission responses back to the webview, `mutations.ts` tracking must be used to prevent duplicate entries
- **Two separate TypeScript configs:** Extension compiles via `tsconfig.extension.json` (Node.js target), webview via `tsconfig.json` (Vite/browser target) — mixing imports across boundaries will break builds
- **Extension changes need `npm run compile`; webview changes need `npm run build:webview`** — `vscode:prepublish` runs both
