import * as vscode from 'vscode';
import { ClaudeService, PermissionService } from './claude';
import { ConversationService, BackupService, UsageService, MCPService } from './storage';
import { DiffContentProvider } from './handlers';
import { PanelProvider, WebviewProvider, getWebviewHtml } from './panel';
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
  // VS Code explorer passes (clickedUri, allSelectedUris) for multi-select
  const openChatWithFileCmd = vscode.commands.registerCommand(
    'claude-code-chatui.openChatWithFile',
    (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const panel = panelManager.createNewPanel(vscode.ViewColumn.Beside, false);
      const targets = uris?.length ? uris : uri ? [uri] : [];
      if (targets.length > 0) {
        // Called from explorer context menu (files and/or folders)
        for (const target of targets) {
          const relativePath = vscode.workspace.asRelativePath(target, false);
          panel.attachFileContext(relativePath);
        }
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

  // Restore panels that were open when VS Code closed
  const panelSerializer = vscode.window.registerWebviewPanelSerializer('claudeCodeChatUI', {
    async deserializeWebviewPanel(panel: vscode.WebviewPanel, state: unknown) {
      panel.webview.options = {
        enableScripts: true,
        localResourceRoots: [context.extensionUri],
      };
      panel.iconPath = vscode.Uri.joinPath(context.extensionUri, 'media', 'icon.png');
      panel.webview.html = getWebviewHtml(panel.webview, context.extensionUri);
      const sessionId = (state as { sessionId?: string } | null)?.sessionId;
      panelManager.adoptRestoredPanel(panel, sessionId);
    },
  });

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
    panelSerializer,
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
