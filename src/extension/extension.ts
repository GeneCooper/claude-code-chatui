import * as vscode from 'vscode';
import { ClaudeService, PermissionService } from './claude';
import { ConversationService, BackupService, UsageService, MCPService } from './storage';
import { DiffContentProvider } from './handlers';
import { PanelProvider, WebviewProvider } from './panel';
import { PanelManager } from './panelManager';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Claude Code ChatUI extension is being activated');

  // Initialize shared services
  const conversationService = new ConversationService(context);
  const mcpService = new MCPService(context);
  const backupService = new BackupService(context);
  const permissionService = new PermissionService(context);
  const outputChannel = vscode.window.createOutputChannel('Claude Code ChatUI');
  const usageService = new UsageService(outputChannel);

  // Initialize backup repo in background
  void backupService.initialize();

  // Register diff content provider
  const diffProvider = vscode.workspace.registerTextDocumentContentProvider(
    DiffContentProvider.scheme,
    new DiffContentProvider(),
  );

  // Create panel manager for multi-panel support
  const panelManager = new PanelManager(
    context.extensionUri,
    context,
    conversationService,
    mcpService,
    backupService,
    usageService,
    permissionService,
  );

  // Sidebar gets its own dedicated ClaudeService + PanelProvider
  const sidebarClaudeService = new ClaudeService(context);
  const sidebarProvider = new PanelProvider(
    context.extensionUri, context, sidebarClaudeService,
    conversationService, mcpService, backupService, usageService, permissionService,
    panelManager,
  );

  // Create sidebar webview provider
  const webviewProvider = new WebviewProvider(context.extensionUri, context, sidebarProvider);

  // Register command to open chat (creates new panel)
  const openChatCmd = vscode.commands.registerCommand(
    'claude-code-chatui.openChat',
    (column?: vscode.ViewColumn) => {
      panelManager.createNewPanel(column || vscode.ViewColumn.Two);
    },
  );

  // Register command to open chat with current file/folder context
  const openChatWithFileCmd = vscode.commands.registerCommand(
    'claude-code-chatui.openChatWithFile',
    (uri?: vscode.Uri) => {
      const panel = panelManager.createNewPanel(vscode.ViewColumn.Beside, false);
      if (uri) {
        // Called from explorer context menu (file or folder)
        const relativePath = vscode.workspace.asRelativePath(uri, false);
        panel.attachFileContext(relativePath);
      } else {
        // Called from editor title bar or command palette
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
          panel.attachFileContext(relativePath);
        }
      }
    },
  );

  // Register sidebar webview provider (retain context to prevent state loss on sidebar switch)
  const webviewProviderReg = vscode.window.registerWebviewViewProvider(
    'claude-code-chatui.chatView',
    webviewProvider,
    { webviewOptions: { retainContextWhenHidden: true } },
  );

  // Register command to load a specific conversation (creates new panel)
  const loadConvCmd = vscode.commands.registerCommand(
    'claude-code-chatui.loadConversation',
    (filename: string) => {
      const panel = panelManager.createNewPanel();
      void panel.loadConversation(filename);
    },
  );

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(comment-discussion) Claude';
  statusBarItem.tooltip = 'Open Claude Code ChatUI (Ctrl+Shift+C)';
  statusBarItem.command = 'claude-code-chatui.openChat';
  statusBarItem.show();

  context.subscriptions.push(
    openChatCmd,
    openChatWithFileCmd,
    loadConvCmd,
    webviewProviderReg,
    diffProvider,
    statusBarItem,
    sidebarClaudeService,
    permissionService,
    usageService,
    outputChannel,
    { dispose: () => panelManager.disposeAll() },
    { dispose: () => sidebarProvider.disposeAll() },
  );

  console.log('Claude Code ChatUI extension activated successfully');
}

export function deactivate(): void {}
