import * as vscode from 'vscode';
import { ClaudeService } from './claude';
import { ConversationService, BackupService, UsageService, MCPService } from './storage';
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
import type { ClaudeMessage, WebviewToExtensionMessage } from '../shared/types';

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
// PanelProvider
// ============================================================================

export class PanelProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private _webview: vscode.Webview | undefined;
  private _webviewView: vscode.WebviewView | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _messageHandlerDisposable: vscode.Disposable | undefined;

  private readonly _messageProcessor: ClaudeMessageProcessor;
  private readonly _stateManager = new SessionStateManager();
  private readonly _settingsManager = new SettingsManager();

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _claudeService: ClaudeService,
    private readonly _conversationService: ConversationService,
    private readonly _mcpService: MCPService,
    private readonly _backupService: BackupService,
    private readonly _usageService: UsageService,
    private readonly _permissionService: PermissionService,
  ) {
    this._stateManager.selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');
    log.info('PanelProvider initialized');

    const poster: MessagePoster = {
      postMessage: (msg) => this._postMessage(msg),
      sendAndSaveMessage: (msg) => this._postMessage(msg),
    };

    this._messageProcessor = new ClaudeMessageProcessor(poster, this._stateManager, {
      onSessionIdReceived: (sessionId) => { this._claudeService.setSessionId(sessionId); },
      onProcessingComplete: (result) => { this._saveConversation(result.sessionId); },
    });

    this._setupClaudeServiceHandlers();

    this._usageService.onUsageUpdate((data) => { this._postMessage({ type: 'usageUpdate', data }); });
    this._usageService.onError((err) => { this._postMessage({ type: 'usageError', data: err }); });
  }

  private _setupClaudeServiceHandlers(): void {
    this._claudeService.onMessage((message: ClaudeMessage) => {
      void this._messageProcessor.processMessage(message);
    });

    this._claudeService.onProcessEnd(() => {
      this._stateManager.isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
      this._usageService.onClaudeSessionEnd();
    });

    this._claudeService.onError((error) => {
      log.error('Claude service error', { message: error });
      this._stateManager.isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
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
      // When YOLO mode is enabled, auto-approve permission requests that
      // somehow still reach us (the CLI flag should prevent them, but this
      // acts as a safety-net fallback).
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

  // ==================== Public API ====================

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

    this._panel.webview.html = getWebviewHtml(this._panel.webview, this._extensionUri);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
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

    if (!isSameWebview) {
      // Only set HTML on a fresh webview; skip if retainContextWhenHidden kept it alive
      this._webview.html = getWebviewHtml(this._webview, this._extensionUri);
      this._setupWebviewMessageHandler(this._webview);
    }
  }

  attachFileContext(relativePath: string): void {
    // Send with a small delay to ensure webview is ready after show()
    setTimeout(() => {
      this._postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
    }, 100);
  }

  closeMainPanel(): void {
    if (this._panel) {
      this._panel.dispose();
      this._panel = undefined;
    }
  }

  reinitializeWebview(): void {
    // No-op: with retainContextWhenHidden the webview stays alive,
    // so we don't need to re-bind handlers on visibility change.
  }

  async newSession(): Promise<void> {
    this._saveConversation(this._claudeService.sessionId);

    this._stateManager.isProcessing = false;
    this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
    this._postMessage({ type: 'clearLoading' });

    await this._claudeService.stopProcess();
    this._claudeService.setSessionId(undefined);
    this._messageProcessor.resetSession();
    this._stateManager.resetSession();

    this._postMessage({ type: 'sessionCleared' });
  }

  async loadConversation(filename: string): Promise<void> {
    const conversation = this._conversationService.loadConversation(filename);
    if (!conversation) {
      this._postMessage({ type: 'error', data: 'Failed to load conversation' });
      return;
    }

    await this._claudeService.stopProcess();
    this._claudeService.setSessionId(conversation.sessionId);
    this._messageProcessor.resetSession();
    this._stateManager.restoreFromConversation({
      totalCost: conversation.totalCost,
      totalTokens: conversation.totalTokens,
    });

    this._postMessage({ type: 'sessionCleared' });
    for (const msg of conversation.messages) {
      this._postMessage({ type: msg.messageType, data: msg.data } as Record<string, unknown>);
    }

    this._postMessage({
      type: 'restoreState',
      state: { sessionId: conversation.sessionId, totalCost: conversation.totalCost },
    });
  }

  dispose(): void {
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
      backupService: this._backupService,
      usageService: this._usageService,
      permissionService: this._permissionService,
      stateManager: this._stateManager,
      settingsManager: this._settingsManager,
      messageProcessor: this._messageProcessor,
      extensionContext: this._context,
      postMessage: (msg: Record<string, unknown>) => this._postMessage(msg),
      newSession: () => this.newSession(),
      loadConversation: (filename: string) => this.loadConversation(filename),
      handleSendMessage: (text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[]) =>
        this._handleSendMessage(text, planMode, thinkingMode, images),
    };
  }

  private _handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[]): void {
    if (this._stateManager.isProcessing) return;
    log.info('Sending message', { planMode, thinkingMode, hasImages: !!images?.length });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    this._stateManager.isProcessing = true;
    this._stateManager.draftMessage = '';

    void this._backupService.createCheckpoint(text).then((commit) => {
      if (commit) this._postMessage({ type: 'restorePoint', data: commit });
    });

    // Save userInput to conversation so it replays on webview reload (tab switch)
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
    const mcpServers = this._mcpService.loadServers();
    const mcpConfigPath = Object.keys(mcpServers).length > 0 ? this._mcpService.configPath : undefined;

    void this._claudeService.sendMessage(text, {
      cwd, planMode, thinkingMode, yoloMode,
      model: this._stateManager.selectedModel !== 'default' ? this._stateManager.selectedModel : undefined,
      mcpConfigPath, images,
    });
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
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Prevent webview destruction when sidebar is hidden
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._panelProvider.closeMainPanel();
        this._panelProvider.reinitializeWebview();
      }
    });

    this._panelProvider.showInWebview(webviewView.webview, webviewView);
  }
}

