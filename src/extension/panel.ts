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
import type { ClaudeMessage, WebviewToExtensionMessage, TabInfo, ConversationMessage } from '../shared/types';

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

interface TabContext {
  tabId: string;
  title: string;
  messageProcessor: ClaudeMessageProcessor;
  stateManager: SessionStateManager;
  sessionId: string | undefined;
}

export class PanelProvider {
  private _panel: vscode.WebviewPanel | undefined;
  private _webview: vscode.Webview | undefined;
  private _webviewView: vscode.WebviewView | undefined;
  private _disposables: vscode.Disposable[] = [];
  private _messageHandlerDisposable: vscode.Disposable | undefined;

  private readonly _settingsManager = new SettingsManager();

  // Multi-tab state
  private _tabs = new Map<string, TabContext>();
  private _activeTabId: string | null = null;
  private _processingTabId: string | null = null;
  private _tabCounter = 0;
  private static readonly MAX_TABS = 10;

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
    log.info('PanelProvider initialized');

    // Create default first tab
    const defaultTab = this._createTab();
    this._activeTabId = defaultTab.tabId;

    this._setupClaudeServiceHandlers();

    this._usageService.onUsageUpdate((data) => { this._postMessage({ type: 'usageUpdate', data }); });
    this._usageService.onError((err) => { this._postMessage({ type: 'usageError', data: err }); });

    // Real-time rate-limit updates from the main Claude process stderr
    this._claudeService.onRateLimitUpdate((data) => { this._usageService.updateFromRateLimits(data); });

    // Track editor text selection and send to webview
    this._disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        const editor = e.textEditor;
        const sel = editor.selection;
        if (sel.isEmpty) {
          this._postMessage({ type: 'editorSelection', data: null });
        } else {
          const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
          this._postMessage({
            type: 'editorSelection',
            data: {
              filePath: relativePath,
              startLine: sel.start.line + 1,
              endLine: sel.end.line + 1,
              text: editor.document.getText(sel),
            },
          });
        }
      }),
    );
  }

  // ==================== Tab Management ====================

  private _createTab(title = 'New Chat'): TabContext {
    const tabId = `tab-${++this._tabCounter}`;
    const stateManager = new SessionStateManager();
    stateManager.selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');

    const poster: MessagePoster = {
      postMessage: (msg) => this._postMessage(msg),
      sendAndSaveMessage: (msg) => this._postMessage(msg),
    };

    const tab: TabContext = { tabId, title, stateManager, sessionId: undefined, messageProcessor: undefined as unknown as ClaudeMessageProcessor };

    tab.messageProcessor = new ClaudeMessageProcessor(poster, stateManager, {
      onSessionIdReceived: (sessionId) => {
        this._claudeService.setSessionId(sessionId);
        tab.sessionId = sessionId;
      },
      onProcessingComplete: (result) => { this._saveTabConversation(tabId, result.sessionId); },
    });

    this._tabs.set(tabId, tab);
    return tab;
  }

  private _getActiveTab(): TabContext | undefined {
    return this._activeTabId ? this._tabs.get(this._activeTabId) : undefined;
  }

  createNewTab(): string | undefined {
    if (this._tabs.size >= PanelProvider.MAX_TABS) return undefined;

    const tab = this._createTab();
    this._activeTabId = tab.tabId;

    this._postMessage({ type: 'tabCreated', data: { tabId: tab.tabId, title: tab.title } });
    this._postMessage({ type: 'sessionCleared' });
    return tab.tabId;
  }

  switchTab(tabId: string): void {
    if (!this._tabs.has(tabId) || tabId === this._activeTabId) return;
    this._activeTabId = tabId;
    const tab = this._tabs.get(tabId)!;
    this._replayTabConversation(tab);
  }

  closeTab(tabId: string): void {
    const tab = this._tabs.get(tabId);
    if (!tab) return;

    // Save conversation before closing
    this._saveTabConversation(tabId, tab.sessionId);

    // If this tab is processing, stop the process
    if (this._processingTabId === tabId) {
      void this._claudeService.stopProcess();
      this._processingTabId = null;
    }

    this._tabs.delete(tabId);

    // If closing active tab, switch to another
    if (this._activeTabId === tabId) {
      const remaining = [...this._tabs.keys()];
      if (remaining.length === 0) {
        const fresh = this._createTab();
        this._activeTabId = fresh.tabId;
        this._postMessage({ type: 'tabCreated', data: { tabId: fresh.tabId, title: fresh.title } });
        this._postMessage({ type: 'tabClosed', data: { tabId, newActiveTabId: fresh.tabId } });
        this._postMessage({ type: 'sessionCleared' });
        return;
      }
      this._activeTabId = remaining[remaining.length - 1];
      this._postMessage({ type: 'tabClosed', data: { tabId, newActiveTabId: this._activeTabId } });
      this.switchTab(this._activeTabId);
    } else {
      this._postMessage({ type: 'tabClosed', data: { tabId, newActiveTabId: this._activeTabId! } });
    }
  }

  rewindToMessage(userInputIndex: number): void {
    const tab = this._getActiveTab();
    if (!tab) return;
    if (this._processingTabId === tab.tabId) return;

    const conversation = tab.messageProcessor.currentConversation;
    const pos = this._findUserInputPosition(conversation, userInputIndex);
    if (pos === -1) return;

    tab.messageProcessor.truncateConversation(pos);
    tab.sessionId = undefined;
    this._replayTabConversation(tab);
  }

  forkFromMessage(userInputIndex: number): void {
    const tab = this._getActiveTab();
    if (!tab) return;
    if (this._tabs.size >= PanelProvider.MAX_TABS) {
      this._postMessage({ type: 'error', data: 'Cannot fork: maximum number of tabs reached.' });
      return;
    }

    const conversation = tab.messageProcessor.currentConversation;
    const pos = this._findUserInputPosition(conversation, userInputIndex);
    if (pos === -1) return;

    const forkedMessages = conversation.slice(0, pos + 1);
    const newTab = this._createTab();

    for (const msg of forkedMessages) {
      newTab.messageProcessor.currentConversation.push({ ...msg });
    }

    const targetMsg = forkedMessages[pos];
    const text = typeof targetMsg.data === 'string'
      ? targetMsg.data
      : ((targetMsg.data as Record<string, unknown>)?.text as string || 'Fork');
    newTab.title = text.substring(0, 25) + (text.length > 25 ? '...' : '') + ' (fork)';

    this._activeTabId = newTab.tabId;
    this._postMessage({ type: 'tabCreated', data: { tabId: newTab.tabId, title: newTab.title } });
    this._replayTabConversation(newTab);
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

  getTabsState(): { tabs: TabInfo[]; activeTabId: string; processingTabId: string | null } {
    const tabs: TabInfo[] = [...this._tabs.values()].map((t) => ({
      tabId: t.tabId,
      title: t.title,
      isProcessing: this._processingTabId === t.tabId,
      sessionId: t.sessionId || null,
    }));
    return { tabs, activeTabId: this._activeTabId || '', processingTabId: this._processingTabId };
  }

  private _replayTabConversation(tab: TabContext): void {
    const conversation = tab.messageProcessor.currentConversation;
    if (conversation.length > 0) {
      const replayMessages = conversation.map((msg) => ({ type: msg.messageType, data: msg.data }));
      this._postMessage({
        type: 'batchReplay',
        data: {
          messages: replayMessages,
          sessionId: tab.sessionId,
          totalCost: tab.stateManager.totalCost,
          isProcessing: tab.stateManager.isProcessing,
        },
      });
    } else {
      this._postMessage({ type: 'sessionCleared' });
    }
  }

  private _setupClaudeServiceHandlers(): void {
    this._claudeService.onMessage((message: ClaudeMessage) => {
      const tab = this._processingTabId ? this._tabs.get(this._processingTabId) : undefined;
      if (tab) void tab.messageProcessor.processMessage(message);
    });

    this._claudeService.onProcessEnd(() => {
      const tab = this._processingTabId ? this._tabs.get(this._processingTabId) : undefined;
      if (tab) {
        tab.stateManager.isProcessing = false;
        // Only send chat messages if this is the active tab
        if (this._processingTabId === this._activeTabId) {
          this._postMessage({ type: 'clearLoading' });
          this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        }
        this._postMessage({ type: 'tabProcessingChanged', data: { tabId: this._processingTabId, isProcessing: false } });
      }
      this._processingTabId = null;
      this._usageService.onClaudeSessionEnd();
    });

    this._claudeService.onError((error) => {
      log.error('Claude service error', { message: error });
      const tab = this._processingTabId ? this._tabs.get(this._processingTabId) : undefined;
      if (tab) {
        tab.stateManager.isProcessing = false;
        if (this._processingTabId === this._activeTabId) {
          this._postMessage({ type: 'clearLoading' });
          this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
        }
        this._postMessage({ type: 'tabProcessingChanged', data: { tabId: this._processingTabId!, isProcessing: false } });
      }
      this._processingTabId = null;

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

    this._panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'icon.png');
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
    // Creates a new tab (or resets current if at max)
    const created = this.createNewTab();
    if (!created) {
      // At max tabs — reset current tab instead
      const tab = this._getActiveTab();
      if (tab) {
        this._saveTabConversation(tab.tabId, tab.sessionId);
        if (this._processingTabId === tab.tabId) {
          await this._claudeService.stopProcess();
          this._processingTabId = null;
        }
        tab.messageProcessor.resetSession();
        tab.stateManager.resetSession();
        tab.sessionId = undefined;
        tab.title = 'New Chat';
        this._postMessage({ type: 'sessionCleared' });
        this._postMessage({ type: 'tabTitleUpdated', data: { tabId: tab.tabId, title: tab.title } });
      }
    }
  }

  async loadConversation(filename: string): Promise<void> {
    const conversation = this._conversationService.loadConversation(filename);
    if (!conversation) {
      this._postMessage({ type: 'error', data: 'Failed to load conversation' });
      return;
    }

    // Create a new tab for the loaded conversation (or reuse current if at max)
    let tab: TabContext;
    if (this._tabs.size < PanelProvider.MAX_TABS) {
      tab = this._createTab();
    } else {
      tab = this._getActiveTab()!;
      tab.messageProcessor.resetSession();
      tab.stateManager.resetSession();
    }

    tab.sessionId = conversation.sessionId;
    tab.stateManager.restoreFromConversation({
      totalCost: conversation.totalCost,
      totalTokens: conversation.totalTokens,
    });

    // Populate the processor's conversation array for replay
    for (const msg of conversation.messages) {
      tab.messageProcessor.currentConversation.push(msg);
    }

    // Derive title from first user message
    const firstUser = conversation.messages.find((m) => m.messageType === 'userInput');
    if (firstUser) {
      const text = typeof firstUser.data === 'string'
        ? firstUser.data
        : ((firstUser.data as Record<string, unknown>)?.text as string || '');
      tab.title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
    }

    this._activeTabId = tab.tabId;
    this._postMessage({ type: 'tabCreated', data: { tabId: tab.tabId, title: tab.title } });
    this._replayTabConversation(tab);
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
    const activeTab = this._getActiveTab();
    const fallbackStateManager = activeTab?.stateManager ?? new SessionStateManager();
    const fallbackProcessor = activeTab?.messageProcessor ?? new ClaudeMessageProcessor(
      { postMessage: () => {}, sendAndSaveMessage: () => {} },
      fallbackStateManager,
      { onSessionIdReceived: () => {}, onProcessingComplete: () => {} },
    );

    return {
      claudeService: this._claudeService,
      conversationService: this._conversationService,
      mcpService: this._mcpService,
      backupService: this._backupService,
      usageService: this._usageService,
      permissionService: this._permissionService,
      stateManager: fallbackStateManager,
      settingsManager: this._settingsManager,
      messageProcessor: fallbackProcessor,
      extensionContext: this._context,
      postMessage: (msg: Record<string, unknown>) => this._postMessage(msg),
      newSession: () => this.newSession(),
      loadConversation: (filename: string) => this.loadConversation(filename),
      handleSendMessage: (text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[], tabId?: string) =>
        this._handleSendMessage(text, planMode, thinkingMode, images, tabId),
      createNewTab: () => this.createNewTab(),
      switchTab: (tabId: string) => this.switchTab(tabId),
      closeTab: (tabId: string) => this.closeTab(tabId),
      getTabsState: () => this.getTabsState(),
      activeTabId: this._activeTabId,
      processingTabId: this._processingTabId,
      rewindToMessage: (userInputIndex: number) => this.rewindToMessage(userInputIndex),
      forkFromMessage: (userInputIndex: number) => this.forkFromMessage(userInputIndex),
    };
  }

  private _handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[], tabId?: string): void {
    const effectiveTabId = tabId || this._activeTabId;
    const tab = effectiveTabId ? this._tabs.get(effectiveTabId) : undefined;
    if (!tab) return;
    if (tab.stateManager.isProcessing) return;
    if (this._processingTabId) return; // Another tab is processing

    log.info('Sending message', { tabId: effectiveTabId, planMode, thinkingMode, hasImages: !!images?.length });

    this._processingTabId = effectiveTabId;

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    tab.stateManager.isProcessing = true;
    tab.stateManager.draftMessage = '';

    // Set Claude service session to this tab's session
    this._claudeService.setSessionId(tab.sessionId);

    void this._backupService.createCheckpoint(text).then((commit) => {
      if (commit) this._postMessage({ type: 'restorePoint', data: commit });
    });

    // Save userInput to conversation so it replays on webview reload (tab switch)
    const userInputData = { text, images };
    tab.messageProcessor.currentConversation.push({
      timestamp: new Date().toISOString(),
      messageType: 'userInput',
      data: userInputData,
    });
    this._postMessage({ type: 'userInput', data: userInputData });
    this._postMessage({ type: 'setProcessing', data: { isProcessing: true } });
    this._postMessage({ type: 'loading', data: 'Claude is working...' });
    this._postMessage({ type: 'tabProcessingChanged', data: { tabId: effectiveTabId!, isProcessing: true } });

    // Update tab title from first message
    if (tab.title === 'New Chat') {
      tab.title = text.substring(0, 30) + (text.length > 30 ? '...' : '');
      this._postMessage({ type: 'tabTitleUpdated', data: { tabId: effectiveTabId!, title: tab.title } });
    }

    const yoloMode = this._settingsManager.isYoloModeEnabled();
    const mcpServers = this._mcpService.loadServers();
    const mcpConfigPath = Object.keys(mcpServers).length > 0 ? this._mcpService.configPath : undefined;

    void this._claudeService.sendMessage(text, {
      cwd, planMode, thinkingMode, yoloMode,
      model: tab.stateManager.selectedModel !== 'default' ? tab.stateManager.selectedModel : undefined,
      mcpConfigPath, images,
    });
  }

  private _saveTabConversation(tabId: string, sessionId?: string): void {
    if (!sessionId) return;
    const tab = this._tabs.get(tabId);
    if (!tab) return;
    const conversation = tab.messageProcessor.currentConversation;
    if (conversation.length === 0) return;

    void this._conversationService.saveConversation(
      sessionId, conversation,
      tab.stateManager.totalCost,
      tab.stateManager.totalTokensInput,
      tab.stateManager.totalTokensOutput,
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

