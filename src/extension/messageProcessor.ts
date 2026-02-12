// ============================================================================
// ClaudeMessageProcessor
// ============================================================================

import * as vscode from 'vscode';
import type {
  ClaudeMessage, ConversationMessage, ToolUseData,
  SystemMessage, AssistantMessage, UserMessage, ResultMessage,
  TextContent, ThinkingContent, ToolUseContent, ToolResultContent,
} from '../shared/types';
import { FILE_EDIT_TOOLS, HIDDEN_RESULT_TOOLS } from '../shared/constants';
import type { SessionStateManager } from './sessionState';

export interface MessagePoster {
  postMessage(msg: Record<string, unknown>): void;
  sendAndSaveMessage(msg: { type: string; data: unknown }): void;
}

export interface ProcessorCallbacks {
  onSessionIdReceived(sessionId: string): void;
  onProcessingComplete(result: { sessionId?: string; totalCostUsd?: number }): void;
  onToolResult?(data: { toolName: string; filePath: string; isError: boolean; fileContentBefore?: string; fileContentAfter?: string; rawInput?: Record<string, unknown> }): void;
}

function isToolUseData(data: unknown): data is ToolUseData {
  return typeof data === 'object' && data !== null && 'toolName' in data && 'rawInput' in data;
}

export class ClaudeMessageProcessor {
  private _currentConversation: ConversationMessage[] = [];

  constructor(
    private readonly _poster: MessagePoster,
    private readonly _stateManager: SessionStateManager,
    private readonly _callbacks: ProcessorCallbacks,
  ) {}

  get currentConversation(): ConversationMessage[] { return this._currentConversation; }

  resetSession(): void { this._currentConversation = []; }

  truncateConversation(endIndex: number): void {
    if (endIndex >= 0 && endIndex < this._currentConversation.length) {
      this._currentConversation = this._currentConversation.slice(0, endIndex + 1);
    }
  }

  async processMessage(msg: ClaudeMessage): Promise<void> {
    switch (msg.type) {
      case 'system': this._handleSystemMessage(msg); break;
      case 'assistant': await this._handleAssistantMessage(msg); break;
      case 'user': await this._handleUserMessage(msg); break;
      case 'result': this._handleResultMessage(msg); break;
    }
  }

  private _handleSystemMessage(msg: SystemMessage): void {
    switch (msg.subtype) {
      case 'init':
        this._callbacks.onSessionIdReceived(msg.session_id);
        this._sendAndSave({
          type: 'sessionInfo',
          data: {
            sessionId: msg.session_id,
            tools: msg.tools || [],
            mcpServers: msg.mcp_servers || [],
          },
        });
        break;
      case 'status':
        this._sendAndSave({
          type: 'compacting',
          data: { isCompacting: msg.status === 'compacting' },
        });
        break;
      case 'compact_boundary':
        this._stateManager.resetTokenCounts();
        this._sendAndSave({
          type: 'compactBoundary',
          data: {
            trigger: msg.compact_metadata?.trigger,
            preTokens: msg.compact_metadata?.pre_tokens,
          },
        });
        break;
    }
  }

  private async _handleAssistantMessage(msg: AssistantMessage): Promise<void> {
    if (!msg.message?.content) return;

    if (msg.message.usage) {
      const u = msg.message.usage;
      this._stateManager.addTokenUsage({
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
        cacheCreationTokens: u.cache_creation_input_tokens || 0,
      });

      this._sendAndSave({
        type: 'updateTokens',
        data: {
          totalTokensInput: this._stateManager.totalTokensInput,
          totalTokensOutput: this._stateManager.totalTokensOutput,
          currentInputTokens: u.input_tokens || 0,
          currentOutputTokens: u.output_tokens || 0,
          cacheCreationTokens: u.cache_creation_input_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
        },
      });
    }

    for (const content of msg.message.content) {
      switch (content.type) {
        case 'text':
          if (content.text?.trim()) {
            this._sendAndSave({ type: 'output', data: content.text.trim() });
          }
          break;
        case 'thinking':
          if (content.thinking?.trim()) {
            this._sendAndSave({ type: 'thinking', data: content.thinking.trim() });
          }
          break;
        case 'tool_use':
          await this._handleToolUse(content);
          break;
      }
    }
  }

  private async _handleToolUse(content: ToolUseContent): Promise<void> {
    const toolName = content.name;
    const input = content.input || {};
    const toolInfo = `🔧 Executing: ${toolName}`;

    let toolInput = '';
    let fileContentBefore: string | undefined;

    if (toolName === 'TodoWrite' && Array.isArray(input.todos)) {
      toolInput = '\nTodo List Update:';
      for (const todo of input.todos as Array<{ content: string; status: string; priority?: string }>) {
        const icon = todo.status === 'completed' ? '✅' : todo.status === 'in_progress' ? '🔄' : '⏳';
        toolInput += `\n${icon} ${todo.content}`;
      }
      this._poster.postMessage({ type: 'todosUpdate', data: { todos: input.todos } });
    }

    if (FILE_EDIT_TOOLS.includes(toolName) && typeof input.file_path === 'string') {
      try {
        const uri = vscode.Uri.file(input.file_path);
        const data = await vscode.workspace.fs.readFile(uri);
        fileContentBefore = Buffer.from(data).toString('utf8');
      } catch {
        fileContentBefore = '';
      }
    }

    let startLine: number | undefined;
    let startLines: number[] | undefined;

    if (fileContentBefore !== undefined) {
      if (toolName === 'Edit' && typeof input.old_string === 'string') {
        const pos = fileContentBefore.indexOf(input.old_string);
        if (pos !== -1) {
          startLine = (fileContentBefore.substring(0, pos).match(/\n/g) || []).length + 1;
        } else {
          startLine = 1;
        }
      } else if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
        startLines = (input.edits as Array<{ old_string?: string }>).map((edit) => {
          if (edit.old_string && fileContentBefore) {
            const pos = fileContentBefore.indexOf(edit.old_string);
            if (pos !== -1) {
              return (fileContentBefore.substring(0, pos).match(/\n/g) || []).length + 1;
            }
          }
          return 1;
        });
      }
    }

    const toolUseData: ToolUseData = {
      toolInfo, toolInput, rawInput: input, toolName,
      fileContentBefore, startLine, startLines,
    };

    this._sendAndSave({ type: 'toolUse', data: toolUseData });
  }

  private async _handleUserMessage(msg: UserMessage): Promise<void> {
    if (!msg.message?.content) return;

    for (const content of msg.message.content) {
      if (content.type !== 'tool_result') continue;

      let resultContent: string | unknown = content.content || 'Tool executed successfully';
      if (typeof resultContent === 'object' && resultContent !== null) {
        resultContent = JSON.stringify(resultContent, null, 2);
      }

      const isError = !!content.is_error;
      const lastToolUse = this._currentConversation[this._currentConversation.length - 1];
      const toolData = isToolUseData(lastToolUse?.data) ? lastToolUse.data : undefined;
      const toolName = toolData?.toolName;
      const rawInput = toolData?.rawInput;

      let fileContentAfter: string | undefined;
      if (FILE_EDIT_TOOLS.includes(toolName || '') && typeof rawInput?.file_path === 'string' && !isError) {
        try {
          const uri = vscode.Uri.file(rawInput.file_path);
          const data = await vscode.workspace.fs.readFile(uri);
          fileContentAfter = Buffer.from(data).toString('utf8');
        } catch { /* File read failed */ }
      }

      const hidden = HIDDEN_RESULT_TOOLS.includes(toolName || '') && !isError;

      this._sendAndSave({
        type: 'toolResult',
        data: {
          content: resultContent, isError,
          toolUseId: content.tool_use_id, toolName, rawInput,
          fileContentBefore: toolData?.fileContentBefore,
          fileContentAfter,
          startLine: toolData?.startLine,
          startLines: toolData?.startLines,
          hidden,
        },
      });

      // Trigger onToolResult for post-edit analysis (next-edit predictions, rules checking)
      if (this._callbacks.onToolResult && FILE_EDIT_TOOLS.includes(toolName || '') && !isError && typeof rawInput?.file_path === 'string') {
        this._callbacks.onToolResult({
          toolName: toolName || '',
          filePath: rawInput.file_path,
          isError,
          fileContentBefore: toolData?.fileContentBefore,
          fileContentAfter,
          rawInput,
        });
      }
    }
  }

  private _handleResultMessage(msg: ResultMessage): void {
    if (msg.subtype !== 'success') return;

    if (msg.is_error && msg.result?.includes('Invalid API key')) {
      this._poster.postMessage({ type: 'showInstallModal' });
      return;
    }

    if (msg.session_id) {
      this._callbacks.onSessionIdReceived(msg.session_id);
      this._sendAndSave({
        type: 'sessionInfo',
        data: { sessionId: msg.session_id, tools: [], mcpServers: [] },
      });
    }

    this._stateManager.incrementRequestCount();
    if (msg.total_cost_usd) this._stateManager.addCost(msg.total_cost_usd);

    this._poster.postMessage({
      type: 'updateTotals',
      data: {
        totalCost: this._stateManager.totalCost,
        totalTokensInput: this._stateManager.totalTokensInput,
        totalTokensOutput: this._stateManager.totalTokensOutput,
        requestCount: this._stateManager.requestCount,
        currentCost: msg.total_cost_usd,
        currentDuration: msg.duration_ms,
        currentTurns: msg.num_turns,
      },
    });

    this._callbacks.onProcessingComplete({
      sessionId: msg.session_id,
      totalCostUsd: msg.total_cost_usd,
    });
  }

  private _sendAndSave(msg: { type: string; data: unknown }): void {
    this._currentConversation.push({
      timestamp: new Date().toISOString(),
      messageType: msg.type,
      data: msg.data,
    });
    this._poster.sendAndSaveMessage(msg);
  }
}
