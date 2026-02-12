import type { MessageHandler } from './types';
import { str, optBool, optStr, optStrArr } from './helpers';

export const handleSendMessage: MessageHandler = (msg, ctx) => {
  if (typeof msg.model === 'string') {
    ctx.stateManager.selectedModel = msg.model;
    void ctx.extensionContext.workspaceState.update('claude.selectedModel', msg.model);
  }
  ctx.handleSendMessage(
    str(msg.text),
    optBool(msg.planMode),
    optStr(msg.effort),
    optStrArr(msg.images),
  );
};

export const handleNewSession: MessageHandler = (_msg, ctx) => { void ctx.newSession(); };
export const handleStopRequest: MessageHandler = (_msg, ctx) => { void ctx.claudeService.stopProcess(); };

export const handleReady: MessageHandler = (_msg, ctx) => {
  ctx.postMessage({ type: 'ready', data: 'Extension ready' });
  ctx.postMessage({
    type: 'platformInfo',
    data: { platform: process.platform, isWindows: process.platform === 'win32' },
  });
  checkCliCompatibility(ctx);

  const settings = ctx.settingsManager.getCurrentSettings(ctx.stateManager.selectedModel);
  ctx.postMessage({ type: 'settingsData', data: { thinkingIntensity: settings.thinkingIntensity, yoloMode: settings.yoloMode } });

  const conversation = ctx.messageProcessor.currentConversation;
  if (conversation.length > 0) {
    const replayMessages = conversation.map((m) => ({ type: m.messageType, data: m.data }));
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

export const handleSaveInputText: MessageHandler = (msg, ctx) => { ctx.stateManager.draftMessage = str(msg.text); };

export const handleCreateNewPanel: MessageHandler = (_msg, ctx) => { ctx.panelManager?.createNewPanel(); };

// ============================================================================
// CLI Compatibility Check
// ============================================================================

const MIN_CLI_VERSION = '1.0.0';

function parseCliVersion(output: string): string | null {
  const match = output.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function checkCliCompatibility(ctx: { postMessage(msg: Record<string, unknown>): void }): void {
  const { exec } = require('child_process') as typeof import('child_process');
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
  exec('claude --version', { shell, timeout: 5000 }, (error: Error | null, stdout: string) => {
    if (error) {
      ctx.postMessage({ type: 'showInstallModal' });
      return;
    }

    const version = parseCliVersion((stdout || '').trim());
    if (!version) {
      ctx.postMessage({
        type: 'cliVersionInfo',
        data: { version: null, minVersion: MIN_CLI_VERSION, compatible: true, warning: 'Unable to determine CLI version' },
      });
      return;
    }

    const compatible = compareVersions(version, MIN_CLI_VERSION) >= 0;
    ctx.postMessage({
      type: 'cliVersionInfo',
      data: {
        version,
        minVersion: MIN_CLI_VERSION,
        compatible,
        warning: compatible ? null : `Claude CLI ${version} is outdated. Minimum required: ${MIN_CLI_VERSION}. Run "npm install -g @anthropic-ai/claude-code" to upgrade.`,
      },
    });
  });
}
