import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { DiagnosticCheck, DiagnosticsResult } from '../shared/types';
import type { MCPService, UsageService } from './storage';

type PostMessage = (msg: Record<string, unknown>) => void;

export class DiagnosticsService {
  constructor(
    private readonly _mcpService: MCPService,
    private readonly _usageService: UsageService,
  ) {}

  async runAllChecks(postMessage: PostMessage): Promise<void> {
    // Send initial "running" state
    const checks: DiagnosticCheck[] = [
      { id: 'cli-install', label: 'Claude CLI', category: 'cli', status: 'running', message: 'Checking...' },
      { id: 'cli-version', label: 'CLI Version', category: 'cli', status: 'running', message: 'Checking...' },
      { id: 'node-version', label: 'Node.js', category: 'runtime', status: 'running', message: 'Checking...' },
      { id: 'auth-status', label: 'Authentication', category: 'auth', status: 'running', message: 'Checking...' },
      { id: 'api-usage', label: 'API Usage', category: 'network', status: 'running', message: 'Checking...' },
      { id: 'mcp-health', label: 'MCP Servers', category: 'mcp', status: 'running', message: 'Checking...' },
      { id: 'config-valid', label: 'Extension Config', category: 'config', status: 'running', message: 'Checking...' },
    ];

    postMessage({ type: 'diagnosticsResults', data: this._buildResult(checks) });

    // Run checks in parallel, posting updates as each completes
    const runners: Array<() => Promise<DiagnosticCheck>> = [
      () => this._checkCliInstallation(),
      () => this._checkCliVersion(),
      () => this._checkNodeVersion(),
      () => this._checkAuthentication(),
      () => this._checkApiUsage(),
      () => this._checkMcpHealth(),
      () => this._checkExtensionConfig(),
    ];

    const results = await Promise.allSettled(runners.map(r => r()));

    for (const result of results) {
      if (result.status === 'fulfilled') {
        const check = result.value;
        const idx = checks.findIndex(c => c.id === check.id);
        if (idx !== -1) checks[idx] = check;
      }
    }

    postMessage({ type: 'diagnosticsResults', data: this._buildResult(checks) });
  }

  private _buildResult(checks: DiagnosticCheck[]): DiagnosticsResult {
    return {
      timestamp: new Date().toISOString(),
      checks,
      summary: {
        pass: checks.filter(c => c.status === 'pass').length,
        fail: checks.filter(c => c.status === 'fail').length,
        warn: checks.filter(c => c.status === 'warn').length,
      },
    };
  }

  private _exec(command: string, timeout = 10000): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process') as typeof import('child_process');
      const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/sh';
      exec(command, { shell, timeout }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      });
    });
  }

  private async _checkCliInstallation(): Promise<DiagnosticCheck> {
    try {
      await this._exec('claude --version', 5000);
      return { id: 'cli-install', label: 'Claude CLI', category: 'cli', status: 'pass', message: 'Claude CLI is installed' };
    } catch {
      return {
        id: 'cli-install', label: 'Claude CLI', category: 'cli', status: 'fail',
        message: 'Claude CLI is not installed or not in PATH',
        detail: 'Install with: npm install -g @anthropic-ai/claude-code',
        fixAction: 'runInstallCommand',
      };
    }
  }

  private async _checkCliVersion(): Promise<DiagnosticCheck> {
    try {
      const { stdout } = await this._exec('claude --version', 5000);
      const version = stdout.trim();
      return { id: 'cli-version', label: 'CLI Version', category: 'cli', status: 'pass', message: `Version: ${version}` };
    } catch {
      return { id: 'cli-version', label: 'CLI Version', category: 'cli', status: 'skipped', message: 'Cannot determine (CLI not available)' };
    }
  }

  private async _checkNodeVersion(): Promise<DiagnosticCheck> {
    try {
      const { stdout } = await this._exec('node --version', 5000);
      const version = stdout.trim();
      const match = version.match(/^v(\d+)/);
      const major = match ? parseInt(match[1], 10) : 0;
      if (major >= 18) {
        return { id: 'node-version', label: 'Node.js', category: 'runtime', status: 'pass', message: `Node.js ${version} (>= 18 required)` };
      }
      return {
        id: 'node-version', label: 'Node.js', category: 'runtime', status: 'fail',
        message: `Node.js ${version} is too old (>= 18 required)`,
        detail: 'Update Node.js from https://nodejs.org',
      };
    } catch {
      return { id: 'node-version', label: 'Node.js', category: 'runtime', status: 'fail', message: 'Node.js not found in PATH' };
    }
  }

  private async _checkAuthentication(): Promise<DiagnosticCheck> {
    const os = require('os') as typeof import('os');
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    try {
      if (fs.existsSync(credPath)) {
        const content = fs.readFileSync(credPath, 'utf-8');
        const creds = JSON.parse(content);
        if (creds && (creds.oauthToken || creds.apiKey || creds.claudeAiOauth)) {
          return { id: 'auth-status', label: 'Authentication', category: 'auth', status: 'pass', message: 'Authenticated' };
        }
      }
    } catch { /* ignore parse errors */ }

    // Fallback: try running a quick claude command
    try {
      await this._exec('claude -p "ping" --output-format json', 8000);
      return { id: 'auth-status', label: 'Authentication', category: 'auth', status: 'pass', message: 'Authenticated (verified via CLI)' };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('auth') || errMsg.includes('login') || errMsg.includes('401') || errMsg.includes('unauthorized')) {
        return {
          id: 'auth-status', label: 'Authentication', category: 'auth', status: 'fail',
          message: 'Not authenticated',
          detail: 'Run "claude /login" to authenticate',
          fixAction: 'openLoginTerminal',
        };
      }
      return { id: 'auth-status', label: 'Authentication', category: 'auth', status: 'warn', message: 'Could not verify authentication status' };
    }
  }

  private async _checkApiUsage(): Promise<DiagnosticCheck> {
    const usage = this._usageService.currentUsage;
    if (usage) {
      const pct = usage.currentSession.costLimit > 0
        ? Math.round((usage.currentSession.usageCost / usage.currentSession.costLimit) * 100)
        : 0;
      if (pct >= 90) {
        return {
          id: 'api-usage', label: 'API Usage', category: 'network', status: 'warn',
          message: `Usage at ${pct}% of limit`,
          detail: `Session: $${usage.currentSession.usageCost.toFixed(2)} / $${usage.currentSession.costLimit.toFixed(2)}, resets ${usage.currentSession.resetsIn}`,
        };
      }
      return {
        id: 'api-usage', label: 'API Usage', category: 'network', status: 'pass',
        message: `Usage at ${pct}% of limit`,
        detail: `Session: $${usage.currentSession.usageCost.toFixed(2)} / $${usage.currentSession.costLimit.toFixed(2)}`,
      };
    }
    return { id: 'api-usage', label: 'API Usage', category: 'network', status: 'warn', message: 'Usage data not available yet' };
  }

  private async _checkMcpHealth(): Promise<DiagnosticCheck> {
    const servers = this._mcpService.loadServers();
    const names = Object.keys(servers);
    if (names.length === 0) {
      return { id: 'mcp-health', label: 'MCP Servers', category: 'mcp', status: 'pass', message: 'No MCP servers configured' };
    }

    const issues: string[] = [];
    for (const [name, config] of Object.entries(servers)) {
      if (config.type === 'stdio') {
        if (!config.command) {
          issues.push(`${name}: missing command`);
        }
      } else if (config.type === 'http' || config.type === 'sse') {
        if (!config.url) {
          issues.push(`${name}: missing URL`);
        }
      }
    }

    if (issues.length > 0) {
      return {
        id: 'mcp-health', label: 'MCP Servers', category: 'mcp', status: 'warn',
        message: `${issues.length} issue(s) found in ${names.length} server(s)`,
        detail: issues.join('\n'),
      };
    }

    return {
      id: 'mcp-health', label: 'MCP Servers', category: 'mcp', status: 'pass',
      message: `${names.length} server(s) configured`,
      detail: names.join(', '),
    };
  }

  private async _checkExtensionConfig(): Promise<DiagnosticCheck> {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    const issues: string[] = [];

    const maxTurns = config.get<number>('maxTurns', 0);
    if (maxTurns < 0 || maxTurns > 100) {
      issues.push(`maxTurns (${maxTurns}) is out of valid range 0-100`);
    }

    const intensity = config.get<string>('thinking.intensity', 'fast');
    if (!['fast', 'deep', 'precise'].includes(intensity)) {
      issues.push(`thinking.intensity "${intensity}" is not a valid value`);
    }

    if (issues.length > 0) {
      return {
        id: 'config-valid', label: 'Extension Config', category: 'config', status: 'warn',
        message: `${issues.length} configuration issue(s)`,
        detail: issues.join('\n'),
      };
    }

    return { id: 'config-valid', label: 'Extension Config', category: 'config', status: 'pass', message: 'All settings are valid' };
  }

  /** Handle fix actions from the webview */
  handleFixAction(action: string, postMessage: PostMessage): void {
    switch (action) {
      case 'runInstallCommand':
        postMessage({ type: 'showInstallModal' });
        break;
      case 'openLoginTerminal': {
        const terminal = vscode.window.createTerminal({ name: 'Claude: Login' });
        terminal.sendText('claude /login');
        terminal.show();
        break;
      }
    }
  }
}
