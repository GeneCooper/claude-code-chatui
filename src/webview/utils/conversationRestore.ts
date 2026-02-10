/**
 * Conversation Restore Utilities
 *
 * Rebuilds chat messages from stored conversation data.
 * Handles streaming message merging, tool use/result pairing,
 * and token usage attribution.
 *
 * @module webview/utils/conversationRestore
 */

import type { ConversationMessage } from '../../shared/types';

// ============================================================================
// Types
// ============================================================================

export interface ChatMessage {
  type: string;
  data: unknown;
  timestamp?: string;
}

export interface ConversationListItem {
  filename: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  messageCount: number;
  totalCost: number;
  firstUserMessage: string;
  lastUserMessage: string;
}

export interface RestoreStatePayload {
  messages?: ChatMessage[];
  sessionId?: string;
  totalCost?: number;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a value to a timestamp in milliseconds.
 */
export function toTimestamp(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return isNaN(parsed) ? 0 : parsed;
  }
  if (value instanceof Date) return value.getTime();
  return 0;
}

/**
 * Safely convert a value to string content.
 */
export function toStringContent(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ============================================================================
// Message Building
// ============================================================================

/**
 * Build chat messages from stored conversation messages.
 *
 * Handles:
 * - Merging consecutive 'output' messages into a single assistant message
 * - Pairing toolUse with toolResult via toolUseId index
 * - Token usage attribution to the nearest assistant message
 * - Filtering out internal-only message types
 */
export function buildChatMessages(storedMessages: ConversationMessage[]): ChatMessage[] {
  const result: ChatMessage[] = [];
  let activeAssistantIndex = -1;

  for (const msg of storedMessages) {
    const { messageType, data, timestamp } = msg;

    switch (messageType) {
      case 'userInput':
        activeAssistantIndex = -1;
        result.push({ type: 'userInput', data, timestamp });
        break;

      case 'output': {
        // Merge consecutive output messages
        if (activeAssistantIndex >= 0 && result[activeAssistantIndex].type === 'output') {
          const prevData = toStringContent(result[activeAssistantIndex].data);
          const newData = toStringContent(data);
          result[activeAssistantIndex].data = prevData + '\n' + newData;
        } else {
          activeAssistantIndex = result.length;
          result.push({ type: 'output', data, timestamp });
        }
        break;
      }

      case 'thinking':
        activeAssistantIndex = -1;
        result.push({ type: 'thinking', data, timestamp });
        break;

      case 'toolUse':
        activeAssistantIndex = -1;
        result.push({ type: 'toolUse', data, timestamp });
        break;

      case 'toolResult':
        activeAssistantIndex = -1;
        result.push({ type: 'toolResult', data, timestamp });
        break;

      case 'error':
        activeAssistantIndex = -1;
        result.push({ type: 'error', data, timestamp });
        break;

      case 'sessionInfo':
        result.push({ type: 'sessionInfo', data, timestamp });
        break;

      case 'permissionRequest':
        activeAssistantIndex = -1;
        result.push({ type: 'permissionRequest', data, timestamp });
        break;

      case 'compacting':
        result.push({ type: 'compacting', data, timestamp });
        break;

      case 'compactBoundary':
        result.push({ type: 'compactBoundary', data, timestamp });
        break;

      case 'restorePoint':
        result.push({ type: 'restorePoint', data, timestamp });
        break;

      // Skip internal messages
      case 'loading':
      case 'clearLoading':
      case 'setProcessing':
      case 'updateTokens':
      case 'updateTotals':
        break;

      default:
        // Forward unknown types as-is
        result.push({ type: messageType, data, timestamp });
        break;
    }
  }

  return result;
}

/**
 * Find the latest TodoWrite data from stored messages.
 * Returns the todos array from the most recent todosUpdate message.
 */
export function findLatestTodos(
  storedMessages: ConversationMessage[],
): Array<{ content: string; status: string; activeForm?: string }> | null {
  for (let i = storedMessages.length - 1; i >= 0; i--) {
    const msg = storedMessages[i];
    if (msg.messageType === 'todosUpdate') {
      const todosData = msg.data as { todos?: Array<{ content: string; status: string; activeForm?: string }> };
      return todosData?.todos || null;
    }
  }
  return null;
}

/**
 * Find todos only from the last turn (after the last user message).
 * This ensures we show the most relevant active todos.
 */
export function findTodosInLastTurn(
  storedMessages: ConversationMessage[],
): Array<{ content: string; status: string; activeForm?: string }> | null {
  // Find last user message index
  let lastUserIdx = -1;
  for (let i = storedMessages.length - 1; i >= 0; i--) {
    if (storedMessages[i].messageType === 'userInput') {
      lastUserIdx = i;
      break;
    }
  }

  // Search for todos after last user message
  const searchFrom = lastUserIdx >= 0 ? lastUserIdx : 0;
  for (let i = storedMessages.length - 1; i >= searchFrom; i--) {
    const msg = storedMessages[i];
    if (msg.messageType === 'todosUpdate') {
      const todosData = msg.data as { todos?: Array<{ content: string; status: string; activeForm?: string }> };
      return todosData?.todos || null;
    }
  }

  return null;
}

/**
 * Map raw conversation list items to typed objects.
 */
export function mapConversationList(
  items: Array<Record<string, unknown>>,
): ConversationListItem[] {
  return items.map((item) => ({
    filename: toStringContent(item.filename),
    sessionId: toStringContent(item.sessionId),
    startTime: toStringContent(item.startTime),
    endTime: toStringContent(item.endTime),
    messageCount: typeof item.messageCount === 'number' ? item.messageCount : 0,
    totalCost: typeof item.totalCost === 'number' ? item.totalCost : 0,
    firstUserMessage: toStringContent(item.firstUserMessage),
    lastUserMessage: toStringContent(item.lastUserMessage),
  }));
}
