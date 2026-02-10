import { useEffect } from 'react';
import { onMessage, postMessage } from '../lib/vscode';
import { useChatStore } from '../stores/chatStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useConversationStore } from '../stores/conversationStore';
import { useMCPStore } from '../stores/mcpStore';

/**
 * Hook that listens for messages from the extension host
 * and dispatches them to the appropriate stores.
 */
export function useVSCode(): void {
  const {
    addMessage,
    removeLoading,
    setProcessing,
    setSessionId,
    updateTokens,
    updateTotals,
    updatePermissionStatus,
    clearMessages,
    restoreState,
  } = useChatStore();

  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      switch (msg.type) {
        case 'ready':
          break;

        case 'userInput':
          addMessage({ type: 'userInput', data: msg.data });
          break;

        case 'output':
          removeLoading();
          addMessage({ type: 'output', data: msg.data });
          break;

        case 'thinking':
          removeLoading();
          addMessage({ type: 'thinking', data: msg.data });
          break;

        case 'loading':
          addMessage({ type: 'loading', data: msg.data });
          break;

        case 'clearLoading':
          removeLoading();
          break;

        case 'error':
          removeLoading();
          addMessage({ type: 'error', data: msg.data });
          break;

        case 'setProcessing':
          setProcessing((msg.data as { isProcessing: boolean }).isProcessing);
          break;

        case 'sessionCleared':
          clearMessages();
          setSessionId(null);
          break;

        case 'sessionInfo': {
          const info = msg.data as { sessionId: string };
          setSessionId(info.sessionId);
          addMessage({ type: 'sessionInfo', data: msg.data });
          break;
        }

        case 'updateTokens':
          updateTokens(msg.data as Record<string, number>);
          break;

        case 'updateTotals':
          updateTotals(msg.data as Record<string, number>);
          break;

        case 'toolUse':
          removeLoading();
          addMessage({ type: 'toolUse', data: msg.data });
          break;

        case 'toolResult': {
          const result = msg.data as { hidden?: boolean };
          if (!result.hidden) {
            addMessage({ type: 'toolResult', data: msg.data });
          }
          break;
        }

        case 'permissionRequest':
          addMessage({ type: 'permissionRequest', data: msg.data });
          break;

        case 'updatePermissionStatus': {
          const perm = msg.data as { id: string; status: string };
          updatePermissionStatus(perm.id, perm.status);
          break;
        }

        case 'compacting':
          addMessage({ type: 'compacting', data: msg.data });
          break;

        case 'compactBoundary':
          addMessage({ type: 'compactBoundary', data: msg.data });
          break;

        case 'restoreState':
          restoreState(msg.state as { messages?: []; sessionId?: string; totalCost?: number });
          break;

        case 'showInstallModal':
          addMessage({ type: 'error', data: 'Claude CLI not found. Please install it first: npm install -g @anthropic-ai/claude-code' });
          break;

        // Phase 3: Settings
        case 'settingsData':
          useSettingsStore.getState().updateSettings(msg.data as { thinkingIntensity: string; yoloMode: boolean });
          break;

        // Phase 3: Conversation history
        case 'conversationList':
          useConversationStore.getState().setConversations(msg.data as Array<{
            filename: string; sessionId: string; startTime: string; endTime: string;
            messageCount: number; totalCost: number; firstUserMessage: string; lastUserMessage: string;
          }>);
          break;

        // Phase 3: MCP servers
        case 'mcpServers':
          useMCPStore.getState().setServers(msg.data as Record<string, { type: 'stdio' | 'http' | 'sse'; command?: string; url?: string; args?: string[] }>);
          break;

        case 'mcpServerSaved':
          // Reload server list after save
          postMessage({ type: 'loadMCPServers' });
          break;

        case 'mcpServerDeleted':
          useMCPStore.getState().removeServer((msg.data as { name: string }).name);
          break;

        case 'mcpServerError':
          addMessage({ type: 'error', data: (msg.data as { error: string }).error });
          break;

        // Phase 3: Restore points
        case 'restorePoint':
          addMessage({ type: 'restorePoint' as 'toolResult', data: msg.data });
          break;
      }
    });

    // Notify extension we're ready
    postMessage({ type: 'ready' });

    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
