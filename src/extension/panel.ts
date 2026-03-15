import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeService } from './claude';
import { ConversationService, UsageService, MCPService, SkillService } from './storage';
import { PermissionService } from './claude';
import {
  ClaudeMessageProcessor,
  SessionStateManager,
  SettingsManager,
  handleWebviewMessage,
  type MessagePoster,
  type WebviewMessage,
} from './handlers';
import { createModuleLogger } from '../shared/logger';
import type { ClaudeMessage, WebviewToExtensionMessage, ConversationMessage } from '../shared/types';
import type { PanelManager } from './panelManager';

const log = createModuleLogger('PanelProvider');

// ============================================================================
// HTML Generator
// ============================================================================

function getNonce(): string {
  let text = '';
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
}

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'main.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'assets', 'style.css'));
  const iconUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'icon.png'));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      style-src ${webview.cspSource} 'unsafe-inline';
      script-src 'nonce-${nonce}';
      img-src ${webview.cspSource} https: data:;
      font-src ${webview.cspSource};">
  <link href="${styleUri}" rel="stylesheet">
  <title>Claude Code ChatUI</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      overflow: hidden;
      background-color: var(--vscode-editor-background);
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    #root {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    .loading-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      flex-direction: column;
      gap: 16px;
    }
    .loading-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--vscode-input-border);
      border-top-color: var(--vscode-focusBorder);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <div>Loading...</div>
    </div>
  </div>
  <script nonce="${nonce}">window.__ICON_URI__="${iconUri}";</script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

// ============================================================================
// PanelProvider (single-session, no tabs)
// ============================================================================

export class PanelProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private _webview: vscode.Webview | undefined;
  private _webviewView: vscode.WebviewView | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _messageHandlerDisposable: vscode.Disposable | undefined;
  private _isVisible = true;

  private readonly _settingsManager = new SettingsManager();

  // Single session state (no tabs)
  private _messageProcessor: ClaudeMessageProcessor;
  private _stateManager: SessionStateManager;
  private _sessionId: string | undefined;


  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _claudeService: ClaudeService,
    private readonly _conversationService: ConversationService,
    private readonly _mcpService: MCPService,
    private readonly _skillService: SkillService,
    private readonly _usageService: UsageService,
    private readonly _permissionService: PermissionService,
    private readonly _panelManager?: PanelManager,
  ) {
    log.info('PanelProvider initialized');

    this._stateManager = new SessionStateManager();
    this._stateManager.selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');

    const poster: MessagePoster = {
      postMessage: (msg) => {
        if (msg.type === 'toolError') {
          const data = msg.data as { toolName: string; error: string };
          vscode.window.showWarningMessage(`Tool "${data.toolName}" failed: ${data.error}`);
          return;
        }
        this._postMessage(msg);
      },
      sendAndSaveMessage: (msg) => this._postMessage(msg),
    };

    this._messageProcessor = new ClaudeMessageProcessor(poster, this._stateManager, {
      onSessionIdReceived: (sessionId) => {
        this._claudeService.setSessionId(sessionId);
        this._sessionId = sessionId;
      },
      onProcessingComplete: (result) => { this._saveConversation(result.sessionId); },
      onSessionNotFound: () => {
        this._sessionId = undefined;
        this._claudeService.setSessionId(undefined);
      },
    });

    this._setupClaudeServiceHandlers();

    this._usageService.onUsageUpdate((data) => { this._postMessage({ type: 'usageUpdate', data }); });
    this._usageService.onError((err) => { this._postMessage({ type: 'usageError', data: err }); });

    // Start usage polling lazily (deferred from activation)
    this._usageService.startPollingIfNeeded();

    // Send current usage data immediately so the indicator shows on startup
    const currentUsage = this._usageService.currentUsage;
    if (currentUsage) {
      this._postMessage({ type: 'usageUpdate', data: currentUsage });
    }

    // Real-time rate-limit updates from the main Claude process stderr
    this._claudeService.onRateLimitUpdate((data) => { this._usageService.updateFromRateLimits(data); });

  }

  // ==================== Public API ====================

  get messageProcessor(): ClaudeMessageProcessor { return this._messageProcessor; }
  get stateManager(): SessionStateManager { return this._stateManager; }

  show(column: vscode.ViewColumn | vscode.Uri = vscode.ViewColumn.Two, preserveFocus = false): void {
    const actualColumn = column instanceof vscode.Uri ? vscode.ViewColumn.Two : column;

    if (this._panel) {
      this._panel.reveal(actualColumn, preserveFocus);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'claudeCodeChatUI', 'Claude Code ChatUI',
      { viewColumn: actualColumn, preserveFocus },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [this._extensionUri] },
    );

    this._panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png');
    this._panel.webview.html = getWebviewHtml(this._panel.webview, this._extensionUri);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.onDidChangeViewState((e) => { this._isVisible = e.webviewPanel.visible; }, null, this._disposables);
    this._setupWebviewMessageHandler(this._panel.webview);

    // Lock the editor group so the chat panel stays pinned
    void vscode.commands.executeCommand('workbench.action.lockEditorGroup');
  }

  showInWebview(webview: vscode.Webview, webviewView?: vscode.WebviewView): void {
    if (this._panel) {
      this._panel.dispose();
      this._panel = undefined;
    }

    const isSameWebview = this._webview === webview;
    this._webview = webview;
    this._webviewView = webviewView;

    if (webviewView) {
      this._isVisible = webviewView.visible;
      webviewView.onDidChangeVisibility(() => { this._isVisible = webviewView.visible; }, null, this._disposables);
    }

    if (!isSameWebview) {
      this._webview.html = getWebviewHtml(this._webview, this._extensionUri);
      this._setupWebviewMessageHandler(this._webview);
    }
  }

  /** Bind to an externally-created webview (used by PanelManager) */
  bindToWebview(webview: vscode.Webview, panel?: vscode.WebviewPanel): void {
    this._webview = webview;
    if (panel) {
      this._isVisible = panel.visible;
      panel.onDidChangeViewState((e) => { this._isVisible = e.webviewPanel.visible; }, null, this._disposables);
    }
    this._setupWebviewMessageHandler(webview);
  }

  attachFileContext(relativePath: string): void {
    setTimeout(() => {
      const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const absPath = workspaceRoot ? path.join(workspaceRoot, relativePath) : relativePath;
      try {
        if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
          // Expand folder: attach all files inside (1 level deep)
          const entries = fs.readdirSync(absPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const childRelative = relativePath + '/' + entry.name;
            this._postMessage({ type: 'attachFileContext', data: { filePath: childRelative } });
          }
          return;
        }
      } catch { /* fallback to attaching as-is */ }
      this._postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
    }, 100);
  }

  closeMainPanel(): void {
    if (this._panel) {
      this._panel.dispose();
      this._panel = undefined;
    }
  }


  async newSession(): Promise<void> {
    if (this._panelManager) {
      // Create a new panel instead of resetting current
      this._panelManager.createNewPanel();
      return;
    }
    // Sidebar fallback: reset current session
    this._saveConversation(this._sessionId);
    if (this._stateManager.isProcessing) {
      await this._claudeService.stopProcess();
    }
    this._messageProcessor.resetSession();
    this._stateManager.resetSession();
    this._sessionId = undefined;
    this._postMessage({ type: 'sessionCleared' });
  }

  async loadConversation(filename: string): Promise<void> {
    const conversation = await this._conversationService.loadConversation(filename);
    if (!conversation) {
      this._postMessage({ type: 'error', data: 'Failed to load conversation' });
      return;
    }

    // Reset current session
    this._messageProcessor.resetSession();
    this._stateManager.resetSession();

    this._sessionId = conversation.sessionId;
    this._stateManager.restoreFromConversation({
      totalCost: conversation.totalCost,
      totalTokens: conversation.totalTokens,
    });

    for (const msg of conversation.messages) {
      this._messageProcessor.currentConversation.push(msg);
    }

    this._replayConversation();
  }

  /** Load conversation data directly (used by fork/PanelManager) */
  loadConversationData(messages: ConversationMessage[], sessionId?: string, totalCost?: number): void {
    this._messageProcessor.resetSession();
    this._stateManager.resetSession();

    this._sessionId = sessionId;
    if (totalCost) this._stateManager.totalCost = totalCost;

    for (const msg of messages) {
      this._messageProcessor.currentConversation.push({ ...msg });
    }

    // Replay will happen when webview sends 'ready'
  }

  rewindToMessage(userInputIndex: number): void {
    if (this._stateManager.isProcessing) return;

    const conversation = this._messageProcessor.currentConversation;
    const pos = this._findUserInputPosition(conversation, userInputIndex);
    if (pos === -1) return;

    this._messageProcessor.truncateConversation(pos);
    this._sessionId = undefined;
    this._replayConversation();
  }

  dispose(): void {
    // Stop Claude process if running
    if (this._stateManager.isProcessing) {
      void this._claudeService.stopProcess();
    }
    this._saveConversation(this._sessionId);
    this._panel = undefined;
    this._messageHandlerDisposable?.dispose();
    this._messageHandlerDisposable = undefined;
    while (this._disposables.length) this._disposables.pop()?.dispose();
  }

  disposeAll(): void {
    this.dispose();
    this._webview = undefined;
    this._webviewView = undefined;
  }

  // ==================== Private ====================

  private _setupWebviewMessageHandler(webview: vscode.Webview): void {
    this._messageHandlerDisposable?.dispose();
    this._messageHandlerDisposable = webview.onDidReceiveMessage(
      (message: WebviewToExtensionMessage) => {
        handleWebviewMessage(message as unknown as WebviewMessage, this._createHandlerContext());
      },
      null,
      this._disposables,
    );
  }

  private _createHandlerContext() {
    return {
      claudeService: this._claudeService,
      conversationService: this._conversationService,
      mcpService: this._mcpService,
      skillService: this._skillService,
      usageService: this._usageService,
      permissionService: this._permissionService,
      stateManager: this._stateManager,
      settingsManager: this._settingsManager,
      messageProcessor: this._messageProcessor,
      extensionContext: this._context,
      postMessage: (msg: Record<string, unknown>) => this._postMessage(msg),
      newSession: () => this.newSession(),
      loadConversation: (filename: string) => this.loadConversation(filename),
      handleSendMessage: (text: string, images?: string[]) =>
        this._handleSendMessage(text, images),
      panelManager: this._panelManager,
      rewindToMessage: (userInputIndex: number) => this.rewindToMessage(userInputIndex),
    };
  }

  private _handleSendMessage(text: string, images?: string[]): void {
    if (this._stateManager.isProcessing) return;

    log.info('Sending message', { hasImages: !!images?.length });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    this._stateManager.isProcessing = true;
    this._stateManager.draftMessage = '';

    this._claudeService.setSessionId(this._sessionId);

    // Save userInput to conversation
    const userInputData = { text, images };
    this._messageProcessor.currentConversation.push({
      timestamp: new Date().toISOString(),
      messageType: 'userInput',
      data: userInputData,
    });
    this._postMessage({ type: 'userInput', data: userInputData });
    this._postMessage({ type: 'setProcessing', data: { isProcessing: true } });
    this._postMessage({ type: 'loading', data: 'Claude is working...' });

    const yoloMode = this._settingsManager.isYoloModeEnabled();
    const disallowedTools = [...this._settingsManager.getDisallowedTools()];
    // Map thinkingIntensity to CLI --effort level
    const intensityToEffort: Record<string, string> = { fast: 'low', deep: 'medium', precise: 'high' };
    const settings = this._settingsManager.getCurrentSettings(this._stateManager.selectedModel);
    const effortLevel = intensityToEffort[settings.thinkingIntensity] || 'medium';
    // In YOLO mode, disallow AskUserQuestion — the CLI can't get real user input
    // in stream-json mode with --dangerously-skip-permissions, so the tool returns
    // a useless result and truncates the conversation.
    if (yoloMode && !disallowedTools.includes('AskUserQuestion')) {
      disallowedTools.push('AskUserQuestion');
    }
    // EnterPlanMode requires interactive approval in CLI which doesn't work in stream-json mode
    if (!disallowedTools.includes('EnterPlanMode')) {
      disallowedTools.push('EnterPlanMode');
    }
    const mcpServers = this._mcpService.loadServers();
    const mcpConfigPath = Object.keys(mcpServers).length > 0 ? this._mcpService.configPath : undefined;

    const processedText = this._preprocessFileReferences(text);

    // Only inject IDE context and hooks info on the first message of a session
    // to avoid wasting tokens on repeated context every turn
    const isFirstMessage = !this._sessionId;
    const contextPrefix = isFirstMessage ? this._gatherIDEContext() : '';
    const enrichedText = [contextPrefix, processedText].filter(Boolean).join('\n\n');

    void this._claudeService.sendMessage(enrichedText, {
      cwd, yoloMode, effortLevel,
      model: this._stateManager.selectedModel !== 'default' ? this._stateManager.selectedModel : undefined,
      mcpConfigPath, images,
      disallowedTools: disallowedTools.length > 0 ? disallowedTools : undefined,
    });
  }


  private _preprocessFileReferences(text: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return text;
    const rootPath = workspaceFolder.uri.fsPath;

    const fileRefPattern = /@([\w./\\-]+\.\w+)/g;
    const matches: { fullMatch: string; relativePath: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = fileRefPattern.exec(text)) !== null) {
      matches.push({ fullMatch: match[0], relativePath: match[1] });
    }
    if (matches.length === 0) return text;

    const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z', '.exe', '.dll', '.so', '.dylib', '.wasm', '.mp3', '.mp4', '.wav', '.avi', '.mov']);
    let result = text;

    // Pre-validate all files and read in batch (avoid repeated existsSync+statSync)
    const validFiles: { fullMatch: string; relativePath: string; absPath: string; stat: fs.Stats; ext: string }[] = [];
    for (const { fullMatch, relativePath } of matches) {
      const absPath = path.join(rootPath, relativePath);
      try {
        const stat = fs.statSync(absPath);
        if (stat.isDirectory()) continue;
        const ext = path.extname(relativePath).toLowerCase();
        if (binaryExts.has(ext)) continue;
        if (stat.size > 1024 * 1024) {
          result = result.replace(fullMatch, `[File: ${relativePath} | TOO LARGE (${Math.round(stat.size / 1024)}KB) — content not included]`);
          continue;
        }
        validFiles.push({ fullMatch, relativePath, absPath, stat, ext });
      } catch { continue; }
    }

    // Replace @file references with lightweight hints — Claude CLI has its own Read tool
    // to fetch file contents when needed, so inlining wastes tokens
    for (const { fullMatch, relativePath, absPath, ext } of validFiles) {
      try {
        const rawContent = fs.readFileSync(absPath, 'utf8');
        const lines = rawContent.split('\n');
        const lang = this._detectLanguage(ext);
        const declarations = this._extractDeclarations(rawContent, lang);
        const hint = declarations.length > 0
          ? `[File: ${relativePath} | ${lang} | ${lines.length} lines | Exports: ${declarations.slice(0, 10).join(', ')}]`
          : `[File: ${relativePath} | ${lang} | ${lines.length} lines]`;
        result = result.replace(fullMatch, hint);
      } catch { continue; }
    }
    return result;
  }

  private _detectLanguage(ext: string): string {
    const m: Record<string, string> = {
      '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
      '.py': 'python', '.java': 'java', '.kt': 'kotlin', '.go': 'go', '.rs': 'rust',
      '.rb': 'ruby', '.php': 'php', '.cs': 'csharp', '.cpp': 'cpp', '.c': 'c',
      '.swift': 'swift', '.scala': 'scala', '.dart': 'dart', '.vue': 'vue',
      '.html': 'html', '.css': 'css', '.scss': 'scss', '.json': 'json',
      '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml', '.xml': 'xml',
      '.sql': 'sql', '.sh': 'bash', '.md': 'markdown',
    };
    return m[ext] || ext.replace('.', '');
  }

  private _extractDeclarations(content: string, language: string): string[] {
    const decls: string[] = [];
    const lines = content.split('\n');
    let patterns: RegExp[] = [];
    switch (language) {
      case 'typescript': case 'javascript':
        patterns = [/^export\s+(?:default\s+)?(?:class|interface|type|enum|function|const)\s+(\w+)/, /^(?:class|interface|type|enum|function)\s+(\w+)/];
        break;
      case 'python':
        patterns = [/^class\s+(\w+)/, /^def\s+(\w+)/];
        break;
      case 'java': case 'kotlin': case 'csharp':
        patterns = [/^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:class|interface|enum|record|abstract\s+class)\s+(\w+)/];
        break;
      case 'go':
        patterns = [/^func\s+(\w+)/, /^type\s+(\w+)\s+(?:struct|interface)/];
        break;
      case 'rust':
        patterns = [/^pub\s+(?:fn|struct|enum|trait)\s+(\w+)/, /^(?:fn|struct|enum|trait)\s+(\w+)/];
        break;
      default:
        patterns = [/^(?:export\s+)?(?:class|function|interface|type|struct|enum|def)\s+(\w+)/];
    }
    for (const line of lines) {
      for (const p of patterns) {
        const m = line.match(p);
        if (m?.[1]) decls.push(m[1]);
      }
    }
    return [...new Set(decls)].slice(0, 30);
  }

  /**
   * Gather IDE context (workspace, git, active file, open files, selection, diagnostics)
   * to prepend to user messages. Respects the `context.includeFileContext` setting.
   */
  private _gatherIDEContext(): string {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    if (!config.get<boolean>('context.includeFileContext', true)) return '';

    const parts: string[] = [];

    // --- Layer 1: Workspace & Environment ---
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      parts.push(`Workspace: ${workspaceFolder.uri.fsPath}`);
    }

    // Git status (branch + dirty files) — lightweight, no spawn
    this._appendGitContext(parts, workspaceFolder);

    // --- Layer 2: Active file + selection (most relevant context) ---
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      const doc = editor.document;
      const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
      parts.push(`Active file: ${relativePath}`);

      // Selection only — most valuable context, skip if nothing selected
      const selection = editor.selection;
      if (!selection.isEmpty) {
        const selectedText = doc.getText(selection);
        const lines = selectedText.split('\n');
        const capped = lines.length > 100 ? lines.slice(0, 100).join('\n') + '\n... (truncated)' : selectedText;
        parts.push(`Selected text (lines ${selection.start.line + 1}-${selection.end.line + 1}):\n\`\`\`\n${capped}\n\`\`\``);
      }

      // Diagnostics — only errors (warnings are too noisy), cap at 10
      const diagnostics = vscode.languages.getDiagnostics(doc.uri)
        .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
        .slice(0, 10);
      if (diagnostics.length > 0) {
        const items = diagnostics.map(d => {
          const src = d.source ? ` [${d.source}]` : '';
          return `- L${d.range.start.line + 1}: ${d.message}${src}`;
        });
        parts.push(`Errors:\n${items.join('\n')}`);
      }
    }

    if (parts.length === 0) return '';
    return `[IDE Context]\n${parts.join('\n')}\n[/IDE Context]`;
  }

  /**
   * Read active hooks from ~/.claude/settings.json and build a system prompt fragment.
   */
  private _getActiveHooksPrompt(): string {
    try {
      const os = require('os') as typeof import('os');
      const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
      if (!fs.existsSync(settingsPath)) return '';
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) as Record<string, unknown>;
      const hooks = settings.hooks as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>> | undefined;
      if (!hooks || Object.keys(hooks).length === 0) return '';

      const lines: string[] = ['[Active Hooks]'];
      for (const [event, matchers] of Object.entries(hooks)) {
        if (!Array.isArray(matchers) || matchers.length === 0) continue;
        for (const m of matchers) {
          const cmds = m.hooks?.map(h => h.command).join('; ') || '';
          lines.push(`- ${event} (${m.matcher}): ${cmds}`);
        }
      }
      if (lines.length <= 1) return '';
      lines.push('Hooks run automatically by the CLI. Do NOT re-run hook commands manually.');
      lines.push('[/Active Hooks]');
      return lines.join('\n');
    } catch {
      return '';
    }
  }

  /**
   * Append git branch and dirty-file info by reading .git files directly (no child process).
   */
  private _appendGitContext(parts: string[], workspaceFolder?: vscode.WorkspaceFolder): void {
    if (!workspaceFolder) return;

    const gitDir = path.join(workspaceFolder.uri.fsPath, '.git');
    try {
      if (!fs.existsSync(gitDir)) return;

      // Read current branch from .git/HEAD
      const headContent = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf-8').trim();
      const branch = headContent.startsWith('ref: refs/heads/')
        ? headContent.replace('ref: refs/heads/', '')
        : headContent.slice(0, 8); // detached HEAD — show short hash

      parts.push(`Git branch: ${branch}`);
    } catch {
      // .git read failed — skip silently
    }
  }


  private _setupClaudeServiceHandlers(): void {
    this._claudeService.onMessage((message: ClaudeMessage) => {
      void this._messageProcessor.processMessage(message);
    });

    this._claudeService.onProcessStatus((data) => {
      this._postMessage({ type: 'processStatus', data });
    });

    this._claudeService.onHookEvent((data) => {
      this._postMessage({ type: 'hookExecution', data });
    });

    this._claudeService.onProcessEnd(() => {
      this._stateManager.isProcessing = false;
      this._postMessage({ type: 'processStatus', data: null });
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'requestResult', data: { result: 'success' } });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
      this._usageService.onClaudeSessionEnd();

    });

    this._claudeService.onError((error) => {
      log.error('Claude service error', { message: error });
      this._stateManager.isProcessing = false;
      this._postMessage({ type: 'processStatus', data: null });
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'requestResult', data: { result: 'error' } });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });

      if (error.includes('ENOENT') || error.includes('command not found')) {
        this._postMessage({ type: 'showInstallModal' });
      } else if (error.includes('authentication') || error.includes('login') || error.includes('API key') || error.includes('unauthorized') || error.includes('401')) {
        this._postMessage({ type: 'showLoginRequired', data: { message: error } });
      } else {
        this._postMessage({ type: 'error', data: error });
        if (error.includes('permission') || error.includes('denied')) {
          if (!this._settingsManager.isYoloModeEnabled()) {
            this._postMessage({ type: 'error', data: 'Tip: Enable YOLO mode in Settings to skip permission prompts.' });
          }
        }
      }
    });

    this._claudeService.onAccountInfo((subscriptionType) => {
      this._postMessage({ type: 'accountInfo', data: { subscriptionType } });
    });

    this._claudeService.onPermissionRequest((request) => {
      if (this._settingsManager.isYoloModeEnabled()) {
        log.info('YOLO mode: auto-approving permission', { tool: request.toolName });
        this._claudeService.sendPermissionResponse(request.requestId, true);
        return;
      }

      this._postMessage({
        type: 'permissionRequest',
        data: {
          id: request.requestId,
          tool: request.toolName,
          input: request.input,
          pattern: request.pattern,
          suggestions: request.suggestions,
          decisionReason: request.decisionReason,
          blockedPath: request.blockedPath,
          status: 'pending',
        },
      });
    });
  }

  private _replayConversation(): void {
    const conversation = this._messageProcessor.currentConversation;
    if (conversation.length > 0) {
      const replayMessages = conversation.map((msg) => ({ type: msg.messageType, data: msg.data }));
      this._postMessage({
        type: 'batchReplay',
        data: {
          messages: replayMessages,
          sessionId: this._sessionId,
          totalCost: this._stateManager.totalCost,
          isProcessing: this._stateManager.isProcessing,
        },
      });
    } else {
      this._postMessage({ type: 'sessionCleared' });
    }
  }

  private _saveConversation(sessionId?: string): void {
    if (!sessionId) return;
    const conversation = this._messageProcessor.currentConversation;
    if (conversation.length === 0) return;

    void this._conversationService.saveConversation(
      sessionId, conversation,
      this._stateManager.totalCost,
      this._stateManager.totalTokensInput,
      this._stateManager.totalTokensOutput,
    );
  }

  private _findUserInputPosition(conversation: ConversationMessage[], userInputIndex: number): number {
    let count = -1;
    for (let i = 0; i < conversation.length; i++) {
      if (conversation[i].messageType === 'userInput') {
        count++;
        if (count === userInputIndex) return i;
      }
    }
    return -1;
  }

  private _postMessage(message: Record<string, unknown>): void {
    if (this._panel?.webview) {
      this._panel.webview.postMessage(message);
    } else if (this._webview) {
      this._webview.postMessage(message);
    }
  }
}

// ============================================================================
// WebviewProvider (sidebar)
// ============================================================================

export class WebviewProvider implements vscode.WebviewViewProvider {
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _panelProvider: PanelProvider,
    private readonly _conversationService: ConversationService,
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Restore sidebar conversation from saved webview state (survives extension host restart)
    const savedState = context.state as { sessionId?: string } | undefined;
    if (savedState?.sessionId) {
      void this._conversationService.findBySessionId(savedState.sessionId).then((conversation) => {
        if (conversation) {
          this._panelProvider.loadConversationData(
            conversation.messages,
            conversation.sessionId,
            conversation.totalCost,
          );
        }
      });
    }

    // Prevent webview destruction when sidebar is hidden
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._panelProvider.closeMainPanel();
      }
    });

    this._panelProvider.showInWebview(webviewView.webview, webviewView);
  }
}
