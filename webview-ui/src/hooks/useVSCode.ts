import { useEffect } from 'react';
import { onMessage, postMessage } from '../lib/vscode';
import { useChatStore } from '../stores/chatStore';

/**
 * Hook that listens for messages from the extension host
 * and dispatches them to the chat store.
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
      }
    });

    // Notify extension we're ready
    postMessage({ type: 'ready' });

    return unsubscribe;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
