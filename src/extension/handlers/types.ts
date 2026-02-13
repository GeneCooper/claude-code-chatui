import type * as vscode from 'vscode';
import type { ClaudeService } from '../claude';
import type { PermissionService } from '../claude';
import type { ConversationService, MCPService } from '../storage';
import type { SessionStateManager } from '../sessionState';
import type { ClaudeMessageProcessor } from '../messageProcessor';
import type { SettingsManager } from '../settings';
import type { PanelManager } from '../panelManager';
import type { RateLimitData } from '../../shared/types';

export interface MessageHandlerContext {
  claudeService: ClaudeService;
  conversationService: ConversationService;
  mcpService: MCPService;
  permissionService: PermissionService;
  stateManager: SessionStateManager;
  settingsManager: SettingsManager;
  messageProcessor: ClaudeMessageProcessor;
  extensionContext: vscode.ExtensionContext;
  postMessage(msg: Record<string, unknown>): void;
  newSession(): Promise<void>;
  loadConversation(filename: string): Promise<void>;
  handleSendMessage(text: string, thinkingMode?: boolean, images?: string[]): void;
  panelManager?: PanelManager;
  editMessage(userInputIndex: number, newText: string): void;
  regenerateResponse(): void;
  restoreCommit(commitSha: string): Promise<void>;
  lastRateLimitData: RateLimitData | null;
}

export type WebviewMessage = { type: string; [key: string]: unknown };

export type MessageHandler = (msg: WebviewMessage, ctx: MessageHandlerContext) => void | Promise<void>;
