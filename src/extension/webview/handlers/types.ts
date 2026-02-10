/**
 * Handler Types
 *
 * Type definitions for the message handler system.
 *
 * @module webview/handlers/types
 */

import type * as vscode from 'vscode';
import type { ClaudeService } from '../../services/ClaudeService';
import type { ConversationService } from '../../services/ConversationService';
import type { MCPService } from '../../services/MCPService';
import type { BackupService } from '../../services/BackupService';
import type { UsageService } from '../../services/UsageService';
import type { PermissionService } from '../../services/PermissionService';
import type { SessionStateManager } from '../SessionStateManager';
import type { SettingsManager } from '../SettingsManager';

/**
 * Context passed to each message handler
 */
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

/**
 * Generic webview message shape
 */
export type WebviewMessage = { type: string; [key: string]: unknown };

/**
 * Individual message handler function
 */
export type MessageHandler = (msg: WebviewMessage, ctx: MessageHandlerContext) => void | Promise<void>;

/**
 * Map of message types to handler functions
 */
export type MessageHandlerMap = Record<string, MessageHandler>;
