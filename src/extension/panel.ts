import * as vscode from 'vscode';
import { ClaudeService } from './claude';
import { ConversationService, MCPService } from './storage';
import { PermissionService } from './claude';
import {
  handleWebviewMessage,
  type WebviewMessage,
} from './handlers';
import { ChatController } from './chatController';
import type { WebviewToExtensionMessage, ConversationMessage } from '../shared/types';
import type { PanelManager } from './panelManager';

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
      connect-src ${webview.cspSource};
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
  <script nonce="${nonce}">
    window.__ICON_URI__="${iconUri}";
    window.onerror=function(msg,src,line,col,err){
      document.getElementById('root').innerHTML='<div style="padding:20px;color:red;font-size:13px;"><b>Load Error:</b><br>'+msg+'<br>Source: '+src+'<br>Line: '+line+'</div>';
    };
  </script>
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

  readonly chat: ChatController;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext,
    private readonly _claudeService: ClaudeService,
    private readonly _conversationService: ConversationService,
    private readonly _mcpService: MCPService,
    private readonly _permissionService: PermissionService,
    private readonly _panelManager?: PanelManager,
  ) {
    this.chat = new ChatController(
      this._context,
      this._claudeService,
      this._conversationService,
      this._mcpService,
      this._permissionService,
      (msg) => this._postMessage(msg),
      this._panelManager,
    );

    // Desktop notification when panel is not visible
    this._claudeService.onProcessEnd(() => {
      const notifEnabled = vscode.workspace.getConfiguration('claudeCodeChatUI')
        .get<boolean>('notifications.enabled', true);
      const isVisible = this._panel?.visible ?? this._webviewView?.visible ?? false;
      if (notifEnabled && !isVisible) {
        vscode.window.showInformationMessage('Claude Code: Response complete');
      }
    });

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

    // Track active file and send to webview
    const sendActiveFile = (editor: vscode.TextEditor | undefined) => {
      if (editor && editor.document.uri.scheme === 'file') {
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
        this._postMessage({
          type: 'activeFileChanged',
          data: { filePath: relativePath, languageId: editor.document.languageId },
        });
      } else {
        this._postMessage({ type: 'activeFileChanged', data: null });
      }
    };
    sendActiveFile(vscode.window.activeTextEditor);
    this._disposables.push(
      vscode.window.onDidChangeActiveTextEditor(sendActiveFile),
    );
  }

  // ==================== Public API ====================

  get messageProcessor() { return this.chat.messageProcessor; }
  get stateManager() { return this.chat.stateManager; }

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
      this._webview.html = getWebviewHtml(this._webview, this._extensionUri);
      this._setupWebviewMessageHandler(this._webview);
    }
  }

  bindToWebview(webview: vscode.Webview): void {
    this._webview = webview;
    this._setupWebviewMessageHandler(webview);
  }

  attachFileContext(relativePath: string): void {
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
    // No-op: with retainContextWhenHidden the webview stays alive
  }

  async newSession(): Promise<void> { return this.chat.newSession(); }
  async loadConversation(filename: string): Promise<void> { return this.chat.loadConversation(filename); }
  loadConversationData(messages: ConversationMessage[], sessionId?: string, totalCost?: number): void {
    this.chat.loadConversationData(messages, sessionId, totalCost);
  }
  editMessage(userInputIndex: number, newText: string): void { this.chat.editMessage(userInputIndex, newText); }
  regenerateResponse(): void { this.chat.regenerateResponse(); }

  dispose(): void {
    this.chat.stopIfProcessing();
    this.chat.flushSave();
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
      permissionService: this._permissionService,
      stateManager: this.chat.stateManager,
      settingsManager: this.chat.settingsManager,
      messageProcessor: this.chat.messageProcessor,
      extensionContext: this._context,
      postMessage: (msg: Record<string, unknown>) => this._postMessage(msg),
      newSession: () => this.chat.newSession(),
      loadConversation: (filename: string) => this.chat.loadConversation(filename),
      handleSendMessage: (text: string, thinkingMode?: boolean, images?: string[]) =>
        this.chat.handleSendMessage(text, thinkingMode, images),
      panelManager: this._panelManager,
      editMessage: (userInputIndex: number, newText: string) => this.chat.editMessage(userInputIndex, newText),
      regenerateResponse: () => this.chat.regenerateResponse(),
    };
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

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._panelProvider.closeMainPanel();
        this._panelProvider.reinitializeWebview();
      }
    });

    this._panelProvider.showInWebview(webviewView.webview, webviewView);
  }
}
