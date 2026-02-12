import * as vscode from 'vscode';
import type { MessageHandler } from './types';
import { str } from './helpers';

export const handleRunInstallCommand: MessageHandler = (_msg, ctx) => {
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

export const handleExecuteSlashCommand: MessageHandler = (msg, ctx) => {
  const command = str(msg.command);
  if (command === 'compact') { ctx.handleSendMessage('/compact'); return; }
  if (command === 'clear') { void ctx.newSession(); return; }

  const sessionId = ctx.claudeService.sessionId;
  const args = sessionId ? `/${command} --resume ${sessionId}` : `/${command}`;
  const terminal = vscode.window.createTerminal({ name: `Claude: /${command}` });
  terminal.sendText(`claude ${args}`);
  terminal.show();
};
