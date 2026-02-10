import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { ConversationData, ConversationMessage, ConversationIndexEntry } from '../shared/types';

/**
 * Manages conversation persistence: save/load/index conversations to disk.
 * Conversations are stored as JSON files in the workspace storage directory.
 */
export class ConversationService {
  private _conversationsDir: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._conversationsDir = path.join(_context.globalStorageUri.fsPath, 'conversations');
    this._ensureConversationsDir();
  }

  private _ensureConversationsDir(): void {
    if (!fs.existsSync(this._conversationsDir)) {
      fs.mkdirSync(this._conversationsDir, { recursive: true });
    }
  }

  /**
   * Save a conversation to disk and update the index.
   */
  async saveConversation(
    sessionId: string,
    messages: ConversationMessage[],
    totalCost: number,
    totalTokensInput: number,
    totalTokensOutput: number,
  ): Promise<void> {
    if (!sessionId || messages.length === 0) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversation-${timestamp}.json`;
    const filePath = path.join(this._conversationsDir, filename);

    const startTime = messages[0]?.timestamp;
    const endTime = messages[messages.length - 1]?.timestamp || new Date().toISOString();

    const conversationData: ConversationData = {
      sessionId,
      startTime,
      endTime,
      messageCount: messages.length,
      totalCost,
      totalTokens: {
        input: totalTokensInput,
        output: totalTokensOutput,
      },
      messages,
      filename,
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(conversationData, null, 2), 'utf8');
      await this._updateConversationIndex(conversationData);
    } catch (err) {
      console.error('Failed to save conversation:', err);
    }
  }

  /**
   * Load a conversation from disk by filename.
   */
  loadConversation(filename: string): ConversationData | null {
    const filePath = path.join(this._conversationsDir, filename);
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw) as ConversationData;
    } catch {
      console.error(`Failed to load conversation: ${filename}`);
      return null;
    }
  }

  /**
   * Get the conversation index (list of all saved conversations).
   */
  getConversationList(): ConversationIndexEntry[] {
    const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
    // Return sorted by most recent first
    return [...index].sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
  }

  /**
   * Get the latest conversation's session ID (for auto-resume).
   */
  getLatestSessionId(): string | undefined {
    const list = this.getConversationList();
    return list.length > 0 ? list[0].sessionId : undefined;
  }

  /**
   * Update the conversation index in global state.
   */
  private async _updateConversationIndex(data: ConversationData): Promise<void> {
    const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);

    // Extract first and last user messages for preview
    let firstUserMessage = '';
    let lastUserMessage = '';
    for (const msg of data.messages) {
      if (msg.messageType === 'userInput') {
        const text = typeof msg.data === 'string' ? msg.data : '';
        if (!firstUserMessage) firstUserMessage = text;
        lastUserMessage = text;
      }
    }

    // Remove existing entry for same session if present
    const filtered = index.filter((e) => e.sessionId !== data.sessionId);

    filtered.push({
      filename: data.filename,
      sessionId: data.sessionId,
      startTime: data.startTime || data.endTime,
      endTime: data.endTime,
      messageCount: data.messageCount,
      totalCost: data.totalCost,
      firstUserMessage: firstUserMessage.substring(0, 100),
      lastUserMessage: lastUserMessage.substring(0, 100),
    });

    // Keep only the last 100 conversations
    const trimmed = filtered
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
      .slice(0, 100);

    await this._context.globalState.update('claude.conversationIndex', trimmed);
  }
}
