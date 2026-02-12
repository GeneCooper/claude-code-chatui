export { DiffContentProvider } from './diff';
export type { MessageHandlerContext, WebviewMessage, MessageHandler } from './types';

// Re-export for backward compatibility (panel.ts imports these via handlers)
export { SessionStateManager } from '../sessionState';
export { ClaudeMessageProcessor, type MessagePoster } from '../messageProcessor';
export { SettingsManager } from '../settings';

import type { WebviewMessage, MessageHandlerContext, MessageHandler } from './types';
import { str } from './helpers';

import { handleSendMessage, handleNewSession, handleStopRequest, handleReady, handleSaveInputText, handleCreateNewPanel } from './session';
import { handleOpenFile, handleOpenExternal, handleOpenDiff, handleRevertFile, handlePickImageFile, handlePickWorkspaceFile, handleResolveDroppedFile, handleGetWorkspaceFiles, handleGetClipboard } from './file';
import { handleSelectModel, handleOpenModelTerminal, handleGetSettings, handleUpdateSettings } from './settings';
import { handleGetConversationList, handleLoadConversation, handleDeleteConversation, handleSearchConversations, handleExportConversation } from './conversation';
import { handleLoadMCPServers, handleSaveMCPServer, handleDeleteMCPServer } from './mcp';
import { handlePermissionResponse, handleGetPermissions, handleAddPermission, handleRemovePermission } from './permission';
import { handleRunInstallCommand, handleExecuteSlashCommand } from './cli';

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
  editMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.editMessage(typeof msg.userInputIndex === 'number' ? msg.userInputIndex : 0, str(msg.newText)),
  regenerateResponse: (_msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.regenerateResponse(),
};

export function handleWebviewMessage(msg: WebviewMessage, ctx: MessageHandlerContext): void {
  const handler = messageHandlers[msg.type];
  if (handler) void handler(msg, ctx);
}
