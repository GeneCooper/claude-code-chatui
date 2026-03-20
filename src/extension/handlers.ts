import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ClaudeMessage,
  ConversationMessage,
  ToolUseData,
  MCPServerConfig,
} from '../shared/types';
import type { PanelManager } from './panelManager';
import { t } from './i18n';
import { FILE_EDIT_TOOLS, HIDDEN_RESULT_TOOLS, PROTECTED_MCP_SERVERS } from '../shared/constants';
import type { ClaudeService } from './claude';
import type { PermissionService } from './claude';
import type { ConversationService, UsageService, MCPService } from './storage';

// ============================================================================
// DiffContentProvider
// ============================================================================

const diffContentStore = new Map<string, string>();

export class DiffContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'claude-diff';

  provideTextDocumentContent(uri: vscode.Uri): string {
    return diffContentStore.get(uri.toString()) || '';
  }

  static storeContent(label: string, content: string): vscode.Uri {
    const uri = vscode.Uri.parse(`${DiffContentProvider.scheme}:${label}`);
    diffContentStore.set(uri.toString(), content);
    return uri;
  }

  static async openDiff(
    oldContent: string,
    newContent: string,
    filePath: string,
  ): Promise<void> {
    const fileName = filePath.split(/[\\/]/).pop() || 'file';
    const timestamp = Date.now();
    const leftUri = DiffContentProvider.storeContent(`${fileName}.before.${timestamp}`, oldContent);
    const rightUri = DiffContentProvider.storeContent(`${fileName}.after.${timestamp}`, newContent);
    await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, `${fileName} (Before ↔ After)`, { preview: true });
  }
}

// ============================================================================
// MarkdownContentProvider (artifact documents)
// ============================================================================

const markdownContentStore = new Map<string, string>();

export class MarkdownContentProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'claude-artifact';

  provideTextDocumentContent(uri: vscode.Uri): string {
    return markdownContentStore.get(uri.toString()) || '';
  }

  static async openMarkdown(content: string, title: string): Promise<void> {
    const safeTitle = title.replace(/[^\w\u4e00-\u9fff-]/g, '_').slice(0, 40);
    const label = `${safeTitle}.${Date.now()}.md`;
    const uri = vscode.Uri.parse(`${MarkdownContentProvider.scheme}:${label}`);
    markdownContentStore.set(uri.toString(), content);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.Beside });
    await vscode.commands.executeCommand('markdown.showPreview', uri);
  }
}

// ============================================================================
// SessionStateManager
// ============================================================================

interface ToolUseMetric {
  startTime: number;
  tokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  toolName?: string;
  rawInput?: Record<string, unknown>;
  fileContentBefore?: string;
  startLine?: number;
  startLines?: number[];
}

interface SessionState {
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  totalCacheReadTokens: number;
  totalCacheCreationTokens: number;
  requestCount: number;
  isProcessing: boolean;
  hasOpenOutput: boolean;
  draftMessage: string;
  selectedModel: string;
}

interface TokenUsageUpdate {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export class SessionStateManager {
  private _totalCost = 0;
  private _totalTokensInput = 0;
  private _totalTokensOutput = 0;
  private _totalCacheReadTokens = 0;
  private _totalCacheCreationTokens = 0;
  private _requestCount = 0;
  private _isProcessing = false;
  private _hasOpenOutput = false;
  private _draftMessage = '';
  private _selectedModel = 'default';
  private _toolUseMetrics = new Map<string, ToolUseMetric>();

  getState(): SessionState {
    return {
      totalCost: this._totalCost,
      totalTokensInput: this._totalTokensInput,
      totalTokensOutput: this._totalTokensOutput,
      totalCacheReadTokens: this._totalCacheReadTokens,
      totalCacheCreationTokens: this._totalCacheCreationTokens,
      requestCount: this._requestCount,
      isProcessing: this._isProcessing,
      hasOpenOutput: this._hasOpenOutput,
      draftMessage: this._draftMessage,
      selectedModel: this._selectedModel,
    };
  }

  setState(updates: Partial<SessionState>): void {
    if (updates.totalCost !== undefined) this._totalCost = updates.totalCost;
    if (updates.totalTokensInput !== undefined) this._totalTokensInput = updates.totalTokensInput;
    if (updates.totalTokensOutput !== undefined) this._totalTokensOutput = updates.totalTokensOutput;
    if (updates.totalCacheReadTokens !== undefined) this._totalCacheReadTokens = updates.totalCacheReadTokens;
    if (updates.totalCacheCreationTokens !== undefined) this._totalCacheCreationTokens = updates.totalCacheCreationTokens;
    if (updates.requestCount !== undefined) this._requestCount = updates.requestCount;
    if (updates.isProcessing !== undefined) this._isProcessing = updates.isProcessing;
    if (updates.hasOpenOutput !== undefined) this._hasOpenOutput = updates.hasOpenOutput;
    if (updates.draftMessage !== undefined) this._draftMessage = updates.draftMessage;
    if (updates.selectedModel !== undefined) this._selectedModel = updates.selectedModel;
  }

  get totalCost(): number { return this._totalCost; }
  set totalCost(value: number) { this._totalCost = value; }

  get totalTokensInput(): number { return this._totalTokensInput; }
  set totalTokensInput(value: number) { this._totalTokensInput = value; }

  get totalTokensOutput(): number { return this._totalTokensOutput; }
  set totalTokensOutput(value: number) { this._totalTokensOutput = value; }

  get totalCacheReadTokens(): number { return this._totalCacheReadTokens; }
  set totalCacheReadTokens(value: number) { this._totalCacheReadTokens = value; }

  get totalCacheCreationTokens(): number { return this._totalCacheCreationTokens; }
  set totalCacheCreationTokens(value: number) { this._totalCacheCreationTokens = value; }

  get requestCount(): number { return this._requestCount; }
  set requestCount(value: number) { this._requestCount = value; }

  get isProcessing(): boolean { return this._isProcessing; }
  set isProcessing(value: boolean) { this._isProcessing = value; }

  get hasOpenOutput(): boolean { return this._hasOpenOutput; }
  set hasOpenOutput(value: boolean) { this._hasOpenOutput = value; }

  get draftMessage(): string { return this._draftMessage; }
  set draftMessage(value: string) { this._draftMessage = value; }

  get selectedModel(): string { return this._selectedModel; }
  set selectedModel(value: string) { this._selectedModel = value; }

  addTokenUsage(usage: TokenUsageUpdate): void {
    this._totalTokensInput += usage.inputTokens;
    this._totalTokensOutput += usage.outputTokens;
    this._totalCacheReadTokens += usage.cacheReadTokens;
    this._totalCacheCreationTokens += usage.cacheCreationTokens;
  }

  resetTokenCounts(): void {
    this._totalTokensInput = 0;
    this._totalTokensOutput = 0;
    this._totalCacheReadTokens = 0;
    this._totalCacheCreationTokens = 0;
  }

  getTokenTotals(): TokenUsageUpdate {
    return {
      inputTokens: this._totalTokensInput,
      outputTokens: this._totalTokensOutput,
      cacheReadTokens: this._totalCacheReadTokens,
      cacheCreationTokens: this._totalCacheCreationTokens,
    };
  }

  addCost(cost: number): void { this._totalCost += cost; }
  incrementRequestCount(): void { this._requestCount++; }

  setToolMetric(toolUseId: string, metric: ToolUseMetric): void { this._toolUseMetrics.set(toolUseId, metric); }
  getToolMetric(toolUseId: string): ToolUseMetric | undefined { return this._toolUseMetrics.get(toolUseId); }
  deleteToolMetric(toolUseId: string): void { this._toolUseMetrics.delete(toolUseId); }
  clearToolMetrics(): void { this._toolUseMetrics.clear(); }

  resetSession(): void {
    this._totalCost = 0;
    this._totalTokensInput = 0;
    this._totalTokensOutput = 0;
    this._totalCacheReadTokens = 0;
    this._totalCacheCreationTokens = 0;
    this._requestCount = 0;
    this._isProcessing = false;
    this._hasOpenOutput = false;
    this._toolUseMetrics.clear();
  }

  restoreFromConversation(data: { totalCost: number; totalTokens: { input: number; output: number } }): void {
    this._totalCost = data.totalCost;
    this._totalTokensInput = data.totalTokens.input;
    this._totalTokensOutput = data.totalTokens.output;
    this._totalCacheReadTokens = 0;
    this._totalCacheCreationTokens = 0;
  }
}

// ============================================================================
// ClaudeMessageProcessor
// ============================================================================

export interface MessagePoster {
  postMessage(msg: Record<string, unknown>): void;
  sendAndSaveMessage(msg: { type: string; data: unknown }): void;
}

export interface ProcessorCallbacks {
  onSessionIdReceived(sessionId: string): void;
  onProcessingComplete(result: { sessionId?: string; totalCostUsd?: number }): void;
  onSessionNotFound?(): void;
}

export class ClaudeMessageProcessor {
  private _currentConversation: ConversationMessage[] = [];
  private _partialText: string | null = null;
  private _hasPartialOutput = false;
  private _pendingTokenUpdate: Record<string, number> | null = null;
  private _tokenDebounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly _poster: MessagePoster,
    private readonly _stateManager: SessionStateManager,
    private readonly _callbacks: ProcessorCallbacks,
  ) {}

  private _flushTokenUpdate(): void {
    if (this._pendingTokenUpdate) {
      this._poster.postMessage({ type: 'updateTokens', data: this._pendingTokenUpdate });
      this._pendingTokenUpdate = null;
    }
    if (this._tokenDebounceTimer) {
      clearTimeout(this._tokenDebounceTimer);
      this._tokenDebounceTimer = undefined;
    }
  }

  get currentConversation(): ConversationMessage[] { return this._currentConversation; }

  resetSession(): void {
    this._currentConversation = [];
    this._partialText = null;
    this._hasPartialOutput = false;
    this._flushTokenUpdate();
  }

  truncateConversation(endIndex: number): void {
    if (endIndex >= 0 && endIndex < this._currentConversation.length) {
      this._currentConversation = this._currentConversation.slice(0, endIndex + 1);
    }
  }

  async processMessage(jsonData: ClaudeMessage): Promise<void> {
    switch (jsonData.type) {
      case 'system': this._handleSystemMessage(jsonData); break;
      case 'assistant': await this._handleAssistantMessage(jsonData); break;
      case 'user': await this._handleUserMessage(jsonData); break;
      case 'result': this._handleResultMessage(jsonData); break;
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
      this._stateManager.resetTokenCounts();
      this._sendAndSave({
        type: 'compactBoundary',
        data: {
          trigger: sys.compact_metadata?.trigger,
          preTokens: sys.compact_metadata?.pre_tokens,
        },
      });
    }
  }

  /** Flush accumulated partial text into conversation history as a final output message. */
  private _flushPartialOutput(): void {
    if (this._hasPartialOutput && this._partialText !== null) {
      // Save final text to conversation history only — webview already has it displayed
      this._currentConversation.push({
        timestamp: new Date().toISOString(),
        messageType: 'output',
        data: this._partialText,
      });
    }
    this._partialText = null;
    this._hasPartialOutput = false;
  }

  private async _handleAssistantMessage(msg: ClaudeMessage): Promise<void> {
    const assistant = msg as { message?: { content: Array<Record<string, unknown>>; usage?: Record<string, number> } };
    if (!assistant.message?.content) return;

    if (assistant.message.usage) {
      const u = assistant.message.usage;
      this._stateManager.addTokenUsage({
        inputTokens: u.input_tokens || 0,
        outputTokens: u.output_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
        cacheCreationTokens: u.cache_creation_input_tokens || 0,
      });

      // Debounce token updates — accumulate and send max every 300ms
      this._pendingTokenUpdate = {
        totalTokensInput: this._stateManager.totalTokensInput,
        totalTokensOutput: this._stateManager.totalTokensOutput,
        currentInputTokens: u.input_tokens || 0,
        currentOutputTokens: u.output_tokens || 0,
        cacheCreationTokens: u.cache_creation_input_tokens || 0,
        cacheReadTokens: u.cache_read_input_tokens || 0,
      };
      if (!this._tokenDebounceTimer) {
        this._tokenDebounceTimer = setTimeout(() => {
          this._tokenDebounceTimer = undefined;
          this._flushTokenUpdate();
        }, 300);
      }
    }

    for (const content of assistant.message.content) {
      if (content.type === 'text' && (content.text as string)?.trim()) {
        const text = (content.text as string).trim();
        // Stream partial text to webview for real-time display (not saved to history yet)
        this._partialText = text;
        this._hasPartialOutput = true;
        this._poster.postMessage({ type: 'output', data: text, partial: true });
      } else if (content.type === 'thinking' && (content.thinking as string)?.trim()) {
        this._flushPartialOutput();
        this._sendAndSave({ type: 'thinking', data: (content.thinking as string).trim() });
      } else if (content.type === 'tool_use') {
        this._flushPartialOutput();
        await this._handleToolUse(content as Record<string, unknown>);
      }
    }
  }

  private async _handleToolUse(content: Record<string, unknown>): Promise<void> {
    const toolName = content.name as string;
    const input = (content.input || {}) as Record<string, unknown>;
    const toolInfo = `🔧 Executing: ${toolName}`;

    let toolInput = '';

    if (toolName === 'TodoWrite' && Array.isArray(input.todos)) {
      toolInput = '\nTodo List Update:';
      for (const todo of input.todos as Array<{ content: string; status: string; priority?: string }>) {
        const icon = todo.status === 'completed' ? '✅' : todo.status === 'in_progress' ? '🔄' : '⏳';
        toolInput += `\n${icon} ${todo.content}`;
      }
      this._poster.postMessage({ type: 'todosUpdate', data: { todos: input.todos } });
    }

    // Send tool use message immediately — don't block on file read
    const toolUseId = content.id as string || `${toolName}-${Date.now()}`;
    const toolUseData: ToolUseData = {
      toolInfo, toolInput, rawInput: input, toolName, toolUseId,
    };
    this._sendAndSave({ type: 'toolUse', data: toolUseData });

    // Read file content asynchronously for diff tracking (stored in metric, used by tool_result)
    if (FILE_EDIT_TOOLS.includes(toolName) && input.file_path) {
      void (async () => {
        let fileContentBefore = '';
        try {
          const uri = vscode.Uri.file(input.file_path as string);
          const data = await vscode.workspace.fs.readFile(uri);
          fileContentBefore = Buffer.from(data).toString('utf8');
        } catch { /* empty fallback */ }

        let startLine: number | undefined;
        let startLines: number[] | undefined;

        if (toolName === 'Edit' && input.old_string) {
          const pos = fileContentBefore.indexOf(input.old_string as string);
          startLine = pos !== -1 ? (fileContentBefore.substring(0, pos).match(/\n/g) || []).length + 1 : 1;
        } else if (toolName === 'MultiEdit' && input.edits) {
          startLines = (input.edits as Array<{ old_string?: string }>).map((edit) => {
            if (edit.old_string && fileContentBefore) {
              const pos = fileContentBefore.indexOf(edit.old_string);
              if (pos !== -1) return (fileContentBefore.substring(0, pos).match(/\n/g) || []).length + 1;
            }
            return 1;
          });
        }

        this._stateManager.setToolMetric(toolUseId, {
          startTime: Date.now(), toolName, rawInput: input,
          fileContentBefore, startLine, startLines,
        });

        // Update the matching conversation entry (find by toolUseId, not last entry)
        for (let i = this._currentConversation.length - 1; i >= 0; i--) {
          const entry = this._currentConversation[i];
          if (entry.messageType === 'toolUse' && (entry.data as ToolUseData).toolUseId === toolUseId) {
            const data = entry.data as ToolUseData;
            data.fileContentBefore = fileContentBefore;
            data.startLine = startLine;
            data.startLines = startLines;
            break;
          }
        }
      })();
    }
  }

  private async _handleUserMessage(msg: ClaudeMessage): Promise<void> {
    this._flushPartialOutput();
    const user = msg as { message?: { content: Array<Record<string, unknown>> } };
    if (!user.message?.content) return;

    for (const content of user.message.content) {
      if (content.type !== 'tool_result') continue;

      let resultContent = content.content || 'Tool executed successfully';
      if (typeof resultContent === 'object' && resultContent !== null) {
        resultContent = JSON.stringify(resultContent);
      }

      const isError = !!content.is_error;
      // Match toolUse by toolUseId (not last entry) to handle parallel tool execution in YOLO mode
      const targetToolUseId = content.tool_use_id as string;
      let toolData: ToolUseData | undefined;
      for (let i = this._currentConversation.length - 1; i >= 0; i--) {
        const entry = this._currentConversation[i];
        if (entry.messageType === 'toolUse' && (entry.data as ToolUseData).toolUseId === targetToolUseId) {
          toolData = entry.data as ToolUseData;
          break;
        }
      }
      const toolName = toolData?.toolName;
      const rawInput = toolData?.rawInput;
      const hidden = HIDDEN_RESULT_TOOLS.includes(toolName || '') && !isError;

      // Send tool result immediately — don't block on file read
      this._sendAndSave({
        type: 'toolResult',
        data: {
          content: resultContent, isError,
          toolUseId: content.tool_use_id, toolName, rawInput,
          fileContentBefore: toolData?.fileContentBefore,
          startLine: toolData?.startLine,
          startLines: toolData?.startLines,
          hidden,
        },
      });

      // Read file-after content asynchronously and send diff update
      if (FILE_EDIT_TOOLS.includes(toolName || '') && rawInput?.file_path && !isError) {
        const filePath = rawInput.file_path as string;
        const capturedToolData = toolData;
        void (async () => {
          try {
            const uri = vscode.Uri.file(filePath);
            const data = await vscode.workspace.fs.readFile(uri);
            const fileContentAfter = Buffer.from(data).toString('utf8');

            // Update the conversation entry with after-content for replay
            const convEntry = this._currentConversation[this._currentConversation.length - 1];
            if (convEntry?.messageType === 'toolResult') {
              const resultData = convEntry.data as Record<string, unknown>;
              resultData.fileContentAfter = fileContentAfter;
            }

            // Send diff update to webview
            this._poster.postMessage({
              type: 'toolResultDiffUpdate',
              data: { toolUseId: content.tool_use_id, fileContentAfter },
            });

            // Auto-open diff when file-edit tool succeeds
            if (capturedToolData?.fileContentBefore !== undefined) {
              const autoOpenDiff = vscode.workspace.getConfiguration('claudeCodeChatUI').get<boolean>('autoOpenDiff', false);
              if (autoOpenDiff) {
                setTimeout(() => {
                  void DiffContentProvider.openDiff(capturedToolData.fileContentBefore!, fileContentAfter, filePath);
                }, 300);
              }
            }

          } catch { /* File read failed */ }
        })();
      }
    }
  }

  private _handleResultMessage(msg: ClaudeMessage): void {
    this._flushPartialOutput();
    this._flushTokenUpdate();
    const result = msg as {
      subtype: string; session_id?: string; total_cost_usd?: number;
      duration_ms?: number; num_turns?: number; is_error?: boolean; result?: string;
      errors?: string[];
    };

    // Handle error results (e.g. session not found when using --resume)
    if (result.subtype !== 'success') {
      const allErrors = result.errors || (result.result ? [result.result] : []);
      const sessionNotFound = allErrors.some((e) => e.includes('No conversation found with session ID'));
      if (sessionNotFound) {
        this._callbacks.onSessionNotFound?.();
        this._poster.postMessage({ type: 'error', data: t('error.sessionExpired') });
      } else {
        for (const err of allErrors) {
          this._poster.postMessage({ type: 'error', data: err });
        }
      }
      return;
    }

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

    this._stateManager.incrementRequestCount();
    if (result.total_cost_usd) this._stateManager.addCost(result.total_cost_usd);

    this._poster.postMessage({
      type: 'updateTotals',
      data: {
        totalCost: this._stateManager.totalCost,
        requestCount: this._stateManager.requestCount,
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

// ============================================================================
// SettingsManager
// ============================================================================

interface WebviewSettings {
  selectedModel: string;
  effortLevel: string;
  yoloMode: boolean;
  maxTurns: number;
}

const CONFIG_KEYS = {
  EFFORT_LEVEL: 'effortLevel',
  PERMISSIONS_YOLO_MODE: 'permissions.yoloMode',
  MAX_TURNS: 'maxTurns',
} as const;

const DEFAULTS = {
  EFFORT_LEVEL: 'low',
  YOLO_MODE: true,
  MAX_TURNS: 25,
};

export class SettingsManager {
  private readonly _configSection = 'claudeCodeChatUI';

  private _getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(this._configSection);
  }

  getCurrentSettings(selectedModel: string): WebviewSettings {
    const config = this._getConfig();
    const effort = config.get<string>(CONFIG_KEYS.EFFORT_LEVEL, DEFAULTS.EFFORT_LEVEL);
    return {
      selectedModel,
      effortLevel: ['low', 'medium', 'high', 'max'].includes(effort) ? effort : DEFAULTS.EFFORT_LEVEL,
      yoloMode: config.get<boolean>(CONFIG_KEYS.PERMISSIONS_YOLO_MODE, DEFAULTS.YOLO_MODE),
      maxTurns: config.get<number>(CONFIG_KEYS.MAX_TURNS, DEFAULTS.MAX_TURNS),
    };
  }

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    const config = this._getConfig();
    if (!settings || typeof settings !== 'object') return;

    if (typeof settings.effortLevel === 'string') {
      await config.update(CONFIG_KEYS.EFFORT_LEVEL, settings.effortLevel, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.yoloMode === 'boolean') {
      await config.update(CONFIG_KEYS.PERMISSIONS_YOLO_MODE, settings.yoloMode, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.maxTurns === 'number') {
      await config.update(CONFIG_KEYS.MAX_TURNS, settings.maxTurns, vscode.ConfigurationTarget.Global);
    }
  }

  getDisallowedTools(): string[] {
    return [];
  }

  async enableYoloMode(): Promise<void> {
    await this._getConfig().update(CONFIG_KEYS.PERMISSIONS_YOLO_MODE, true, vscode.ConfigurationTarget.Global);
  }

  isYoloModeEnabled(): boolean {
    return this._getConfig().get<boolean>(CONFIG_KEYS.PERMISSIONS_YOLO_MODE, true);
  }

}

// ============================================================================
// Message Handlers
// ============================================================================

export interface MessageHandlerContext {
  claudeService: ClaudeService;
  conversationService: ConversationService;
  mcpService: MCPService;
  usageService: UsageService;
  permissionService: PermissionService;
  stateManager: SessionStateManager;
  settingsManager: SettingsManager;
  messageProcessor: ClaudeMessageProcessor;
  extensionContext: vscode.ExtensionContext;
  postMessage(msg: Record<string, unknown>): void;
  loadConversation(filename: string): Promise<void>;
  handleSendMessage(text: string, images?: string[]): void;
  panelManager?: PanelManager;
  rewindToMessage(userInputIndex: number): void;
}

export type WebviewMessage = { type: string; [key: string]: unknown };

type MessageHandler = (msg: WebviewMessage, ctx: MessageHandlerContext) => void | Promise<void>;

const handleSendMessage: MessageHandler = (msg, ctx) => {
  if (msg.model) {
    ctx.stateManager.selectedModel = msg.model as string;
    void ctx.extensionContext.workspaceState.update('claude.selectedModel', msg.model);
  }
  ctx.handleSendMessage(
    msg.text as string,
    msg.images as string[] | undefined,
  );
};

const handleStopRequest: MessageHandler = (_msg, ctx) => { void ctx.claudeService.stopProcess(); };

const handleReady: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'ready', data: 'Extension ready' });
  ctx.postMessage({
    type: 'platformInfo',
    data: { platform: process.platform, isWindows: process.platform === 'win32', locale: vscode.env.language },
  });
  checkCliAvailable(ctx);
  // Send current settings so webview has correct initial state
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { effortLevel: settings.effortLevel, yoloMode: settings.yoloMode, selectedModel: ctx.stateManager.selectedModel } });


  // Trigger immediate usage fetch so the indicator shows right away
  void ctx.usageService.fetchUsageData();

  // Replay conversation to restore webview state
  const conversation = ctx.messageProcessor.currentConversation;
  if (conversation.length > 0) {
    const replayMessages = conversation.map((msg) => ({ type: msg.messageType, data: msg.data }));
    ctx.postMessage({
      type: 'batchReplay',
      data: {
        messages: replayMessages,
        sessionId: ctx.claudeService.sessionId,
        totalCost: ctx.stateManager.totalCost,
        isProcessing: ctx.stateManager.isProcessing,
      },
    });
  }
};

const handlePermissionResponse: MessageHandler = (msg, ctx) => {
  ctx.claudeService.sendPermissionResponse(msg.id as string, msg.approved as boolean, msg.alwaysAllow as boolean | undefined);
  ctx.postMessage({ type: 'updatePermissionStatus', data: { id: msg.id, status: msg.approved ? 'approved' : 'denied' } });
};

const handleSelectModel: MessageHandler = (msg, ctx) => {
  ctx.stateManager.selectedModel = msg.model as string;
  void ctx.extensionContext.workspaceState.update('claude.selectedModel', msg.model);
};

const handleOpenModelTerminal: MessageHandler = () => {
  const terminal = vscode.window.createTerminal({ name: 'Claude Model Selection', location: { viewColumn: vscode.ViewColumn.One } });
  terminal.sendText('claude /model');
  terminal.show();
};

const handleRunInstallCommand: MessageHandler = (_msg, ctx) => {
  const { exec } = require('child_process') as typeof import('child_process');
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';

  exec('node --version', { shell }, (nodeErr: Error | null, nodeStdout: string) => {
    let command: string;
    const nodeOk = !nodeErr && nodeStdout && (() => {
      const m = nodeStdout.trim().match(/^v(\d+)/);
      return m && parseInt(m[1], 10) >= 18;
    })();

    if (nodeOk) {
      command = 'npm install -g @anthropic-ai/claude-code';
    } else if (process.platform === 'win32') {
      command = 'irm https://claude.ai/install.ps1 | iex';
    } else {
      command = 'curl -fsSL https://claude.ai/install.sh | sh';
    }

    exec(command, { shell }, (error: Error | null, _stdout: string, stderr: string) => {
      ctx.postMessage({
        type: 'installComplete',
        data: { success: !error, error: error ? (stderr || error.message) : undefined },
      });
    });
  });
};

const handleSaveInputText: MessageHandler = (msg, ctx) => { ctx.stateManager.draftMessage = msg.text as string; };

const handleOpenFile: MessageHandler = (msg) => {
  const uri = vscode.Uri.file(msg.filePath as string);
  const line = msg.line as number | undefined;
  vscode.workspace.openTextDocument(uri).then((doc) => {
    const opts: vscode.TextDocumentShowOptions = { preview: true };
    if (line && line > 0) {
      const pos = new vscode.Position(line - 1, 0);
      opts.selection = new vscode.Selection(pos, pos);
    }
    vscode.window.showTextDocument(doc, opts);
  });
};

const handleOpenExternal: MessageHandler = (msg) => { void vscode.env.openExternal(vscode.Uri.parse(msg.url as string)); };

const handleOpenMarkdownArtifact: MessageHandler = async (msg) => {
  await MarkdownContentProvider.openMarkdown(msg.content as string, (msg.title as string) || 'Claude Output');
};

const handleGetConversationList: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
};

const handleLoadConversation: MessageHandler = async (msg, ctx) => {
  const filename = msg.filename as string;
  const conversation = await ctx.conversationService.loadConversation(filename);
  if (!conversation) {
    ctx.postMessage({ type: 'error', data: t('error.loadConversation') });
    return;
  }
  // Generate a meaningful title from conversation summary or first message
  const summaryTitle = (() => {
    // Try to get summary from the index first
    const list = ctx.conversationService.getConversationList();
    const entry = list.find(e => e.sessionId === conversation.sessionId);
    if (entry?.summary) return entry.summary.slice(0, 50);
    // Fallback: first user message
    const first = conversation.messages.find(m => m.messageType === 'userInput');
    if (!first) return 'Claude Code ChatUI';
    const text = typeof first.data === 'string' ? first.data : (first.data && typeof first.data === 'object' && 'text' in first.data ? String((first.data as Record<string, unknown>).text) : '');
    return text.slice(0, 40) || 'Claude Code ChatUI';
  })();
  ctx.panelManager?.createNewPanel(undefined, false, {
    title: summaryTitle,
    initialConversation: conversation.messages,
    sessionId: conversation.sessionId,
    totalCost: conversation.totalCost,
  });
};

const handleGetSettings: MessageHandler = (_msg, ctx) => {
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { effortLevel: settings.effortLevel, yoloMode: settings.yoloMode, selectedModel: ctx.stateManager.selectedModel } });
};

const handleUpdateSettings: MessageHandler = (msg, ctx) => {
  void ctx.settingsManager.updateSettings(msg.settings as Record<string, unknown>);
};

const handleOpenLoginTerminal: MessageHandler = () => {
  const terminal = vscode.window.createTerminal({ name: 'Claude: Login' });
  terminal.sendText('claude /login');
  terminal.show();
};

const handleLoadMCPServers: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'mcpServers', data: ctx.mcpService.loadServers() });
};

const handleSaveMCPServer: MessageHandler = async (msg, ctx) => {
  try {
    await ctx.mcpService.saveServer(msg.name as string, msg.config as MCPServerConfig);
    ctx.postMessage({ type: 'mcpServerSaved', data: { name: msg.name } });
  } catch {
    ctx.postMessage({ type: 'mcpServerError', data: { error: 'Failed to save MCP server' } });
  }
};

const handleDeleteMCPServer: MessageHandler = async (msg, ctx) => {
  const name = msg.name as string;
  if (PROTECTED_MCP_SERVERS.includes(name)) {
    ctx.postMessage({ type: 'mcpServerError', data: { error: `"${name}" is a built-in server and cannot be deleted` } });
    return;
  }
  if (await ctx.mcpService.deleteServer(name)) {
    ctx.postMessage({ type: 'mcpServerDeleted', data: { name } });
  } else {
    ctx.postMessage({ type: 'mcpServerError', data: { error: `Server "${name}" not found` } });
  }
};

const handleRefreshUsage: MessageHandler = (_msg, ctx) => { void ctx.usageService.fetchUsageData(); };

const handleSearchConversations: MessageHandler = (msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.searchConversations(msg.query as string) });
};

const handleOpenCCUsageTerminal: MessageHandler = (_msg, ctx) => {
  const subscriptionType = ctx.claudeService.subscriptionType;
  const isPlan = subscriptionType === 'pro' || subscriptionType === 'max';
  const command = isPlan ? 'npx -y ccusage blocks --live' : 'npx -y ccusage blocks --recent --order desc';
  const terminal = vscode.window.createTerminal({ name: 'ccusage' });
  terminal.sendText(command);
  terminal.show();
};

const handleResolveDroppedFile: MessageHandler = (_msg, ctx) => {
  const uriStr = _msg.uri as string;
  if (!uriStr) return;
  try {
    const uri = vscode.Uri.parse(uriStr);
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const absPath = workspaceRoot ? path.join(workspaceRoot, relativePath) : uri.fsPath;
    // Expand folders: attach all entries (1 level deep)
    if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
      const entries = fs.readdirSync(absPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath + '/' + entry.name } });
      }
      return;
    }
    ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
  } catch { /* ignore invalid URIs */ }
};

const handleGetClipboard: MessageHandler = async (_msg, ctx) => {
  try {
    const text = await vscode.env.clipboard.readText();
    ctx.postMessage({ type: 'clipboardContent', data: { text } });
  } catch {
    ctx.postMessage({ type: 'clipboardContent', data: { text: '' } });
  }
};

function checkCliAvailable(ctx: MessageHandlerContext): void {
  const { exec } = require('child_process') as typeof import('child_process');
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  exec('claude --version', { shell, timeout: 5000 }, (error: Error | null) => {
    if (error) ctx.postMessage({ type: 'showInstallModal' });
  });
}


const messageHandlers: Record<string, MessageHandler> = {
  sendMessage: handleSendMessage,
  stopRequest: handleStopRequest,
  ready: handleReady,
  permissionResponse: handlePermissionResponse,
  selectModel: handleSelectModel,
  openModelTerminal: handleOpenModelTerminal,
  runInstallCommand: handleRunInstallCommand,
  saveInputText: handleSaveInputText,
  openFile: handleOpenFile,
  openExternal: handleOpenExternal,
  openMarkdownArtifact: handleOpenMarkdownArtifact,
  getConversationList: handleGetConversationList,
  loadConversation: handleLoadConversation,
  getSettings: handleGetSettings,
  updateSettings: handleUpdateSettings,
  openLoginTerminal: handleOpenLoginTerminal,
  loadMCPServers: handleLoadMCPServers,
  saveMCPServer: handleSaveMCPServer,
  deleteMCPServer: handleDeleteMCPServer,
  refreshUsage: handleRefreshUsage,
  searchConversations: handleSearchConversations,
  openCCUsageTerminal: handleOpenCCUsageTerminal,
  getClipboardText: handleGetClipboard,
  resolveDroppedFile: handleResolveDroppedFile,
  rewindToMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.rewindToMessage(msg.userInputIndex as number),
  showWarning: (msg: WebviewMessage) => { vscode.window.showWarningMessage(msg.data as string); },
  showInfo: (msg: WebviewMessage) => { vscode.window.showInformationMessage(msg.data as string); },
};

export function handleWebviewMessage(msg: WebviewMessage, ctx: MessageHandlerContext): void {
  const handler = messageHandlers[msg.type];
  if (handler) void handler(msg, ctx);
}
