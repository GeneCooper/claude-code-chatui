// ============================================================================
// SettingsManager
// ============================================================================

import * as vscode from 'vscode';

interface WebviewSettings {
  selectedModel: string;
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
  THINKING_INTENSITY: 'high',
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
      thinkingIntensity: config.get<string>(CONFIG_KEYS.THINKING_INTENSITY, DEFAULTS.THINKING_INTENSITY),
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
    if (typeof settings.thinkingIntensity === 'string') {
      await config.update(CONFIG_KEYS.THINKING_INTENSITY, settings.thinkingIntensity, vscode.ConfigurationTarget.Global);
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
