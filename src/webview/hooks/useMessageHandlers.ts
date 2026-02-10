/**
 * Webview Message Handlers
 *
 * Handler map for messages received from the extension host.
 * Extracted from useVSCode for modularity.
 *
 * @module webview/hooks/useMessageHandlers
 */

import { postMessage } from '../lib/vscode';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useConversationStore } from '../stores/conversationStore';
import { useMCPStore } from '../stores/mcpStore';
import { useUIStore } from '../stores/uiStore';
import type { UsageData } from '../../shared/types';

type ExtensionMessage = { type: string; data?: unknown; state?: unknown; [key: string]: unknown };
type WebviewMessageHandler = (msg: ExtensionMessage) => void;

/**
 * Map of extension message types to handler functions.
 * Each handler dispatches to the appropriate Zustand store.
 */
export const webviewMessageHandlers: Record<string, WebviewMessageHandler> = {
  ready: () => {
    // No-op — extension acknowledges readiness
  },

  userInput: (msg) => {
    useChatStore.getState().addMessage({ type: 'userInput', data: msg.data });
  },

  output: (msg) => {
    useChatStore.getState().removeLoading();
    useChatStore.getState().addMessage({ type: 'output', data: msg.data });
  },

  thinking: (msg) => {
    useChatStore.getState().removeLoading();
    useChatStore.getState().addMessage({ type: 'thinking', data: msg.data });
  },

  loading: (msg) => {
    useChatStore.getState().addMessage({ type: 'loading', data: msg.data });
  },

  clearLoading: () => {
    useChatStore.getState().removeLoading();
  },

  error: (msg) => {
    useChatStore.getState().removeLoading();
    useChatStore.getState().addMessage({ type: 'error', data: msg.data });
  },

  setProcessing: (msg) => {
    const isProcessing = (msg.data as { isProcessing: boolean }).isProcessing;
    useChatStore.getState().setProcessing(isProcessing);
    useUIStore.getState().setRequestStartTime(isProcessing ? Date.now() : null);
  },

  sessionCleared: () => {
    useChatStore.getState().clearMessages();
    useChatStore.getState().setSessionId(null);
    useUIStore.getState().setRequestStartTime(null);
  },

  sessionInfo: (msg) => {
    const info = msg.data as { sessionId: string };
    useChatStore.getState().setSessionId(info.sessionId);
    useChatStore.getState().addMessage({ type: 'sessionInfo', data: msg.data });
  },

  updateTokens: (msg) => {
    useChatStore.getState().updateTokens(msg.data as Record<string, number>);
  },

  updateTotals: (msg) => {
    useChatStore.getState().updateTotals(msg.data as Record<string, number>);
  },

  toolUse: (msg) => {
    useChatStore.getState().removeLoading();
    useChatStore.getState().addMessage({ type: 'toolUse', data: msg.data });
  },

  toolResult: (msg) => {
    const result = msg.data as { hidden?: boolean };
    if (!result.hidden) {
      useChatStore.getState().addMessage({ type: 'toolResult', data: msg.data });
    }
  },

  permissionRequest: (msg) => {
    useChatStore.getState().addMessage({ type: 'permissionRequest', data: msg.data });
  },

  updatePermissionStatus: (msg) => {
    const perm = msg.data as { id: string; status: string };
    useChatStore.getState().updatePermissionStatus(perm.id, perm.status);
  },

  compacting: (msg) => {
    useChatStore.getState().addMessage({ type: 'compacting', data: msg.data });
  },

  compactBoundary: (msg) => {
    useChatStore.getState().addMessage({ type: 'compactBoundary', data: msg.data });
  },

  restoreState: (msg) => {
    useChatStore.getState().restoreState(
      msg.state as { messages?: []; sessionId?: string; totalCost?: number },
    );
  },

  showInstallModal: () => {
    useUIStore.getState().setShowInstallModal(true);
  },

  showLoginRequired: (msg) => {
    const loginData = msg.data as { message: string };
    useUIStore.getState().setLoginErrorMessage(loginData.message || '');
    useUIStore.getState().setShowLoginModal(true);
  },

  installComplete: (msg) => {
    const installResult = msg.data as { success: boolean; error?: string };
    const cb = (window as unknown as { __installCallback?: (success: boolean, error?: string) => void }).__installCallback;
    if (cb) cb(installResult.success, installResult.error);
  },

  settingsData: (msg) => {
    useSettingsStore.getState().updateSettings(
      msg.data as { thinkingIntensity: string; yoloMode: boolean },
    );
  },

  conversationList: (msg) => {
    useConversationStore.getState().setConversations(msg.data as Array<{
      filename: string; sessionId: string; startTime: string; endTime: string;
      messageCount: number; totalCost: number; firstUserMessage: string; lastUserMessage: string;
    }>);
  },

  mcpServers: (msg) => {
    useMCPStore.getState().setServers(
      msg.data as Record<string, { type: 'stdio' | 'http' | 'sse'; command?: string; url?: string; args?: string[] }>,
    );
  },

  mcpServerSaved: () => {
    postMessage({ type: 'loadMCPServers' });
  },

  mcpServerDeleted: (msg) => {
    useMCPStore.getState().removeServer((msg.data as { name: string }).name);
  },

  mcpServerError: (msg) => {
    useChatStore.getState().addMessage({ type: 'error', data: (msg.data as { error: string }).error });
  },

  restorePoint: (msg) => {
    useChatStore.getState().addMessage({ type: 'restorePoint', data: msg.data });
  },

  usageUpdate: (msg) => {
    useUIStore.getState().setUsageData(msg.data as UsageData);
  },

  usageError: () => {
    // Silent — don't interrupt user
  },

  todosUpdate: (msg) => {
    const todosData = msg.data as { todos: Array<{ content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }> };
    useChatStore.getState().updateTodos(todosData.todos);
  },
};

/**
 * Dispatch an extension message to the appropriate handler
 */
export function handleExtensionMessage(msg: ExtensionMessage): void {
  const handler = webviewMessageHandlers[msg.type];
  if (handler) {
    handler(msg);
  }
}
