import * as vscode from 'vscode';
import { ClaudeService } from './claude';
import { ConversationService, MCPService, BackupService } from './storage';
import { PermissionService } from './claude';
import {
  ClaudeMessageProcessor,
  SessionStateManager,
  SettingsManager,
  type MessagePoster,
} from './handlers';
import { createModuleLogger } from '../shared/logger';
import type { ClaudeMessage, ConversationMessage } from '../shared/types';
import type { PanelManager } from './panelManager';

const log = createModuleLogger('ChatController');

export class ChatController {
  private _saveTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly _backupService: BackupService;

  readonly settingsManager = new SettingsManager();
  readonly messageProcessor: ClaudeMessageProcessor;
  readonly stateManager: SessionStateManager;

  constructor(
    private readonly _context: vscode.ExtensionContext,
    private readonly _claudeService: ClaudeService,
    private readonly _conversationService: ConversationService,
    private readonly _mcpService: MCPService,
    private readonly _permissionService: PermissionService,
    private readonly _postMessage: (msg: Record<string, unknown>) => void,
    private readonly _panelManager?: PanelManager,
  ) {
    this.stateManager = new SessionStateManager();
    this.stateManager.selectedModel = this._context.workspaceState.get('claude.selectedModel', 'default');
    this._backupService = new BackupService(_context);
    void this._backupService.initialize();

    const poster: MessagePoster = {
      postMessage: (msg) => this._postMessage(msg),
      sendAndSaveMessage: (msg) => this._postMessage(msg),
    };

    this.messageProcessor = new ClaudeMessageProcessor(poster, this.stateManager, {
      onSessionIdReceived: (sessionId) => {
        this._claudeService.setSessionId(sessionId);
      },
      onProcessingComplete: (result) => { this._debouncedSaveConversation(result.sessionId); },
    });

    this._setupClaudeServiceHandlers();
  }

  get sessionId(): string | undefined { return this._claudeService.sessionId; }

  // ==================== Session Management ====================

  async newSession(): Promise<void> {
    if (this._panelManager) {
      this._panelManager.createNewPanel();
      return;
    }
    this._flushSave();
    if (this.stateManager.isProcessing) {
      await this._claudeService.stopProcess();
    }
    this.messageProcessor.resetSession();
    this.stateManager.resetSession();
    this._claudeService.setSessionId(undefined);
    this._postMessage({ type: 'sessionCleared' });
  }

  async loadConversation(filename: string): Promise<void> {
    const conversation = this._conversationService.loadConversation(filename);
    if (!conversation) {
      this._postMessage({ type: 'error', data: 'Failed to load conversation' });
      return;
    }

    this._flushSave();
    this.messageProcessor.resetSession();
    this.stateManager.resetSession();

    this._claudeService.setSessionId(conversation.sessionId);
    this.stateManager.restoreFromConversation({
      totalCost: conversation.totalCost,
      totalTokens: conversation.totalTokens,
    });

    for (const msg of conversation.messages) {
      this.messageProcessor.currentConversation.push(msg);
    }

    this._replayConversation();
  }

  loadConversationData(
    messages: ConversationMessage[],
    sessionId?: string,
    totalCost?: number,
  ): void {
    this.messageProcessor.resetSession();
    this.stateManager.resetSession();

    this._claudeService.setSessionId(sessionId);
    if (totalCost) this.stateManager.totalCost = totalCost;

    for (const msg of messages) {
      this.messageProcessor.currentConversation.push({ ...msg });
    }
  }

  // ==================== Message Handling ====================

  editMessage(userInputIndex: number, newText: string): void {
    if (this.stateManager.isProcessing) return;

    const conversation = this.messageProcessor.currentConversation;
    const pos = this._findUserInputPosition(conversation, userInputIndex);
    if (pos === -1) return;

    if (pos > 0) {
      this.messageProcessor.truncateConversation(pos - 1);
    } else {
      this.messageProcessor.resetSession();
    }
    this._claudeService.setSessionId(undefined);
    this.stateManager.resetSession();
    this._replayConversation();
    this.handleSendMessage(newText);
  }

  regenerateResponse(): void {
    if (this.stateManager.isProcessing) return;

    const conversation = this.messageProcessor.currentConversation;
    let lastUserPos = -1;
    let lastUserText = '';
    for (let i = conversation.length - 1; i >= 0; i--) {
      if (conversation[i].messageType === 'userInput') {
        lastUserPos = i;
        const data = conversation[i].data as { text: string } | string;
        lastUserText = typeof data === 'string' ? data : data.text;
        break;
      }
    }
    if (lastUserPos === -1 || !lastUserText) return;

    if (lastUserPos > 0) {
      this.messageProcessor.truncateConversation(lastUserPos - 1);
    } else {
      this.messageProcessor.resetSession();
    }
    this._claudeService.setSessionId(undefined);
    this.stateManager.resetSession();
    this._replayConversation();
    this.handleSendMessage(lastUserText);
  }

  handleSendMessage(text: string, thinkingMode?: boolean, images?: string[]): void {
    if (this.stateManager.isProcessing) return;

    log.info('Sending message', { thinkingMode, hasImages: !!images?.length });

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

    this.stateManager.isProcessing = true;
    this.stateManager.draftMessage = '';

    const userInputData = { text, images };
    this.messageProcessor.currentConversation.push({
      timestamp: new Date().toISOString(),
      messageType: 'userInput',
      data: userInputData,
    });
    this._postMessage({ type: 'userInput', data: userInputData });
    this._postMessage({ type: 'setProcessing', data: { isProcessing: true } });
    this._postMessage({ type: 'loading', data: 'Claude is working...' });

    // Create backup commit before Claude makes changes
    void this._backupService.createBackup(text).then((commit) => {
      if (commit) {
        this._postMessage({ type: 'backupCreated', data: commit });
      }
    }).catch(() => { /* backup failure should not block sending */ });

    // Build actual message with thinking prefix if enabled
    let actualMessage = text;
    if (thinkingMode) {
      const intensity = this.settingsManager.getCurrentSettings(this.stateManager.selectedModel).thinkingIntensity;
      const PROMPTS: Record<string, string> = {
        'think': 'THINK',
        'think-hard': 'THINK HARD',
        'think-harder': 'THINK HARDER',
        'ultrathink': 'ULTRATHINK',
      };
      const prompt = PROMPTS[intensity] || 'THINK';
      actualMessage = `${prompt} THROUGH THIS STEP BY STEP: \n${text}`;
    }

    const yoloMode = this.settingsManager.isYoloModeEnabled();
    const mcpServers = this._mcpService.loadServers();
    const mcpConfigPath = Object.keys(mcpServers).length > 0 ? this._mcpService.configPath : undefined;

    void this._claudeService.sendMessage(actualMessage, {
      cwd, yoloMode,
      model: this.stateManager.selectedModel !== 'default' ? this.stateManager.selectedModel : undefined,
      mcpConfigPath, images,
    });
  }

  async restoreCommit(commitSha: string): Promise<void> {
    const result = await this._backupService.restore(commitSha);
    if (result.success) {
      vscode.window.showInformationMessage(result.message);
      this._postMessage({ type: 'restoreSuccess', data: { message: result.message, commitSha } });
    } else {
      vscode.window.showErrorMessage(result.message);
      this._postMessage({ type: 'error', data: result.message });
    }
  }

  // ==================== Cleanup ====================

  flushSave(): void {
    this._flushSave();
  }

  stopIfProcessing(): void {
    if (this.stateManager.isProcessing) {
      void this._claudeService.stopProcess();
    }
  }

  // ==================== Private ====================

  private _setupClaudeServiceHandlers(): void {
    this._claudeService.onMessage((message: ClaudeMessage) => {
      void this.messageProcessor.processMessage(message);
    });

    this._claudeService.onProcessEnd(() => {
      this.stateManager.isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });
    });

    this._claudeService.onError((error) => {
      log.error('Claude service error', { message: error });
      this.stateManager.isProcessing = false;
      this._postMessage({ type: 'clearLoading' });
      this._postMessage({ type: 'setProcessing', data: { isProcessing: false } });

      if (error.includes('ENOENT') || error.includes('command not found')) {
        this._postMessage({ type: 'showInstallModal' });
      } else if (error.includes('authentication') || error.includes('login') || error.includes('API key') || error.includes('unauthorized') || error.includes('401')) {
        this._postMessage({ type: 'showLoginRequired', data: { message: error } });
      } else {
        this._postMessage({ type: 'error', data: error });
        if (error.includes('permission') || error.includes('denied')) {
          if (!this.settingsManager.isYoloModeEnabled()) {
            this._postMessage({ type: 'error', data: 'Tip: Enable YOLO mode in Settings to skip permission prompts.' });
          }
        }
      }
    });

    this._claudeService.onRateLimitUpdate((data) => {
      this._postMessage({ type: 'rateLimitUpdate', data });
    });

    this._claudeService.onPermissionRequest((request) => {
      const isInteractiveTool = request.toolName === 'AskUserQuestion';

      if (this.settingsManager.isYoloModeEnabled() && !isInteractiveTool) {
        log.info('YOLO mode: auto-approving permission', { tool: request.toolName });
        this._claudeService.sendPermissionResponse(request.requestId, true);
        return;
      }

      this._postMessage({
        type: 'permissionRequest',
        data: {
          id: request.requestId,
          tool: request.toolName,
          input: request.input,
          pattern: request.pattern,
          suggestions: request.suggestions,
          decisionReason: request.decisionReason,
          blockedPath: request.blockedPath,
          status: 'pending',
        },
      });
    });
  }

  private _replayConversation(): void {
    const conversation = this.messageProcessor.currentConversation;
    if (conversation.length > 0) {
      const replayMessages = conversation.map((msg) => ({ type: msg.messageType, data: msg.data }));
      this._postMessage({
        type: 'batchReplay',
        data: {
          messages: replayMessages,
          sessionId: this._claudeService.sessionId,
          totalCost: this.stateManager.totalCost,
          isProcessing: this.stateManager.isProcessing,
        },
      });
    } else {
      this._postMessage({ type: 'sessionCleared' });
    }
  }

  private _debouncedSaveConversation(sessionId?: string): void {
    if (this._saveTimer) clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this._saveTimer = undefined;
      this._saveConversation(sessionId);
    }, 2000);
  }

  private _flushSave(): void {
    if (this._saveTimer) {
      clearTimeout(this._saveTimer);
      this._saveTimer = undefined;
    }
    this._saveConversation(this._claudeService.sessionId);
  }

  private _saveConversation(sessionId?: string): void {
    if (!sessionId) return;
    const conversation = this.messageProcessor.currentConversation;
    if (conversation.length === 0) return;

    void this._conversationService.saveConversation(
      sessionId, conversation,
      this.stateManager.totalCost,
      this.stateManager.totalTokensInput,
      this.stateManager.totalTokensOutput,
    );
  }

  private _findUserInputPosition(conversation: ConversationMessage[], userInputIndex: number): number {
    let count = -1;
    for (let i = 0; i < conversation.length; i++) {
      if (conversation[i].messageType === 'userInput') {
        count++;
        if (count === userInputIndex) return i;
      }
    }
    return -1;
  }
}
