# Claude Code ChatUI

A beautiful, stable VS Code GUI for [Claude Code CLI](https://claude.ai/code).

Claude Code CLI is the fastest and most stable AI coding engine. This extension wraps its input/output in a polished chat interface — the CLI is the engine, we just build the cockpit.

## Prerequisites

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

Requires VS Code 1.94+. The extension expects `claude` on your PATH.

## Features

- **Chat Interface** — Real-time streaming responses, markdown rendering, syntax-highlighted code blocks
- **Editor Title Bar Icon** — Click the icon in the editor title bar to open chat with the current file auto-attached
- **File Context** — Type `@` to reference any workspace file; drag & drop files from the explorer or paste images
- **Slash Commands** — Type `/` to access 23+ built-in Claude Code commands
- **Model Selection** — Switch between Opus, Sonnet, or your configured default
- **Thinking Modes** — Configurable thinking intensity (Think → Ultrathink)
- **YOLO Mode** — Skip all permission prompts for uninterrupted workflows (auto-approves any remaining checks)
- **Checkpoint & Restore** — Git-based automatic backups; one-click restore to any previous state
- **Inline Diff Viewer** — See file changes inline with expand/collapse; open in VS Code's native diff editor
- **MCP Server Management** — Install, configure, enable/disable MCP servers through UI
- **Permission System** — Interactive permission dialogs, always-allow patterns, YOLO mode
- **Conversation History** — Automatic session saving, browsing, and restoration
- **Token & Cost Tracking** — Real-time API usage monitoring
- **Max Turns Control** — Limit agentic tool-use turns per request to manage token consumption
- **Sidebar & Panel** — Use as sidebar view or standalone editor panel (auto-locks editor group)

## Getting Started

1. Install Claude Code CLI (see Prerequisites above)
2. Open VS Code, install this extension
3. Press `Ctrl+Shift+C` (or `Cmd+Shift+C` on Mac) to open the chat
4. Start chatting

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+C` | Open Claude Code ChatUI |
| `Enter` | Send message |
| `@` | Open file picker |
| `/` | Open slash commands |

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `claudeCodeChatUI.thinking.intensity` | `think` | Thinking intensity: think, think-hard, think-harder, ultrathink |
| `claudeCodeChatUI.permissions.yoloMode` | `false` | Skip all permission checks |
| `claudeCodeChatUI.maxTurns` | `0` | Max agentic turns per request (0 = unlimited) |

## Architecture

```
┌─────────────────────────────────────┐
│           VS Code Extension         │
│  ┌───────────────────────────────┐  │
│  │  React 19 + Zustand WebView  │  │  ← Chat UI
│  └──────────┬────────────────────┘  │
│             │ postMessage           │
│  ┌──────────▼────────────────────┐  │
│  │    Extension Host (Node.js)   │  │  ← Message routing
│  └──────────┬────────────────────┘  │
│             │ spawn + stream-json   │
│  ┌──────────▼────────────────────┐  │
│  │     Claude Code CLI           │  │  ← Engine (untouched)
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Development

```bash
git clone <repo-url>
cd claude-code-chatui
npm install
# Press F5 in VS Code to launch Extension Development Host
```

## Acknowledgments

This project is built upon the following open source projects:

- [Claude Code Chat](https://github.com/andrepimenta/claude-code-chat) by AndrePimenta — Core architecture and features
- [Claude Code GUI](https://github.com/MaheshKok/claude-code-gui-vscode) by MaheshKok — UI design reference

## License

See the [LICENSE](LICENSE) file for details.
