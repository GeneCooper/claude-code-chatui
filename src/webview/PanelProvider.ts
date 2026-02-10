import * as vscode from 'vscode';
import { ClaudeService } from '../services/ClaudeService';
import { ConversationService } from '../services/ConversationService';
import { DiffContentProvider } from '../providers/DiffContentProvider';
import { ClaudeMessageProcessor, type MessagePoster } from './ClaudeMessageProcessor';
import { getWebviewHtml } from './html';
import type { ClaudeMessage, WebviewToExtensionMessage } from '../shared/types';

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

  // Session state
  private _isProcessing = false;
  private _selectedModel = 'default';
  private _draftMessage = '';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _claudeService: ClaudeService,
    private readonly _conversationService: ConversationService,
  ) {
    // Load saved preferences
    this._selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');

    // Create message processor
    const poster: MessagePoster = {
      postMessage: (msg) => this._postMessage(msg),
      sendAndSaveMessage: (msg) => this._postMessage(msg),
    };

    this._messageProcessor = new ClaudeMessageProcessor(poster, {
      onSessionIdReceived: (sessionId) => {
        this._claudeService.setSessionId(sessionId);
      },
      onProcessingComplete: (result) => {
        this._saveConversation(result.sessionId);
      },
    });

    // Wire up Claude service events
    this._setupClaudeServiceHandlers();
  }

  private _setupClaudeServiceHandlers(): void {
    this._claudeService.onMessage((message: ClaudeMessage) => {
      void this._messageProcessor.processMessage(message);
    });

    this._claudeService.onProcessEnd(() => {
      this._isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
    });

    this._claudeService.onError((error) => {
      this._isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });

      if (error.includes('ENOENT') || error.includes('command not found')) {
        this._postMessage({ type: 'showInstallModal' });
      } else {
        this._postMessage({ type: 'error', data: error });
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

    this._isProcessing = false;
    this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
    this._postMessage({ type: 'clearLoading' });

    await this._claudeService.stopProcess();
    this._claudeService.setSessionId(undefined);
    this._messageProcessor.resetSession();

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
      (message: WebviewToExtensionMessage) => this._handleWebviewMessage(message),
      null,
      this._disposables,
    );
  }

  private _handleWebviewMessage(message: WebviewToExtensionMessage): void {
    switch (message.type) {
      case 'sendMessage':
        this._handleSendMessage(message.text, message.planMode, message.thinkingMode);
        return;
      case 'newSession':
        void this.newSession();
        return;
      case 'stopRequest':
        void this._claudeService.stopProcess();
        return;
      case 'ready':
        this._postMessage({ type: 'ready', data: 'Extension ready' });
        return;
      case 'permissionResponse':
        this._claudeService.sendPermissionResponse(message.id, message.approved, message.alwaysAllow);
        this._postMessage({
          type: 'updatePermissionStatus',
          data: { id: message.id, status: message.approved ? 'approved' : 'denied' },
        });
        return;
      case 'selectModel':
        this._selectedModel = message.model;
        void this._context.workspaceState.update('claude.selectedModel', message.model);
        return;
      case 'saveInputText':
        this._draftMessage = message.text;
        return;
      case 'openFile':
        this._openFile(message.filePath);
        return;
      case 'openDiff':
        void DiffContentProvider.openDiff(message.oldContent, message.newContent, message.filePath);
        return;
      case 'getConversationList':
        this._postMessage({
          type: 'conversationList',
          data: this._conversationService.getConversationList(),
        });
        return;
      case 'loadConversation':
        void this.loadConversation(message.filename);
        return;
      case 'getSettings':
        this._sendCurrentSettings();
        return;
      case 'updateSettings':
        this._updateSettings(message.settings);
        return;
    }
  }

  private _handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean): void {
    if (this._isProcessing) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    this._isProcessing = true;
    this._draftMessage = '';

    // Show user message in chat
    this._postMessage({ type: 'userInput', data: text });

    // Set processing state
    this._postMessage({ type: 'setProcessing', data: { isProcessing: true } });

    // Show loading
    this._postMessage({ type: 'loading', data: 'Claude is working...' });

    // Get yolo mode from settings
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    const yoloMode = config.get<boolean>('permissions.yoloMode', false);

    void this._claudeService.sendMessage(text, {
      cwd,
      planMode,
      thinkingMode,
      yoloMode,
      model: this._selectedModel !== 'default' ? this._selectedModel : undefined,
    });
  }

  private _openFile(filePath: string): void {
    const uri = vscode.Uri.file(filePath);
    vscode.workspace.openTextDocument(uri).then((doc) => {
      vscode.window.showTextDocument(doc, { preview: true });
    });
  }

  private _saveConversation(sessionId?: string): void {
    if (!sessionId) return;
    const conversation = this._messageProcessor.currentConversation;
    if (conversation.length === 0) return;

    void this._conversationService.saveConversation(
      sessionId,
      conversation,
      this._messageProcessor.totalCost,
      this._messageProcessor.totalTokensInput,
      this._messageProcessor.totalTokensOutput,
    );
  }

  private _sendCurrentSettings(): void {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    this._postMessage({
      type: 'settings' as string,
      data: {
        thinkingIntensity: config.get('thinking.intensity', 'think'),
        yoloMode: config.get('permissions.yoloMode', false),
      },
    });
  }

  private _updateSettings(settings: Record<string, unknown>): void {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    for (const [key, value] of Object.entries(settings)) {
      void config.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  private _postMessage(message: Record<string, unknown>): void {
    if (this._panel?.webview) {
      this._panel.webview.postMessage(message);
    } else if (this._webview) {
      this._webview.postMessage(message);
    }
  }
}
