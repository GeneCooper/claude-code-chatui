import * as vscode from 'vscode';
import type { MessageHandler } from './types';
import { str } from './helpers';

export const handleSelectModel: MessageHandler = (msg, ctx) => {
  const model = str(msg.model);
  ctx.stateManager.selectedModel = model;
  void ctx.extensionContext.workspaceState.update('claude.selectedModel', model);
};

export const handleOpenModelTerminal: MessageHandler = () => {
  const terminal = vscode.window.createTerminal({ name: 'Claude Model Selection', location: { viewColumn: vscode.ViewColumn.One } });
  terminal.sendText('claude /model');
  terminal.show();
};

export const handleGetSettings: MessageHandler = (_msg, ctx) => {
  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { thinkingIntensity: settings.thinkingIntensity, yoloMode: settings.yoloMode } });
};

export const handleUpdateSettings: MessageHandler = (msg, ctx) => {
  if (typeof msg.settings === 'object' && msg.settings !== null) {
    void ctx.settingsManager.updateSettings(msg.settings as Record<string, unknown>);
  }
};
