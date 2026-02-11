import * as vscode from 'vscode';
import { DiffContentProvider } from '../providers/DiffContentProvider';
import { FILE_SEARCH_EXCLUDES } from '../../shared/constants';
import type { MCPServerConfig } from '../../shared/types';
import type { ClaudeService } from '../services/ClaudeService';
import type { ConversationService } from '../services/ConversationService';
import type { MCPService } from '../services/MCPService';
import type { BackupService } from '../services/BackupService';
import type { UsageService } from '../services/UsageService';
import type { PermissionService } from '../services/PermissionService';
import type { SessionStateManager } from './SessionStateManager';
import type { SettingsManager } from './SettingsManager';

// ============================================================================
// Types
// ============================================================================

export interface MessageHandlerContext {
    claudeService: ClaudeService;
    conversationService: ConversationService;
    mcpService: MCPService;
    backupService: BackupService;
    usageService: UsageService;
    permissionService: PermissionService;
    stateManager: SessionStateManager;
    settingsManager: SettingsManager;
    extensionContext: vscode.ExtensionContext;
    postMessage(msg: Record<string, unknown>): void;
    newSession(): Promise<void>;
    loadConversation(filename: string): Promise<void>;
    handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[]): void;
}

export type WebviewMessage = { type: string; [key: string]: unknown };

type MessageHandler = (msg: WebviewMessage, ctx: MessageHandlerContext) => void | Promise<void>;

// ============================================================================
// Handlers
// ============================================================================

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

const handleNewSession: MessageHandler = (_msg, ctx) => {
    void ctx.newSession();
};

const handleStopRequest: MessageHandler = (_msg, ctx) => {
    void ctx.claudeService.stopProcess();
};

const handleReady: MessageHandler = (_msg, ctx) => {
    ctx.postMessage({ type: 'ready', data: 'Extension ready' });
    checkCliAvailable(ctx);
};

const handlePermissionResponse: MessageHandler = (msg, ctx) => {
    ctx.claudeService.sendPermissionResponse(
        msg.id as string,
        msg.approved as boolean,
        msg.alwaysAllow as boolean | undefined,
    );
    ctx.postMessage({
        type: 'updatePermissionStatus',
        data: { id: msg.id, status: msg.approved ? 'approved' : 'denied' },
    });
};

const handleSelectModel: MessageHandler = (msg, ctx) => {
    ctx.stateManager.selectedModel = msg.model as string;
    void ctx.extensionContext.workspaceState.update('claude.selectedModel', msg.model);
};

const handleOpenModelTerminal: MessageHandler = () => {
    const terminal = vscode.window.createTerminal({
        name: 'Claude Model Selection',
        location: { viewColumn: vscode.ViewColumn.One },
    });
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
                data: {
                    success: !error,
                    error: error ? (stderr || error.message) : undefined,
                },
            });
        });
    });
};

const handleSaveInputText: MessageHandler = (msg, ctx) => {
    ctx.stateManager.draftMessage = msg.text as string;
};

const handleOpenFile: MessageHandler = (msg) => {
    const uri = vscode.Uri.file(msg.filePath as string);
    vscode.workspace.openTextDocument(uri).then((doc) => {
        vscode.window.showTextDocument(doc, { preview: true });
    });
};

const handleOpenExternal: MessageHandler = (msg) => {
    void vscode.env.openExternal(vscode.Uri.parse(msg.url as string));
};

const handleOpenDiff: MessageHandler = (msg) => {
    void DiffContentProvider.openDiff(
        msg.oldContent as string,
        msg.newContent as string,
        msg.filePath as string,
    );
};

const handleGetConversationList: MessageHandler = (_msg, ctx) => {
    ctx.postMessage({
        type: 'conversationList',
        data: ctx.conversationService.getConversationList(),
    });
};

const handleLoadConversation: MessageHandler = (msg, ctx) => {
    void ctx.loadConversation(msg.filename as string);
};

const handleGetSettings: MessageHandler = (_msg, ctx) => {
    const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
    ctx.postMessage({
        type: 'settingsData',
        data: {
            thinkingIntensity: settings.thinkingIntensity,
            yoloMode: settings.yoloMode,
        },
    });
};

const handleUpdateSettings: MessageHandler = (msg, ctx) => {
    void ctx.settingsManager.updateSettings(msg.settings as Record<string, unknown>);
};

const handleExecuteSlashCommand: MessageHandler = (msg, ctx) => {
    const command = msg.command as string;
    if (command === 'compact') {
        ctx.handleSendMessage('/compact');
        return;
    }
    if (command === 'clear') {
        void ctx.newSession();
        return;
    }

    const sessionId = ctx.claudeService.sessionId;
    const args = sessionId ? `/${command} --resume ${sessionId}` : `/${command}`;
    const terminal = vscode.window.createTerminal({ name: `Claude: /${command}` });
    terminal.sendText(`claude ${args}`);
    terminal.show();
};

const handleGetWorkspaceFiles: MessageHandler = async (msg, ctx) => {
    const searchTerm = msg.searchTerm as string | undefined;
    const excludePattern = FILE_SEARCH_EXCLUDES;
    try {
        const uris = await vscode.workspace.findFiles('**/*', excludePattern, 500);
        let files = uris.map((uri) => {
            const relativePath = vscode.workspace.asRelativePath(uri, false);
            const name = relativePath.split(/[\\/]/).pop() || '';
            return { name, path: relativePath, fsPath: uri.fsPath };
        });

        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            files = files.filter((f) =>
                f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower),
            );
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
    if (commit) {
        ctx.postMessage({ type: 'restorePoint', data: commit });
    }
};

const handleRestoreBackup: MessageHandler = async (msg, ctx) => {
    const success = await ctx.backupService.restoreToCommit(msg.commitSha as string);
    if (success) {
        ctx.postMessage({ type: 'output', data: 'Workspace restored to checkpoint successfully.' });
    } else {
        ctx.postMessage({ type: 'error', data: 'Failed to restore checkpoint.' });
    }
};

const handleRefreshUsage: MessageHandler = (_msg, ctx) => {
    void ctx.usageService.fetchUsageData();
};

const handleDeleteConversation: MessageHandler = async (msg, ctx) => {
    const success = await ctx.conversationService.deleteConversation(msg.filename as string);
    if (success) {
        ctx.postMessage({
            type: 'conversationList',
            data: ctx.conversationService.getConversationList(),
        });
    } else {
        ctx.postMessage({ type: 'error', data: 'Failed to delete conversation' });
    }
};

const handleSearchConversations: MessageHandler = (msg, ctx) => {
    const results = ctx.conversationService.searchConversations(msg.query as string);
    ctx.postMessage({ type: 'conversationList', data: results });
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
    const permissions = await ctx.permissionService.getPermissions();
    ctx.postMessage({ type: 'permissions', data: permissions });
};

const handleAddPermission: MessageHandler = async (msg, ctx) => {
    await ctx.permissionService.addPermission(msg.toolName as string, msg.pattern as string);
    const permissions = await ctx.permissionService.getPermissions();
    ctx.postMessage({ type: 'permissions', data: permissions });
};

const handleRemovePermission: MessageHandler = async (msg, ctx) => {
    await ctx.permissionService.removePermission(msg.toolName as string, msg.pattern as string);
    const permissions = await ctx.permissionService.getPermissions();
    ctx.postMessage({ type: 'permissions', data: permissions });
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

// ============================================================================
// Helper
// ============================================================================

function checkCliAvailable(ctx: MessageHandlerContext): void {
    const { exec } = require('child_process') as typeof import('child_process');
    const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
    exec('claude --version', { shell, timeout: 5000 }, (error: Error | null) => {
        if (error) {
            ctx.postMessage({ type: 'showInstallModal' });
        }
    });
}

// ============================================================================
// Handler Map & Dispatch
// ============================================================================

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
    refreshUsage: handleRefreshUsage,
    deleteConversation: handleDeleteConversation,
    searchConversations: handleSearchConversations,
    exportConversation: handleExportConversation,
    getPermissions: handleGetPermissions,
    addPermission: handleAddPermission,
    removePermission: handleRemovePermission,
    revertFile: handleRevertFile,
};

export function handleWebviewMessage(msg: WebviewMessage, ctx: MessageHandlerContext): void {
    const handler = messageHandlers[msg.type];
    if (handler) {
        void handler(msg, ctx);
    }
}
