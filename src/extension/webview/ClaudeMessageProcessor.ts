import * as vscode from 'vscode';
import type {
  ClaudeMessage,
  ConversationMessage,
  ToolUseData,
} from '../../shared/types';
import { FILE_EDIT_TOOLS, HIDDEN_RESULT_TOOLS } from '../../shared/constants';

export interface MessagePoster {
  postMessage(msg: Record<string, unknown>): void;
  sendAndSaveMessage(msg: { type: string; data: unknown }): void;
}

export interface ProcessorCallbacks {
  onSessionIdReceived(sessionId: string): void;
  onProcessingComplete(result: { sessionId?: string; totalCostUsd?: number }): void;
}

/**
 * Processes Claude CLI JSON stream messages and dispatches to webview.
 */
export class ClaudeMessageProcessor {
  private _totalCost = 0;
  private _totalTokensInput = 0;
  private _totalTokensOutput = 0;
  private _requestCount = 0;
  private _currentConversation: ConversationMessage[] = [];

  constructor(
    private readonly _poster: MessagePoster,
    private readonly _callbacks: ProcessorCallbacks,
  ) {}

  // Accessors for state
  get totalCost(): number { return this._totalCost; }
  get totalTokensInput(): number { return this._totalTokensInput; }
  get totalTokensOutput(): number { return this._totalTokensOutput; }
  get requestCount(): number { return this._requestCount; }
  get currentConversation(): ConversationMessage[] { return this._currentConversation; }

  resetSession(): void {
    this._totalCost = 0;
    this._totalTokensInput = 0;
    this._totalTokensOutput = 0;
    this._requestCount = 0;
    this._currentConversation = [];
  }

  /**
   * Process a single JSON message from Claude CLI stdout.
   */
  async processMessage(jsonData: ClaudeMessage): Promise<void> {
    switch (jsonData.type) {
      case 'system':
        this._handleSystemMessage(jsonData);
        break;
      case 'assistant':
        await this._handleAssistantMessage(jsonData);
        break;
      case 'user':
        await this._handleUserMessage(jsonData);
        break;
      case 'result':
        this._handleResultMessage(jsonData);
        break;
    }
  }

  private _handleSystemMessage(msg: ClaudeMessage): void {
    const sys = msg as { subtype: string; session_id?: string; status?: string | null; compact_metadata?: { trigger?: string; pre_tokens?: number } };

    if (sys.subtype === 'init' && sys.session_id) {
      this._callbacks.onSessionIdReceived(sys.session_id);
      this._sendAndSave({
        type: 'sessionInfo',
        data: {
          sessionId: sys.session_id,
          tools: (msg as unknown as Record<string, unknown>).tools || [],
          mcpServers: (msg as unknown as Record<string, unknown>).mcp_servers || [],
        },
      });
    } else if (sys.subtype === 'status') {
      this._sendAndSave({
        type: 'compacting',
        data: { isCompacting: sys.status === 'compacting' },
      });
    } else if (sys.subtype === 'compact_boundary') {
      this._totalTokensInput = 0;
      this._totalTokensOutput = 0;
      this._sendAndSave({
        type: 'compactBoundary',
        data: {
          trigger: sys.compact_metadata?.trigger,
          preTokens: sys.compact_metadata?.pre_tokens,
        },
      });
    }
  }

  private async _handleAssistantMessage(msg: ClaudeMessage): Promise<void> {
    const assistant = msg as { message?: { content: Array<Record<string, unknown>>; usage?: Record<string, number> } };
    if (!assistant.message?.content) return;

    // Track token usage
    if (assistant.message.usage) {
      const u = assistant.message.usage;
      this._totalTokensInput += u.input_tokens || 0;
      this._totalTokensOutput += u.output_tokens || 0;

      this._sendAndSave({
        type: 'updateTokens',
        data: {
          totalTokensInput: this._totalTokensInput,
          totalTokensOutput: this._totalTokensOutput,
          currentInputTokens: u.input_tokens || 0,
          currentOutputTokens: u.output_tokens || 0,
          cacheCreationTokens: u.cache_creation_input_tokens || 0,
          cacheReadTokens: u.cache_read_input_tokens || 0,
        },
      });
    }

    for (const content of assistant.message.content) {
      if (content.type === 'text' && (content.text as string)?.trim()) {
        this._sendAndSave({ type: 'output', data: (content.text as string).trim() });
      } else if (content.type === 'thinking' && (content.thinking as string)?.trim()) {
        this._sendAndSave({ type: 'thinking', data: (content.thinking as string).trim() });
      } else if (content.type === 'tool_use') {
        await this._handleToolUse(content as Record<string, unknown>);
      }
    }
  }

  private async _handleToolUse(content: Record<string, unknown>): Promise<void> {
    const toolName = content.name as string;
    const input = (content.input || {}) as Record<string, unknown>;
    const toolInfo = `🔧 Executing: ${toolName}`;

    let toolInput = '';
    let fileContentBefore: string | undefined;

    // Special formatting for TodoWrite
    if (toolName === 'TodoWrite' && input.todos) {
      toolInput = '\nTodo List Update:';
      for (const todo of input.todos as Array<{ content: string; status: string; priority?: string }>) {
        const icon = todo.status === 'completed' ? '✅' : todo.status === 'in_progress' ? '🔄' : '⏳';
        toolInput += `\n${icon} ${todo.content}`;
      }
      // Send todosUpdate to webview for live todo display
      this._poster.postMessage({
        type: 'todosUpdate',
        data: { todos: input.todos },
      });
    }

    // Read file content before edit (for diff)
    if (FILE_EDIT_TOOLS.includes(toolName) && input.file_path) {
      try {
        const uri = vscode.Uri.file(input.file_path as string);
        const data = await vscode.workspace.fs.readFile(uri);
        fileContentBefore = Buffer.from(data).toString('utf8');
      } catch {
        fileContentBefore = '';
      }
    }

    // Compute startLine for Edit tool
    let startLine: number | undefined;
    let startLines: number[] | undefined;

    if (fileContentBefore !== undefined) {
      if (toolName === 'Edit' && input.old_string) {
        const pos = fileContentBefore.indexOf(input.old_string as string);
        if (pos !== -1) {
          startLine = (fileContentBefore.substring(0, pos).match(/\n/g) || []).length + 1;
        } else {
          startLine = 1;
        }
      } else if (toolName === 'MultiEdit' && input.edits) {
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
      toolInfo,
      toolInput,
      rawInput: input,
      toolName,
      fileContentBefore,
      startLine,
      startLines,
    };

    this._sendAndSave({ type: 'toolUse', data: toolUseData });
  }

  private async _handleUserMessage(msg: ClaudeMessage): Promise<void> {
    const user = msg as { message?: { content: Array<Record<string, unknown>> } };
    if (!user.message?.content) return;

    for (const content of user.message.content) {
      if (content.type !== 'tool_result') continue;

      let resultContent = content.content || 'Tool executed successfully';
      if (typeof resultContent === 'object' && resultContent !== null) {
        resultContent = JSON.stringify(resultContent, null, 2);
      }

      const isError = !!content.is_error;

      // Find the last toolUse message for context
      const lastToolUse = this._currentConversation[this._currentConversation.length - 1];
      const toolData = lastToolUse?.data as ToolUseData | undefined;
      const toolName = toolData?.toolName;
      const rawInput = toolData?.rawInput;

      // Read file content after edit (for diff)
      let fileContentAfter: string | undefined;
      if (FILE_EDIT_TOOLS.includes(toolName || '') && rawInput?.file_path && !isError) {
        try {
          const uri = vscode.Uri.file(rawInput.file_path as string);
          const data = await vscode.workspace.fs.readFile(uri);
          fileContentAfter = Buffer.from(data).toString('utf8');
        } catch {
          // File read failed
        }
      }

      // Hide results for Read/TodoWrite unless error
      const hidden = HIDDEN_RESULT_TOOLS.includes(toolName || '') && !isError;

      this._sendAndSave({
        type: 'toolResult',
        data: {
          content: resultContent,
          isError,
          toolUseId: content.tool_use_id,
          toolName,
          rawInput,
          fileContentBefore: toolData?.fileContentBefore,
          fileContentAfter,
          startLine: toolData?.startLine,
          startLines: toolData?.startLines,
          hidden,
        },
      });
    }
  }

  private _handleResultMessage(msg: ClaudeMessage): void {
    const result = msg as {
      subtype: string;
      session_id?: string;
      total_cost_usd?: number;
      duration_ms?: number;
      num_turns?: number;
      is_error?: boolean;
      result?: string;
    };

    if (result.subtype !== 'success') return;

    // Check for login errors
    if (result.is_error && result.result?.includes('Invalid API key')) {
      this._poster.postMessage({ type: 'showInstallModal' });
      return;
    }

    if (result.session_id) {
      this._callbacks.onSessionIdReceived(result.session_id);
      this._sendAndSave({
        type: 'sessionInfo',
        data: { sessionId: result.session_id, tools: [], mcpServers: [] },
      });
    }

    this._requestCount++;
    if (result.total_cost_usd) {
      this._totalCost += result.total_cost_usd;
    }

    this._poster.postMessage({
      type: 'updateTotals',
      data: {
        totalCost: this._totalCost,
        totalTokensInput: this._totalTokensInput,
        totalTokensOutput: this._totalTokensOutput,
        requestCount: this._requestCount,
        currentCost: result.total_cost_usd,
        currentDuration: result.duration_ms,
        currentTurns: result.num_turns,
      },
    });

    this._callbacks.onProcessingComplete({
      sessionId: result.session_id,
      totalCostUsd: result.total_cost_usd,
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
