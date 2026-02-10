import { useEffect } from 'react';
import { onMessage, postMessage } from '../lib/vscode';
import { handleExtensionMessage } from './useMessageHandlers';

/**
 * Hook that listens for messages from the extension host
 * and dispatches them to the appropriate stores via the handler map.
 */
export function useVSCode(): void {
  useEffect(() => {
    const unsubscribe = onMessage((msg) => {
      handleExtensionMessage(msg as { type: string; data?: unknown; state?: unknown });
    });

    // Notify extension we're ready
    postMessage({ type: 'ready' });

    return unsubscribe;
  }, []);
}
