import * as vscode from 'vscode';
import { ClaudeService } from '../services/ClaudeService';
import { ConversationService } from '../services/ConversationService';
import { MCPService } from '../services/MCPService';
import { BackupService } from '../services/BackupService';
import { DiffContentProvider } from '../providers/DiffContentProvider';
import { ClaudeMessageProcessor, type MessagePoster } from './ClaudeMessageProcessor';
import { getWebviewHtml } from './html';
import { FILE_SEARCH_EXCLUDES } from '../../shared/constants';
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

  // Session state
  private _isProcessing = false;
  private _selectedModel = 'default';
  private _draftMessage = '';

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _claudeService: ClaudeService,
    private readonly _conversationService: ConversationService,
    private readonly _mcpService: MCPService,
    private readonly _backupService: BackupService,
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
      } else if (error.includes('authentication') || error.includes('login') || error.includes('API key') || error.includes('unauthorized') || error.includes('401')) {
        this._postMessage({
          type: 'showLoginRequired',
          data: { message: error },
        });
      } else {
        this._postMessage({ type: 'error', data: error });
        // Suggest YOLO if it's a permission error
        if (error.includes('permission') || error.includes('denied')) {
          const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
          if (!config.get<boolean>('permissions.yoloMode', false)) {
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
        // Use model from message if provided, otherwise use saved model
        if (message.model) {
          this._selectedModel = message.model;
          void this._context.workspaceState.update('claude.selectedModel', message.model);
        }
        this._handleSendMessage(message.text, message.planMode, message.thinkingMode, message.images);
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
      case 'openExternal':
        void vscode.env.openExternal(vscode.Uri.parse((message as { url: string }).url));
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
      // Phase 3: Slash commands
      case 'executeSlashCommand':
        this._executeSlashCommand(message.command);
        return;
      // Phase 3: File picker
      case 'getWorkspaceFiles':
        void this._sendWorkspaceFiles(message.searchTerm);
        return;
      // Phase 3: MCP
      case 'loadMCPServers':
        this._postMessage({ type: 'mcpServers', data: this._mcpService.loadServers() });
        return;
      case 'saveMCPServer':
        try {
          this._mcpService.saveServer(message.name, message.config);
          this._postMessage({ type: 'mcpServerSaved', data: { name: message.name } });
        } catch {
          this._postMessage({ type: 'mcpServerError', data: { error: 'Failed to save MCP server' } });
        }
        return;
      case 'deleteMCPServer':
        if (this._mcpService.deleteServer(message.name)) {
          this._postMessage({ type: 'mcpServerDeleted', data: { name: message.name } });
        } else {
          this._postMessage({ type: 'mcpServerError', data: { error: `Server "${message.name}" not found` } });
        }
        return;
      // Phase 3: Backup
      case 'createBackup':
        void this._createBackup(message.message);
        return;
      case 'restoreBackup':
        void this._restoreBackup(message.commitSha);
        return;
    }
  }

  private _handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[]): void {
    if (this._isProcessing) return;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    this._isProcessing = true;
    this._draftMessage = '';

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

    // Get yolo mode from settings
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    const yoloMode = config.get<boolean>('permissions.yoloMode', false);

    // Pass MCP config path if servers are configured
    const mcpServers = this._mcpService.loadServers();
    const mcpConfigPath = Object.keys(mcpServers).length > 0 ? this._mcpService.configPath : undefined;

    void this._claudeService.sendMessage(text, {
      cwd,
      planMode,
      thinkingMode,
      yoloMode,
      model: this._selectedModel !== 'default' ? this._selectedModel : undefined,
      mcpConfigPath,
      images,
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
      type: 'settingsData',
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

  private _executeSlashCommand(command: string): void {
    if (command === 'compact') {
      // Compact runs in chat, not terminal
      this._handleSendMessage('/compact');
      return;
    }
    if (command === 'clear') {
      void this.newSession();
      return;
    }

    // Open terminal for native commands
    const sessionId = this._claudeService.sessionId;
    const args = sessionId ? `/${command} --resume ${sessionId}` : `/${command}`;
    const terminal = vscode.window.createTerminal({ name: `Claude: /${command}` });
    terminal.sendText(`claude ${args}`);
    terminal.show();
  }

  private async _sendWorkspaceFiles(searchTerm?: string): Promise<void> {
    const excludePattern = FILE_SEARCH_EXCLUDES;
    try {
      const uris = await vscode.workspace.findFiles('**/*', excludePattern, 500);
      let files = uris.map((uri) => {
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        const name = relativePath.split(/[\\/]/).pop() || '';
        return { name, path: relativePath, fsPath: uri.fsPath };
      });

      // Filter by search term
      if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        files = files.filter((f) =>
          f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower),
        );
      }

      // Sort and limit
      files.sort((a, b) => a.path.localeCompare(b.path));
      files = files.slice(0, 50);

      this._postMessage({ type: 'workspaceFiles', data: files });
    } catch {
      this._postMessage({ type: 'workspaceFiles', data: [] });
    }
  }

  private async _createBackup(message: string): Promise<void> {
    const commit = await this._backupService.createCheckpoint(message);
    if (commit) {
      this._postMessage({ type: 'restorePoint', data: commit });
    }
  }

  private async _restoreBackup(commitSha: string): Promise<void> {
    const success = await this._backupService.restoreToCommit(commitSha);
    if (success) {
      this._postMessage({ type: 'output', data: 'Workspace restored to checkpoint successfully.' });
    } else {
      this._postMessage({ type: 'error', data: 'Failed to restore checkpoint.' });
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
