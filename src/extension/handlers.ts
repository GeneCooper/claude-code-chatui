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
import { FILE_EDIT_TOOLS, FILE_SEARCH_EXCLUDES, HIDDEN_RESULT_TOOLS } from '../shared/constants';
import type { ClaudeService } from './claude';
import type { PermissionService } from './claude';
import type { ConversationService, BackupService, UsageService, MCPService } from './storage';

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

    if (toolName === 'TodoWrite' && input.todos) {
      toolInput = '\nTodo List Update:';
      for (const todo of input.todos as Array<{ content: string; status: string; priority?: string }>) {
        const icon = todo.status === 'completed' ? '✅' : todo.status === 'in_progress' ? '🔄' : '⏳';
        toolInput += `\n${icon} ${todo.content}`;
      }
      this._poster.postMessage({ type: 'todosUpdate', data: { todos: input.todos } });
    }

    if (FILE_EDIT_TOOLS.includes(toolName) && input.file_path) {
      try {
        const uri = vscode.Uri.file(input.file_path as string);
        const data = await vscode.workspace.fs.readFile(uri);
        fileContentBefore = Buffer.from(data).toString('utf8');
      } catch {
        fileContentBefore = '';
      }
    }

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
      toolInfo, toolInput, rawInput: input, toolName,
      fileContentBefore, startLine, startLines,
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
      const lastToolUse = this._currentConversation[this._currentConversation.length - 1];
      const toolData = lastToolUse?.data as ToolUseData | undefined;
      const toolName = toolData?.toolName;
      const rawInput = toolData?.rawInput;

      let fileContentAfter: string | undefined;
      if (FILE_EDIT_TOOLS.includes(toolName || '') && rawInput?.file_path && !isError) {
        try {
          const uri = vscode.Uri.file(rawInput.file_path as string);
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
    }
  }

  private _handleResultMessage(msg: ClaudeMessage): void {
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
        this._poster.postMessage({ type: 'error', data: 'Session expired. Send your message again to start a new conversation.' });
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
        totalTokensInput: this._stateManager.totalTokensInput,
        totalTokensOutput: this._stateManager.totalTokensOutput,
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
  thinkingMode: boolean;
  thinkingIntensity: string;
  showThinkingProcess: boolean;
  yoloMode: boolean;
  autoApprovePatterns: string[];
  claudeExecutable: string;
  maxHistorySize: number;
  streamResponses: boolean;
  showTimestamps: boolean;
  codeBlockTheme: string;
  fontSize: number;
  compactMode: boolean;
  showAvatars: boolean;
  includeFileContext: boolean;
  includeWorkspaceInfo: boolean;
  maxContextLines: number;
}

const CONFIG_KEYS = {
  CLAUDE_MODEL: 'claude.model',
  CLAUDE_EXECUTABLE: 'claude.executable',
  THINKING_ENABLED: 'thinking.enabled',
  THINKING_INTENSITY: 'thinking.intensity',
  THINKING_SHOW_PROCESS: 'thinking.showProcess',
  PERMISSIONS_YOLO_MODE: 'permissions.yoloMode',
  PERMISSIONS_AUTO_APPROVE: 'permissions.autoApprove',
  CHAT_MAX_HISTORY_SIZE: 'chat.maxHistorySize',
  CHAT_STREAM_RESPONSES: 'chat.streamResponses',
  CHAT_SHOW_TIMESTAMPS: 'chat.showTimestamps',
  CHAT_CODE_BLOCK_THEME: 'chat.codeBlockTheme',
  UI_FONT_SIZE: 'ui.fontSize',
  UI_COMPACT_MODE: 'ui.compactMode',
  UI_SHOW_AVATARS: 'ui.showAvatars',
  CONTEXT_INCLUDE_FILE: 'context.includeFileContext',
  CONTEXT_INCLUDE_WORKSPACE: 'context.includeWorkspaceInfo',
  CONTEXT_MAX_LINES: 'context.maxContextLines',
} as const;

const DEFAULTS = {
  CLAUDE_MODEL: 'claude-sonnet-4-5-20250929',
  CLAUDE_EXECUTABLE: 'claude',
  THINKING_ENABLED: true,
  THINKING_INTENSITY: 'fast',
  THINKING_SHOW_PROCESS: true,
  YOLO_MODE: true,
  AUTO_APPROVE_PATTERNS: [] as string[],
  MAX_HISTORY_SIZE: 100,
  STREAM_RESPONSES: true,
  SHOW_TIMESTAMPS: true,
  CODE_BLOCK_THEME: 'auto',
  FONT_SIZE: 14,
  COMPACT_MODE: false,
  SHOW_AVATARS: true,
  INCLUDE_FILE_CONTEXT: true,
  INCLUDE_WORKSPACE_INFO: true,
  MAX_CONTEXT_LINES: 500,
} as const;

export class SettingsManager {
  private readonly _configSection = 'claudeCodeChatUI';

  private _getConfig(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(this._configSection);
  }

  getCurrentSettings(selectedModel: string): WebviewSettings {
    const config = this._getConfig();
    return {
      selectedModel,
      thinkingMode: config.get<boolean>(CONFIG_KEYS.THINKING_ENABLED, DEFAULTS.THINKING_ENABLED),
      thinkingIntensity: ['fast', 'deep'].includes(config.get<string>(CONFIG_KEYS.THINKING_INTENSITY, DEFAULTS.THINKING_INTENSITY))
        ? config.get<string>(CONFIG_KEYS.THINKING_INTENSITY, DEFAULTS.THINKING_INTENSITY)
        : DEFAULTS.THINKING_INTENSITY,
      showThinkingProcess: config.get<boolean>(CONFIG_KEYS.THINKING_SHOW_PROCESS, DEFAULTS.THINKING_SHOW_PROCESS),
      yoloMode: config.get<boolean>(CONFIG_KEYS.PERMISSIONS_YOLO_MODE, DEFAULTS.YOLO_MODE),
      autoApprovePatterns: config.get<string[]>(CONFIG_KEYS.PERMISSIONS_AUTO_APPROVE, DEFAULTS.AUTO_APPROVE_PATTERNS),
      claudeExecutable: config.get<string>(CONFIG_KEYS.CLAUDE_EXECUTABLE, DEFAULTS.CLAUDE_EXECUTABLE),
      maxHistorySize: config.get<number>(CONFIG_KEYS.CHAT_MAX_HISTORY_SIZE, DEFAULTS.MAX_HISTORY_SIZE),
      streamResponses: config.get<boolean>(CONFIG_KEYS.CHAT_STREAM_RESPONSES, DEFAULTS.STREAM_RESPONSES),
      showTimestamps: config.get<boolean>(CONFIG_KEYS.CHAT_SHOW_TIMESTAMPS, DEFAULTS.SHOW_TIMESTAMPS),
      codeBlockTheme: config.get<string>(CONFIG_KEYS.CHAT_CODE_BLOCK_THEME, DEFAULTS.CODE_BLOCK_THEME),
      fontSize: config.get<number>(CONFIG_KEYS.UI_FONT_SIZE, DEFAULTS.FONT_SIZE),
      compactMode: config.get<boolean>(CONFIG_KEYS.UI_COMPACT_MODE, DEFAULTS.COMPACT_MODE),
      showAvatars: config.get<boolean>(CONFIG_KEYS.UI_SHOW_AVATARS, DEFAULTS.SHOW_AVATARS),
      includeFileContext: config.get<boolean>(CONFIG_KEYS.CONTEXT_INCLUDE_FILE, DEFAULTS.INCLUDE_FILE_CONTEXT),
      includeWorkspaceInfo: config.get<boolean>(CONFIG_KEYS.CONTEXT_INCLUDE_WORKSPACE, DEFAULTS.INCLUDE_WORKSPACE_INFO),
      maxContextLines: config.get<number>(CONFIG_KEYS.CONTEXT_MAX_LINES, DEFAULTS.MAX_CONTEXT_LINES),
    };
  }

  getDefaultModel(): string {
    return this._getConfig().get<string>(CONFIG_KEYS.CLAUDE_MODEL, DEFAULTS.CLAUDE_MODEL);
  }

  async updateSettings(settings: Record<string, unknown>): Promise<void> {
    const config = this._getConfig();
    if (!settings || typeof settings !== 'object') return;

    // Thinking settings
    if (typeof settings.thinkingMode === 'boolean') {
      await config.update(CONFIG_KEYS.THINKING_ENABLED, settings.thinkingMode, vscode.ConfigurationTarget.Global);
    }
    const intensityValue = settings.thinkingIntensity ?? settings['thinking.intensity'];
    if (typeof intensityValue === 'string') {
      await config.update(CONFIG_KEYS.THINKING_INTENSITY, intensityValue, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.showThinkingProcess === 'boolean') {
      await config.update(CONFIG_KEYS.THINKING_SHOW_PROCESS, settings.showThinkingProcess, vscode.ConfigurationTarget.Global);
    }

    // Permission settings
    if (typeof settings.yoloMode === 'boolean') {
      await config.update(CONFIG_KEYS.PERMISSIONS_YOLO_MODE, settings.yoloMode, vscode.ConfigurationTarget.Global);
    }
    if (Array.isArray(settings.autoApprovePatterns)) {
      await config.update(CONFIG_KEYS.PERMISSIONS_AUTO_APPROVE, settings.autoApprovePatterns, vscode.ConfigurationTarget.Global);
    }

    // Claude executable
    if (typeof settings.claudeExecutable === 'string') {
      await config.update(CONFIG_KEYS.CLAUDE_EXECUTABLE, settings.claudeExecutable, vscode.ConfigurationTarget.Global);
    }

    // Chat settings
    if (typeof settings.maxHistorySize === 'number') {
      await config.update(CONFIG_KEYS.CHAT_MAX_HISTORY_SIZE, settings.maxHistorySize, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.streamResponses === 'boolean') {
      await config.update(CONFIG_KEYS.CHAT_STREAM_RESPONSES, settings.streamResponses, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.showTimestamps === 'boolean') {
      await config.update(CONFIG_KEYS.CHAT_SHOW_TIMESTAMPS, settings.showTimestamps, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.codeBlockTheme === 'string') {
      await config.update(CONFIG_KEYS.CHAT_CODE_BLOCK_THEME, settings.codeBlockTheme, vscode.ConfigurationTarget.Global);
    }

    // UI settings
    if (typeof settings.fontSize === 'number') {
      await config.update(CONFIG_KEYS.UI_FONT_SIZE, settings.fontSize, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.compactMode === 'boolean') {
      await config.update(CONFIG_KEYS.UI_COMPACT_MODE, settings.compactMode, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.showAvatars === 'boolean') {
      await config.update(CONFIG_KEYS.UI_SHOW_AVATARS, settings.showAvatars, vscode.ConfigurationTarget.Global);
    }

    // Context settings
    if (typeof settings.includeFileContext === 'boolean') {
      await config.update(CONFIG_KEYS.CONTEXT_INCLUDE_FILE, settings.includeFileContext, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.includeWorkspaceInfo === 'boolean') {
      await config.update(CONFIG_KEYS.CONTEXT_INCLUDE_WORKSPACE, settings.includeWorkspaceInfo, vscode.ConfigurationTarget.Global);
    }
    if (typeof settings.maxContextLines === 'number') {
      await config.update(CONFIG_KEYS.CONTEXT_MAX_LINES, settings.maxContextLines, vscode.ConfigurationTarget.Global);
    }
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
  backupService: BackupService;
  usageService: UsageService;
  permissionService: PermissionService;
  stateManager: SessionStateManager;
  settingsManager: SettingsManager;
  messageProcessor: ClaudeMessageProcessor;
  extensionContext: vscode.ExtensionContext;
  postMessage(msg: Record<string, unknown>): void;
  newSession(): Promise<void>;
  loadConversation(filename: string): Promise<void>;
  handleSendMessage(text: string, planMode?: boolean, thinkingMode?: boolean, images?: string[]): void;
  panelManager?: PanelManager;
  rewindToMessage(userInputIndex: number): void;
  forkFromMessage(userInputIndex: number): void;
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
    msg.planMode as boolean | undefined,
    msg.thinkingMode as boolean | undefined,
    msg.images as string[] | undefined,
  );
};

const handleNewSession: MessageHandler = (_msg, ctx) => { void ctx.newSession(); };
const handleStopRequest: MessageHandler = (_msg, ctx) => { void ctx.claudeService.stopProcess(); };

const handleReady: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'ready', data: 'Extension ready' });
  ctx.postMessage({
    type: 'platformInfo',
    data: { platform: process.platform, isWindows: process.platform === 'win32' },
  });
  checkCliAvailable(ctx);

  // Send current settings so webview has correct initial state
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { thinkingIntensity: settings.thinkingIntensity, yoloMode: settings.yoloMode } });

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
  vscode.workspace.openTextDocument(uri).then((doc) => { vscode.window.showTextDocument(doc, { preview: true }); });
};

const handleOpenExternal: MessageHandler = (msg) => { void vscode.env.openExternal(vscode.Uri.parse(msg.url as string)); };

const handleOpenDiff: MessageHandler = async (msg) => {
  // Force side-by-side diff rendering
  const diffConfig = vscode.workspace.getConfiguration('diffEditor');
  if (!diffConfig.get<boolean>('renderSideBySide', true)) {
    await diffConfig.update('renderSideBySide', true, vscode.ConfigurationTarget.Global);
  }
  await DiffContentProvider.openDiff(msg.oldContent as string, msg.newContent as string, msg.filePath as string);
};

const handleGetConversationList: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
};

const handleLoadConversation: MessageHandler = (msg, ctx) => { void ctx.loadConversation(msg.filename as string); };

const handleGetSettings: MessageHandler = (_msg, ctx) => {
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { thinkingIntensity: settings.thinkingIntensity, yoloMode: settings.yoloMode } });
};

const handleUpdateSettings: MessageHandler = (msg, ctx) => {
  void ctx.settingsManager.updateSettings(msg.settings as Record<string, unknown>);
};

const handleExecuteSlashCommand: MessageHandler = (msg, ctx) => {
  const command = msg.command as string;
  if (command === 'compact') { ctx.handleSendMessage('/compact'); return; }
  if (command === 'clear') { void ctx.newSession(); return; }

  const sessionId = ctx.claudeService.sessionId;
  const args = sessionId ? `/${command} --resume ${sessionId}` : `/${command}`;
  const terminal = vscode.window.createTerminal({ name: `Claude: /${command}` });
  terminal.sendText(`claude ${args}`);
  terminal.show();
};

const handleGetWorkspaceFiles: MessageHandler = async (msg, ctx) => {
  const searchTerm = msg.searchTerm as string | undefined;
  try {
    const uris = await vscode.workspace.findFiles('**/*', FILE_SEARCH_EXCLUDES, 500);
    let files = uris.map((uri) => {
      const relativePath = vscode.workspace.asRelativePath(uri, false);
      const name = relativePath.split(/[\\/]/).pop() || '';
      return { name, path: relativePath, fsPath: uri.fsPath };
    });

    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      files = files.filter((f) => f.name.toLowerCase().includes(lower) || f.path.toLowerCase().includes(lower));
    }

    files.sort((a, b) => a.path.localeCompare(b.path));
    files = files.slice(0, 50);
    ctx.postMessage({ type: 'workspaceFiles', data: files });
  } catch {
    ctx.postMessage({ type: 'workspaceFiles', data: [] });
  }
};

const handleLoadMCPServers: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'mcpServers', data: ctx.mcpService.loadServers() });
};

const handleSaveMCPServer: MessageHandler = (msg, ctx) => {
  try {
    ctx.mcpService.saveServer(msg.name as string, msg.config as MCPServerConfig);
    ctx.postMessage({ type: 'mcpServerSaved', data: { name: msg.name } });
  } catch {
    ctx.postMessage({ type: 'mcpServerError', data: { error: 'Failed to save MCP server' } });
  }
};

const handleDeleteMCPServer: MessageHandler = (msg, ctx) => {
  if (ctx.mcpService.deleteServer(msg.name as string)) {
    ctx.postMessage({ type: 'mcpServerDeleted', data: { name: msg.name } });
  } else {
    ctx.postMessage({ type: 'mcpServerError', data: { error: `Server "${msg.name}" not found` } });
  }
};

const handleCreateBackup: MessageHandler = async (msg, ctx) => {
  const commit = await ctx.backupService.createCheckpoint(msg.message as string);
  if (commit) ctx.postMessage({ type: 'restorePoint', data: commit });
};

const handleRestoreBackup: MessageHandler = async (msg, ctx) => {
  const success = await ctx.backupService.restoreToCommit(msg.commitSha as string);
  if (success) {
    ctx.postMessage({ type: 'output', data: 'Workspace restored to checkpoint successfully.' });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to restore checkpoint.' });
  }
};

const handleRefreshUsage: MessageHandler = (_msg, ctx) => { void ctx.usageService.fetchUsageData(); };

const handleDeleteConversation: MessageHandler = async (msg, ctx) => {
  const success = await ctx.conversationService.deleteConversation(msg.filename as string);
  if (success) {
    ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.getConversationList() });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to delete conversation' });
  }
};

const handleSearchConversations: MessageHandler = (msg, ctx) => {
  ctx.postMessage({ type: 'conversationList', data: ctx.conversationService.searchConversations(msg.query as string) });
};

const handleExportConversation: MessageHandler = (msg, ctx) => {
  const json = ctx.conversationService.exportConversation(msg.filename as string);
  if (json) {
    ctx.postMessage({ type: 'conversationExport', data: { filename: msg.filename, content: json } });
  } else {
    ctx.postMessage({ type: 'error', data: 'Failed to export conversation' });
  }
};

const handleGetPermissions: MessageHandler = async (_msg, ctx) => {
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

const handleAddPermission: MessageHandler = async (msg, ctx) => {
  await ctx.permissionService.addPermission(msg.toolName as string, msg.pattern as string);
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

const handleRemovePermission: MessageHandler = async (msg, ctx) => {
  await ctx.permissionService.removePermission(msg.toolName as string, msg.pattern as string);
  ctx.postMessage({ type: 'permissions', data: await ctx.permissionService.getPermissions() });
};

const handleRevertFile: MessageHandler = async (msg, ctx) => {
  try {
    const uri = vscode.Uri.file(msg.filePath as string);
    const content = new TextEncoder().encode(msg.oldContent as string);
    await vscode.workspace.fs.writeFile(uri, content);
    const fileName = (msg.filePath as string).split(/[\\/]/).pop() || 'file';
    vscode.window.showInformationMessage(`Reverted: ${fileName}`);
    ctx.postMessage({ type: 'fileReverted', data: { filePath: msg.filePath, success: true } });
  } catch {
    ctx.postMessage({ type: 'error', data: 'Failed to revert file' });
  }
};

const handleOpenCCUsageTerminal: MessageHandler = (_msg, ctx) => {
  const subscriptionType = ctx.claudeService.subscriptionType;
  const isPlan = subscriptionType === 'pro' || subscriptionType === 'max';
  const command = isPlan ? 'npx -y ccusage blocks --live' : 'npx -y ccusage blocks --recent --order desc';
  const terminal = vscode.window.createTerminal({ name: 'ccusage' });
  terminal.sendText(command);
  terminal.show();
};

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB

const handlePickImageFile: MessageHandler = async (_msg, ctx) => {
  const result = await vscode.window.showOpenDialog({
    canSelectMany: false,
    openLabel: 'Select Image',
    filters: { Images: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] },
  });
  if (!result || result.length === 0) return;
  try {
    const data = await vscode.workspace.fs.readFile(result[0]);
    if (data.byteLength > MAX_IMAGE_SIZE) {
      const sizeMB = (data.byteLength / 1024 / 1024).toFixed(1);
      vscode.window.showWarningMessage(`图片太大（${sizeMB}MB），最大支持 5MB。请压缩后重试。`);
      return;
    }
    const base64 = Buffer.from(data).toString('base64');
    const ext = result[0].fsPath.split('.').pop()?.toLowerCase() || 'png';
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
    };
    const name = result[0].fsPath.split(/[\\/]/).pop() || 'image';
    ctx.postMessage({ type: 'imageFilePicked', data: { name, dataUrl: `data:${mimeMap[ext] || 'image/png'};base64,${base64}` } });
  } catch {
    ctx.postMessage({ type: 'error', data: 'Failed to read image file' });
  }
};

const handlePickWorkspaceFile: MessageHandler = async (_msg, ctx) => {
  const result = await vscode.window.showOpenDialog({
    canSelectMany: true,
    openLabel: 'Attach File',
    defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
  });
  if (!result || result.length === 0) return;
  for (const uri of result) {
    const relativePath = vscode.workspace.asRelativePath(uri, false);
    ctx.postMessage({ type: 'attachFileContext', data: { filePath: relativePath } });
  }
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

const handleCreateNewPanel: MessageHandler = (_msg, ctx) => { ctx.panelManager?.createNewPanel(); };

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
  createBackup: handleCreateBackup,
  restoreBackup: handleRestoreBackup,
  refreshUsage: handleRefreshUsage,
  deleteConversation: handleDeleteConversation,
  searchConversations: handleSearchConversations,
  exportConversation: handleExportConversation,
  getPermissions: handleGetPermissions,
  addPermission: handleAddPermission,
  removePermission: handleRemovePermission,
  revertFile: handleRevertFile,
  openCCUsageTerminal: handleOpenCCUsageTerminal,
  pickImageFile: handlePickImageFile,
  pickWorkspaceFile: handlePickWorkspaceFile,
  getClipboardText: handleGetClipboard,
  resolveDroppedFile: handleResolveDroppedFile,
  createNewPanel: handleCreateNewPanel,
  rewindToMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.rewindToMessage(msg.userInputIndex as number),
  forkFromMessage: (msg: WebviewMessage, ctx: MessageHandlerContext) => ctx.forkFromMessage(msg.userInputIndex as number),
  showWarning: (msg: WebviewMessage) => { vscode.window.showWarningMessage(msg.data as string); },
  showInfo: (msg: WebviewMessage) => { vscode.window.showInformationMessage(msg.data as string); },
};

export function handleWebviewMessage(msg: WebviewMessage, ctx: MessageHandlerContext): void {
  const handler = messageHandlers[msg.type];
  if (handler) void handler(msg, ctx);
}
