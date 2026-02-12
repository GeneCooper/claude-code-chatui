import * as vscode from 'vscode';
import type { MCPServerConfig } from '../shared/types';
import type { PanelManager } from './panelManager';
import { FILE_SEARCH_EXCLUDES } from '../shared/constants';
import type { ClaudeService } from './claude';
import type { PermissionService } from './claude';
import type { ConversationService, BackupService, MCPService } from './storage';
import type { SessionStateManager } from './sessionState';
import type { ClaudeMessageProcessor } from './messageProcessor';
import type { SettingsManager } from './settings';

// Re-export for backward compatibility
export { SessionStateManager } from './sessionState';
export { ClaudeMessageProcessor, type MessagePoster } from './messageProcessor';
export { SettingsManager } from './settings';

// ============================================================================
// DiffContentProvider
// ============================================================================

const diffContentStore = new Map<string, string>();

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'claude-diff';

  provideTextDocumentContent(uri: vscode.Uri): string {
    return diffContentStore.get(uri.toString()) || '';
  }

  static storeContent(label: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${label}`);
    diffContentStore.set(uri.toString(), content);
    return uri;
  }

  static async openDiff(
    oldContent: string,
    newContent: string,
    filePath: string,
  ): Promise<void> {
    const fileName = filePath.split(/[\\/]/).pop() || 'file';
    const timestamp = Date.now();
    const leftUri = DiffContentProvider.storeContent(`${fileName}.before.${timestamp}`, oldContent);
    const rightUri = DiffContentProvider.storeContent(`${fileName}.after.${timestamp}`, newContent);
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (Before ↔ After)`, { preview: true });
  }
}

// ============================================================================
// Message Handlers
// ============================================================================

export interface MessageHandlerContext {
  claudeService: ClaudeService;
  conversationService: ConversationService;
  mcpService: MCPService;
  backupService: BackupService;
  permissionService: PermissionService;
  stateManager: SessionStateManager;
  settingsManager: SettingsManager;
  messageProcessor: ClaudeMessageProcessor;
  extensionContext: vscode.ExtensionContext;
  postMessage(msg: Record<string, unknown>): void;
  newSession(): Promise<void>;
  loadConversation(filename: string): Promise<void>;
  handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[]): void;
  panelManager?: PanelManager;
  rewindToMessage(userInputIndex: number): void;
  forkFromMessage(userInputIndex: number): void;
  editMessage(userInputIndex: number, newText: string): void;
  regenerateResponse(): void;
  rulesService?: import('./rulesService').RulesService;
}

export type WebviewMessage = { type: string; [key: string]: unknown };

type MessageHandler = (msg: WebviewMessage, ctx: MessageHandlerContext) => void | Promise<void>;

const handleSendMessage: MessageHandler = (msg, ctx) => {
  if (msg.model) {
    ctx.stateManager.selectedModel = msg.model as string;
    void ctx.extensionContext.workspaceState.update('claude.selectedModel', msg.model);
  }
  ctx.handleSendMessage(
    msg.text as string,
    msg.planMode as boolean | undefined,
    msg.thinkingMode as boolean | undefined,
    msg.images as string[] | undefined,
  );
};

const handleNewSession: MessageHandler = (_msg, ctx) => { void ctx.newSession(); };
const handleStopRequest: MessageHandler = (_msg, ctx) => { void ctx.claudeService.stopProcess(); };

const handleReady: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'ready', data: 'Extension ready' });
  ctx.postMessage({
    type: 'platformInfo',
    data: { platform: process.platform, isWindows: process.platform === 'win32' },
  });
  checkCliAvailable(ctx);

  // Send current settings so webview has correct initial state
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { thinkingIntensity: settings.thinkingIntensity, yoloMode: settings.yoloMode } });

  // Replay conversation to restore webview state
  const conversation = ctx.messageProcessor.currentConversation;
  if (conversation.length > 0) {
    const replayMessages = conversation.map((msg) => ({ type: msg.messageType, data: msg.data }));
    ctx.postMessage({
      type: 'batchReplay',
      data: {
        messages: replayMessages,
        sessionId: ctx.claudeService.sessionId,
        totalCost: ctx.stateManager.totalCost,
        isProcessing: ctx.stateManager.isProcessing,
      },
    });
  }
};

const handlePermissionResponse: MessageHandler = (msg, ctx) => {
  ctx.claudeService.sendPermissionResponse(msg.id as string, msg.approved as boolean, msg.alwaysAllow as boolean | undefined);
  ctx.postMessage({ type: 'updatePermissionStatus', data: { id: msg.id, status: msg.approved ? 'approved' : 'denied' } });
};

const handleSelectModel: MessageHandler = (msg, ctx) => {
  ctx.stateManager.selectedModel = msg.model as string;
  void ctx.extensionContext.workspaceState.update('claude.selectedModel', msg.model);
};

const handleOpenModelTerminal: MessageHandler = () => {
  const terminal = vscode.window.createTerminal({ name: 'Claude Model Selection', location: { viewColumn: vscode.ViewColumn.One } });
  terminal.sendText('claude /model');
  terminal.show();
};

const handleRunInstallCommand: MessageHandler = (_msg, ctx) => {
  const { exec } = require('child_process') as typeof import('child_process');
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

  exec('node --version', { shell }, (nodeErr: Error | null, nodeStdout: string) => {
    let command: string;
    const nodeOk = !nodeErr && nodeStdout && (() => {
      const m = nodeStdout.trim().match(/^v(\d+)/);
      return m && parseInt(m[1], 10) >= 18;
    })();

    if (nodeOk) {
      command = 'npm install -g @anthropic-ai/claude-code';
    } else if (process.platform === 'win32') {
      command = 'irm https://claude.ai/install.ps1 | iex';
    } else {
      command = 'curl -fsSL https://claude.ai/install.sh | sh';
    }

    exec(command, { shell }, (error: Error | null, _stdout: string, stderr: string) => {
      ctx.postMessage({
        type: 'installComplete',
        data: { success: !error, error: error ? (stderr || error.message) : undefined },
      });
    });
  });
};

const handleSaveInputText: MessageHandler = (msg, ctx) => { ctx.stateManager.draftMessage = msg.text as string; };

const handleOpenFile: MessageHandler = (msg) => {
  const uri = vscode.Uri.file(msg.filePath as string);
  vscode.workspace.openTextDocument(uri).then((doc) => { vscode.window.showTextDocument(doc, { preview: true }); });
};

const handleOpenExternal: MessageHandler = (msg) => { void vscode.env.openExternal(vscode.Uri.parse(msg.url as string)); };

const handleOpenDiff: MessageHandler = async (msg) => {
  // Force side-by-side diff rendering
  const diffConfig = vscode.workspace.getConfiguration('diffEditor');
  if (!diffConfig.get<boolean>('renderSideBySide', true)) {
    await diffConfig.update('renderSideBySide', true, vscode.ConfigurationTarget.Global);
  }
  await DiffContentProvider.openDiff(msg.oldContent as string, msg.newContent as string, msg.filePath as string);
};

const handleGetConversationList: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
};

const handleLoadConversation: MessageHandler = (msg, ctx) => { void ctx.loadConversation(msg.filename as string); };

const handleGetSettings: MessageHandler = (_msg, ctx) => {
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { thinkingIntensity: settings.thinkingIntensity, yoloMode: settings.yoloMode } });
};

const handleUpdateSettings: MessageHandler = (msg, ctx) => {
  void ctx.settingsManager.updateSettings(msg.settings as Record<string, unknown>);
};

const handleExecuteSlashCommand: MessageHandler = (msg, ctx) => {
  const command = msg.command as string;
  if (command === 'compact') { ctx.handleSendMessage('/compact'); return; }
  if (command === 'clear') { void ctx.newSession(); return; }

  const sessionId = ctx.claudeService.sessionId;
  const args = sessionId ? `/${command} --resume ${sessionId}` : `/${command}`;
  const terminal = vscode.window.createTerminal({ name: `Claude: /${command}` });
  terminal.sendText(`claude ${args}`);
  terminal.show();
};

const handleGetWorkspaceFiles: MessageHandler = async (msg, ctx) => {
  const searchTerm = msg.searchTerm as string | undefined;
  try {
    const uris = await vscode.workspace.findFiles('**/*', FILE_SEARCH_EXCLUDES, 500);
    let files = uris.map((uri) => {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const name = relativePath.split(/[\\/]/).pop() || '';
      return { name, path: relativePath, fsPath: uri.fsPath };
    });

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      files = files.filter((f) => f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower));
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    files = files.slice(0, 50);
    ctx.postMessage({ type: 'workspaceFiles', data: files });
  } catch {
    ctx.postMessage({ type: 'workspaceFiles', data: [] });
  }
};

const handleLoadMCPServers: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'mcpServers', data: ctx.mcpService.loadServers() });
};

const handleSaveMCPServer: MessageHandler = (msg, ctx) => {
  try {
    ctx.mcpService.saveServer(msg.name as string, msg.config as MCPServerConfig);
    ctx.postMessage({ type: 'mcpServerSaved', data: { name: msg.name } });
  } catch {
    ctx.postMessage({ type: 'mcpServerError', data: { error: 'Failed to save MCP server' } });
  }
};

const handleDeleteMCPServer: MessageHandler = (msg, ctx) => {
  if (ctx.mcpService.deleteServer(msg.name as string)) {
    ctx.postMessage({ type: 'mcpServerDeleted', data: { name: msg.name } });
  } else {
    ctx.postMessage({ type: 'mcpServerError', data: { error: `Server "${msg.name}" not found` } });
  }
};

const handleCreateBackup: MessageHandler = async (msg, ctx) => {
  const commit = await ctx.backupService.createCheckpoint(msg.message as string);
  if (commit) ctx.postMessage({ type: 'restorePoint', data: commit });
};

const handleRestoreBackup: MessageHandler = async (msg, ctx) => {
  const success = await ctx.backupService.restoreToCommit(msg.commitSha as string);
  if (success) {
    ctx.postMessage({ type: 'output', data: 'Workspace restored to checkpoint successfully.' });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to restore checkpoint.' });
  }
};

const handleDeleteConversation: MessageHandler = async (msg, ctx) => {
  const success = await ctx.conversationService.deleteConversation(msg.filename as string);
  if (success) {
    ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to delete conversation' });
  }
};

const handleSearchConversations: MessageHandler = (msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.searchConversations(msg.query as string) });
};

const handleExportConversation: MessageHandler = (msg, ctx) => {
  const json = ctx.conversationService.exportConversation(msg.filename as string);
  if (json) {
    ctx.postMessage({ type: 'conversationExport', data: { filename: msg.filename, content: json } });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to export conversation' });
  }
};

const handleGetPermissions: MessageHandler = async (_msg, ctx) => {
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

const handleAddPermission: MessageHandler = async (msg, ctx) => {
  await ctx.permissionService.addPermission(msg.toolName as string, msg.pattern as string);
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

const handleRemovePermission: MessageHandler = async (msg, ctx) => {
  await ctx.permissionService.removePermission(msg.toolName as string, msg.pattern as string);
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

const handleRevertFile: MessageHandler = async (msg, ctx) => {
  try {
    const uri = vscode.Uri.file(msg.filePath as string);
    const content = new TextEncoder().encode(msg.oldContent as string);
    await vscode.workspace.fs.writeFile(uri, content);
    const fileName = (msg.filePath as string).split(/[\\/]/).pop() || 'file';
    vscode.window.showInformationMessage(`Reverted: ${fileName}`);
    ctx.postMessage({ type: 'fileReverted', data: { filePath: msg.filePath, success: true } });
  } catch {
    ctx.postMessage({ type: 'error', data: 'Failed to revert file' });
  }
};

const handlePickImageFile: MessageHandler = async (_msg, ctx) => {
  const result = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select Image',
    filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
  });
  if (!result || result.length === 0) return;
  try {
    const data = await vscode.workspace.fs.readFile(result[0]);
    const base64 = Buffer.from(data).toString('base64');
    const ext = result[0].fsPath.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    };
    const name = result[0].fsPath.split(/[\\/]/).pop() || 'image';
    ctx.postMessage({ type: 'imageFilePicked', data: { name, dataUrl: `data:${mimeMap[ext] || 'image/png'};base64,${base64}` } });
  } catch {
    ctx.postMessage({ type: 'error', data: 'Failed to read image file' });
  }
};

const handlePickWorkspaceFile: MessageHandler = async (_msg, ctx) => {
  const result = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Attach File',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!result || result.length === 0) return;
  for (const uri of result) {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
  }
};

const handleResolveDroppedFile: MessageHandler = (_msg, ctx) => {
  const uriStr = _msg.uri as string;
  if (!uriStr) return;
  try {
    const uri = vscode.Uri.parse(uriStr);
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
  } catch { /* ignore invalid URIs */ }
};

const handleGetClipboard: MessageHandler = async (_msg, ctx) => {
  try {
    const text = await vscode.env.clipboard.readText();
    ctx.postMessage({ type: 'clipboardContent', data: { text } });
  } catch {
    ctx.postMessage({ type: 'clipboardContent', data: { text: '' } });
  }
};

function checkCliAvailable(ctx: MessageHandlerContext): void {
  const { exec } = require('child_process') as typeof import('child_process');
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  exec('claude --version', { shell, timeout: 5000 }, (error: Error | null) => {
    if (error) ctx.postMessage({ type: 'showInstallModal' });
  });
}

const handleCreateNewPanel: MessageHandler = (_msg, ctx) => { ctx.panelManager?.createNewPanel(); };

// === Rules Handlers ===
const handleGetRules: MessageHandler = async (_msg, ctx) => {
  if (!ctx.rulesService) return;
  const rules = await ctx.rulesService.getRules();
  ctx.postMessage({ type: 'rulesData', data: { rules } });
};

const handleCreateDefaultRules: MessageHandler = async (_msg, ctx) => {
  if (!ctx.rulesService) return;
  await ctx.rulesService.createDefaultRules();
  const rules = await ctx.rulesService.getRules();
  ctx.postMessage({ type: 'rulesData', data: { rules } });
};

const handleOpenRulesFile: MessageHandler = async (msg, ctx) => {
  if (ctx.rulesService) await ctx.rulesService.openRulesFile(msg.filePath as string);
};

const messageHandlers: Record<string, MessageHandler> = {
  sendMessage: handleSendMessage,
  newSession: handleNewSession,
  stopRequest: handleStopRequest,
  ready: handleReady,
  permissionResponse: handlePermissionResponse,
  selectModel: handleSelectModel,
  openModelTerminal: handleOpenModelTerminal,
  runInstallCommand: handleRunInstallCommand,
  saveInputText: handleSaveInputText,
  openFile: handleOpenFile,
  openExternal: handleOpenExternal,
  openDiff: handleOpenDiff,
  getConversationList: handleGetConversationList,
  loadConversation: handleLoadConversation,
  getSettings: handleGetSettings,
  updateSettings: handleUpdateSettings,
  executeSlashCommand: handleExecuteSlashCommand,
  getWorkspaceFiles: handleGetWorkspaceFiles,
  loadMCPServers: handleLoadMCPServers,
  saveMCPServer: handleSaveMCPServer,
  deleteMCPServer: handleDeleteMCPServer,
  createBackup: handleCreateBackup,
  restoreBackup: handleRestoreBackup,
  deleteConversation: handleDeleteConversation,
  searchConversations: handleSearchConversations,
  exportConversation: handleExportConversation,
  getPermissions: handleGetPermissions,
  addPermission: handleAddPermission,
  removePermission: handleRemovePermission,
  revertFile: handleRevertFile,
  pickImageFile: handlePickImageFile,
  pickWorkspaceFile: handlePickWorkspaceFile,
  getClipboardText: handleGetClipboard,
  resolveDroppedFile: handleResolveDroppedFile,
  createNewPanel: handleCreateNewPanel,
  rewindToMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.rewindToMessage(msg.userInputIndex as number),
  forkFromMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.forkFromMessage(msg.userInputIndex as number),
  editMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.editMessage(msg.userInputIndex as number, msg.newText as string),
  regenerateResponse: (_msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.regenerateResponse(),
  // Rules
  getRules: handleGetRules,
  createDefaultRules: handleCreateDefaultRules,
  openRulesFile: handleOpenRulesFile,
};

export function handleWebviewMessage(msg: WebviewMessage, ctx: MessageHandlerContext): void {
  const handler = messageHandlers[msg.type];
  if (handler) void handler(msg, ctx);
}
