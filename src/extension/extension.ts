import * as vscode from 'vscode';
import { ClaudeService, PermissionService } from './claude';
import { ConversationService, BackupService, UsageService, MCPService } from './storage';
import { DiffContentProvider } from './handlers';
import { PanelProvider, WebviewProvider } from './panel';

export function activate(context: vscode.ExtensionContext): void {
  console.log('Claude Code ChatUI extension is being activated');

  // Initialize services
  const claudeService = new ClaudeService(context);
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

  // Create the main panel provider
  const panelProvider = new PanelProvider(
    context.extensionUri, context, claudeService,
    conversationService, mcpService, backupService, usageService, permissionService,
  );

  // Create sidebar webview provider
  const webviewProvider = new WebviewProvider(context.extensionUri, context, panelProvider);

  // Register command to open chat
  const openChatCmd = vscode.commands.registerCommand(
    'claude-code-chatui.openChat',
    (column?: vscode.ViewColumn) => {
      panelProvider.show(column);
    },
  );

  // Register command to open chat with current file context
  const openChatWithFileCmd = vscode.commands.registerCommand(
    'claude-code-chatui.openChatWithFile',
    () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const relativePath = vscode.workspace.asRelativePath(editor.document.uri, false);
        panelProvider.show(vscode.ViewColumn.Beside, false);
        panelProvider.attachFileContext(relativePath);
      } else {
        panelProvider.show(vscode.ViewColumn.Beside);
      }
    },
  );

  // Register sidebar webview provider
  const webviewProviderReg = vscode.window.registerWebviewViewProvider(
    'claude-code-chatui.chatView',
    webviewProvider,
  );

  // Register command to load a specific conversation
  const loadConvCmd = vscode.commands.registerCommand(
    'claude-code-chatui.loadConversation',
    (filename: string) => { panelProvider.show(); void panelProvider.loadConversation(filename); },
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
    claudeService,
    permissionService,
    usageService,
    outputChannel,
    { dispose: () => panelProvider.disposeAll() },
  );

  console.log('Claude Code ChatUI extension activated successfully');
}

export function deactivate(): void {}
