import * as vscode from 'vscode';
import { ClaudeService } from '../services/ClaudeService';
import { ConversationService } from '../services/ConversationService';
import { MCPService } from '../services/MCPService';
import { BackupService } from '../services/BackupService';
import { UsageService } from '../services/UsageService';
import { PermissionService } from '../services/PermissionService';
import { ClaudeMessageProcessor, type MessagePoster } from './ClaudeMessageProcessor';
import { SessionStateManager } from './SessionStateManager';
import { SettingsManager } from './SettingsManager';
import { handleWebviewMessage, type WebviewMessage } from './handlers';
import { getWebviewHtml } from './html';
import type { ClaudeMessage, WebviewToExtensionMessage } from '../../shared/types';

/**
 * Manages the webview panel lifecycle, message routing, and Claude CLI interaction.
 */
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
    // Load saved preferences
    this._stateManager.selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');

    // Create message processor
    const poster: MessagePoster = {
      postMessage: (msg) => this._postMessage(msg),
      sendAndSaveMessage: (msg) => this._postMessage(msg),
    };

    this._messageProcessor = new ClaudeMessageProcessor(poster, this._stateManager, {
      onSessionIdReceived: (sessionId) => {
        this._claudeService.setSessionId(sessionId);
      },
      onProcessingComplete: (result) => {
        this._saveConversation(result.sessionId);
      },
    });

    // Wire up Claude service events
    this._setupClaudeServiceHandlers();

    // Wire up usage service events
    this._usageService.onUsageUpdate((data) => {
      this._postMessage({ type: 'usageUpdate', data });
    });
    this._usageService.onError((err) => {
      this._postMessage({ type: 'usageError', data: err });
    });
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
      this._stateManager.isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });

      if (error.includes('ENOENT') || error.includes('command not found')) {
        this._postMessage({ type: 'showInstallModal' });
      } else if (error.includes('authentication') || error.includes('login') || error.includes('API key') || error.includes('unauthorized') || error.includes('401')) {
        this._postMessage({
          type: 'showLoginRequired',
          data: { message: error },
        });
      } else {
        this._postMessage({ type: 'error', data: error });
        // Suggest YOLO if it's a permission error
        if (error.includes('permission') || error.includes('denied')) {
          if (!this._settingsManager.isYoloModeEnabled()) {
            this._postMessage({
              type: 'error',
              data: 'Tip: Enable YOLO mode in Settings to skip permission prompts.',
            });
          }
        }
      }
    });

    this._claudeService.onPermissionRequest((request) => {
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

  /** Show the panel in the editor area */
  show(column: vscode.ViewColumn | vscode.Uri = vscode.ViewColumn.Two): void {
    const actualColumn = column instanceof vscode.Uri ? vscode.ViewColumn.Two : column;

    if (this._panel) {
      this._panel.reveal(actualColumn);
      return;
    }

    this._panel = vscode.window.createWebviewPanel(
      'claudeCodeChatUI',
      'Claude Code ChatUI',
      actualColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [this._extensionUri],
      },
    );

    this._panel.webview.html = getWebviewHtml(this._panel.webview, this._extensionUri);
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._setupWebviewMessageHandler(this._panel.webview);
  }

  /** Show in a sidebar webview */
  showInWebview(webview: vscode.Webview, webviewView?: vscode.WebviewView): void {
    if (this._panel) {
      this._panel.dispose();
      this._panel = undefined;
    }

    this._webview = webview;
    this._webviewView = webviewView;
    this._webview.html = getWebviewHtml(this._webview, this._extensionUri);
    this._setupWebviewMessageHandler(this._webview);
  }

  closeMainPanel(): void {
    if (this._panel) {
      this._panel.dispose();
      this._panel = undefined;
    }
  }

  reinitializeWebview(): void {
    if (this._webview) {
      this._setupWebviewMessageHandler(this._webview);
    }
  }

  async newSession(): Promise<void> {
    // Save current conversation before clearing
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

    // Stop current process and clear
    await this._claudeService.stopProcess();
    this._claudeService.setSessionId(conversation.sessionId);
    this._messageProcessor.resetSession();
    this._stateManager.restoreFromConversation({
      totalCost: conversation.totalCost,
      totalTokens: conversation.totalTokens,
    });

    // Replay messages to webview
    this._postMessage({ type: 'sessionCleared' });
    for (const msg of conversation.messages) {
      this._postMessage({ type: msg.messageType, data: msg.data } as Record<string, unknown>);
    }

    this._postMessage({
      type: 'restoreState',
      state: {
        sessionId: conversation.sessionId,
        totalCost: conversation.totalCost,
      },
    });
  }

  dispose(): void {
    this._panel = undefined;
    this._messageHandlerDisposable?.dispose();
    this._messageHandlerDisposable = undefined;
    while (this._disposables.length) {
      this._disposables.pop()?.dispose();
    }
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

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    this._stateManager.isProcessing = true;
    this._stateManager.draftMessage = '';

    // Create backup checkpoint before sending
    void this._backupService.createCheckpoint(text).then((commit) => {
      if (commit) {
        this._postMessage({ type: 'restorePoint', data: commit });
      }
    });

    // Show user message in chat
    this._postMessage({ type: 'userInput', data: text });

    // Set processing state
    this._postMessage({ type: 'setProcessing', data: { isProcessing: true } });

    // Show loading
    this._postMessage({ type: 'loading', data: 'Claude is working...' });

    // Get yolo mode from settings manager
    const yoloMode = this._settingsManager.isYoloModeEnabled();

    // Pass MCP config path if servers are configured
    const mcpServers = this._mcpService.loadServers();
    const mcpConfigPath = Object.keys(mcpServers).length > 0 ? this._mcpService.configPath : undefined;

    void this._claudeService.sendMessage(text, {
      cwd,
      planMode,
      thinkingMode,
      yoloMode,
      model: this._stateManager.selectedModel !== 'default' ? this._stateManager.selectedModel : undefined,
      mcpConfigPath,
      images,
    });
  }

  private _saveConversation(sessionId?: string): void {
    if (!sessionId) return;
    const conversation = this._messageProcessor.currentConversation;
    if (conversation.length === 0) return;

    void this._conversationService.saveConversation(
      sessionId,
      conversation,
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
