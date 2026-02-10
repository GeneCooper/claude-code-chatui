import * as vscode from 'vscode';
import { ClaudeService } from './services/ClaudeService';
import { ConversationService } from './services/ConversationService';
import { MCPService } from './services/MCPService';
import { BackupService } from './services/BackupService';
import { UsageService } from './services/UsageService';
import { PermissionService } from './services/PermissionService';
import { DiffContentProvider } from './providers/DiffContentProvider';
import { PanelProvider } from './webview/PanelProvider';
import { WebviewProvider } from './webview/WebviewProvider';

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

  // Register sidebar webview provider
  const webviewProviderReg = vscode.window.registerWebviewViewProvider(
    'claude-code-chatui.chatView',
    webviewProvider,
  );

  // Status bar item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(comment-discussion) Claude';
  statusBarItem.tooltip = 'Open Claude Code ChatUI (Ctrl+Shift+C)';
  statusBarItem.command = 'claude-code-chatui.openChat';
  statusBarItem.show();

  context.subscriptions.push(
    openChatCmd,
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
