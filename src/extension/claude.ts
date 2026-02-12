import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { ClaudeMessage, PermissionRequest } from '../shared/types';

// ============================================================================
// PermissionService
// ============================================================================

interface PermissionEntry {
  toolName: string;
  pattern: string;
  createdAt: string;
}

interface Permissions {
  allowedPatterns: PermissionEntry[];
}

export class PermissionService implements vscode.Disposable {
  private _permissionsPath: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    const permDir = path.join(_context.globalStorageUri.fsPath, 'permissions');
    if (!fs.existsSync(permDir)) {
      fs.mkdirSync(permDir, { recursive: true });
    }
    this._permissionsPath = path.join(permDir, 'permissions.json');
  }

  dispose(): void {}

  async getPermissions(): Promise<Permissions> {
    try {
      if (fs.existsSync(this._permissionsPath)) {
        const raw = fs.readFileSync(this._permissionsPath, 'utf8');
        return JSON.parse(raw) as Permissions;
      }
    } catch { /* corrupt file */ }
    return { allowedPatterns: [] };
  }

  async isToolPreApproved(toolName: string, input: Record<string, unknown>): Promise<boolean> {
    const permissions = await this.getPermissions();
    for (const entry of permissions.allowedPatterns) {
      if (entry.toolName !== toolName) continue;
      const command = this._extractCommand(toolName, input);
      if (command && this._matchesPattern(command, entry.pattern)) return true;
    }
    return false;
  }

  async savePermission(toolName: string, pattern: string): Promise<void> {
    const permissions = await this.getPermissions();
    const exists = permissions.allowedPatterns.some(
      (e) => e.toolName === toolName && e.pattern === pattern,
    );
    if (exists) return;
    permissions.allowedPatterns.push({ toolName, pattern, createdAt: new Date().toISOString() });
    await this._savePermissions(permissions);
  }

  async removePermission(toolName: string, pattern: string): Promise<void> {
    const permissions = await this.getPermissions();
    permissions.allowedPatterns = permissions.allowedPatterns.filter(
      (e) => !(e.toolName === toolName && e.pattern === pattern),
    );
    await this._savePermissions(permissions);
  }

  async addPermission(toolName: string, pattern: string): Promise<void> {
    await this.savePermission(toolName, pattern);
  }

  async clearPermissions(): Promise<void> {
    await this._savePermissions({ allowedPatterns: [] });
  }

  private _extractCommand(toolName: string, input: Record<string, unknown>): string | null {
    switch (toolName) {
      case 'Bash': return (input.command as string) || null;
      case 'Read': case 'Write': case 'Edit': case 'MultiEdit':
        return (input.file_path as string) || null;
      case 'Glob': case 'Grep': return (input.pattern as string) || null;
      default: return null;
    }
  }

  private _matchesPattern(command: string, pattern: string): boolean {
    if (command === pattern) return true;
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    try { return new RegExp(`^${escaped}$`).test(command); } catch { return false; }
  }

  private async _savePermissions(permissions: Permissions): Promise<void> {
    try {
      fs.writeFileSync(this._permissionsPath, JSON.stringify(permissions, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to save permissions:', err);
    }
  }
}

// ============================================================================
// ClaudeService
// ============================================================================

interface SendMessageOptions {
  cwd: string;
  planMode?: boolean;
  thinkingMode?: boolean;
  thinkingIntensity?: string;
  yoloMode?: boolean;
  model?: string;
  mcpConfigPath?: string;
  images?: string[];
  allowedTools?: string[];
  disallowedTools?: string[];
  continueConversation?: boolean;
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: unknown[];
  toolUseId: string;
}

export class ClaudeService implements vscode.Disposable {
  private _process: cp.ChildProcess | undefined;
  private _abortController: AbortController | undefined;
  private _sessionId: string | undefined;
  private _pendingPermissions = new Map<string, PendingPermission>();
  private _messageEmitter = new EventEmitter();
  private _processEndEmitter = new EventEmitter();
  private _errorEmitter = new EventEmitter();
  private _permissionRequestEmitter = new EventEmitter();

  constructor(private readonly _context: vscode.ExtensionContext) {}

  onMessage(cb: (msg: ClaudeMessage) => void): void { this._messageEmitter.on('message', cb); }
  onProcessEnd(cb: () => void): void { this._processEndEmitter.on('end', cb); }
  onError(cb: (err: string) => void): void { this._errorEmitter.on('error', cb); }
  onPermissionRequest(cb: (req: PermissionRequest) => void): void { this._permissionRequestEmitter.on('request', cb); }

  get sessionId(): string | undefined { return this._sessionId; }
  setSessionId(id: string | undefined): void { this._sessionId = id; }

  async sendMessage(message: string, options: SendMessageOptions): Promise<void> {
    const actualMessage = message;

    const args = ['--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose'];

    // Effort level (--effort low/medium/high)
    if (options.thinkingMode && options.thinkingIntensity) {
      args.push('--effort', options.thinkingIntensity);
    }

    // Permission handling: --dangerously-skip-permissions and --permission-prompt-tool
    // are mutually exclusive. Using both causes the CLI to still route permission
    // requests through stdio instead of skipping them.
    if (options.yoloMode) {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-prompt-tool', 'stdio');
      if (options.planMode) args.push('--permission-mode', 'plan');
    }
    if (options.mcpConfigPath) args.push('--mcp-config', options.mcpConfigPath);
    if (options.model && options.model !== 'default') args.push('--model', options.model);
    if (options.allowedTools?.length) {
      for (const tool of options.allowedTools) args.push('--allowedTools', tool);
    }
    if (options.disallowedTools?.length) {
      for (const tool of options.disallowedTools) args.push('--disallowedTools', tool);
    }
    const maxTurns = vscode.workspace.getConfiguration('claudeCodeChatUI').get<number>('maxTurns', 0);
    if (maxTurns > 0) args.push('--max-turns', String(maxTurns));
    if (options.continueConversation && this._sessionId) args.push('--continue');
    if (this._sessionId) args.push('--resume', this._sessionId);

    this._abortController = new AbortController();

    const claudeProcess = cp.spawn('claude', args, {
      signal: this._abortController.signal,
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', ANTHROPIC_LOG: 'debug' },
    });

    this._process = claudeProcess;

    if (claudeProcess.stdin) {
      const contentBlocks: unknown[] = [{ type: 'text', text: actualMessage }];
      if (options.images?.length) {
        for (const dataUrl of options.images) {
          const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            contentBlocks.push({
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] },
            });
          }
        }
      }
      const userMsg = {
        type: 'user',
        session_id: this._sessionId || '',
        message: { role: 'user', content: contentBlocks },
        parent_tool_use_id: null,
      };
      claudeProcess.stdin.write(JSON.stringify(userMsg) + '\n');
    }

    let rawOutput = '';
    let errorOutput = '';

    claudeProcess.stdout?.on('data', (data: Buffer) => {
      rawOutput += data.toString();
      const lines = rawOutput.split('\n');
      rawOutput = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line.trim());
          if (json.type === 'control_request') { this._handleControlRequest(json, claudeProcess); continue; }
          if (json.type === 'result') {
            if (claudeProcess.stdin && !claudeProcess.stdin.destroyed) claudeProcess.stdin.end();
          }
          this._messageEmitter.emit('message', json as ClaudeMessage);
        } catch { /* non-JSON */ }
      }
    });

    claudeProcess.stderr?.on('data', (data: Buffer) => {
      errorOutput += data.toString();
    });

    claudeProcess.on('close', (code) => {
      if (!this._process) return;
      this._process = undefined;
      this._cancelPendingPermissions();
      this._processEndEmitter.emit('end');
      if (code !== 0 && errorOutput.trim()) this._errorEmitter.emit('error', errorOutput.trim());
    });

    claudeProcess.on('error', (error) => {
      if (!this._process) return;
      this._process = undefined;
      this._cancelPendingPermissions();
      this._processEndEmitter.emit('end');
      this._errorEmitter.emit('error', `Error running Claude: ${error.message}`);
    });
  }

  async stopProcess(): Promise<void> {
    if (!this._process) return;
    try {
      this._abortController?.abort();
      if (this._process.stdin && !this._process.stdin.destroyed) this._process.stdin.end();
      if (process.platform === 'win32' && this._process.pid) {
        cp.exec(`taskkill /pid ${this._process.pid} /T /F`);
      } else if (this._process.pid) {
        process.kill(-this._process.pid, 'SIGTERM');
      }
    } catch { /* already dead */ }
    this._process = undefined;
    this._cancelPendingPermissions();
  }

  sendPermissionResponse(requestId: string, approved: boolean, alwaysAllow?: boolean): void {
    const pending = this._pendingPermissions.get(requestId);
    if (!pending) return;
    this._pendingPermissions.delete(requestId);
    if (this._process?.stdin && !this._process.stdin.destroyed) {
      const response = approved
        ? {
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: requestId,
              response: {
                behavior: 'allow',
                updatedInput: pending.input,
                updatedPermissions: alwaysAllow ? pending.suggestions : undefined,
                toolUseID: pending.toolUseId,
              },
            },
          }
        : {
            type: 'control_response',
            response: {
              subtype: 'success',
              request_id: requestId,
              response: {
                behavior: 'deny',
                message: 'User denied permission',
                interrupt: true,
                toolUseID: pending.toolUseId,
              },
            },
          };
      this._process.stdin.write(JSON.stringify(response) + '\n');
    }
  }

  private _handleControlRequest(controlRequest: { request_id: string; request: Record<string, unknown> }, _claudeProcess: cp.ChildProcess): void {
    const request = controlRequest.request;
    const requestId = controlRequest.request_id;
    if ((request as { subtype?: string }).subtype !== 'can_use_tool') return;

    const toolName = (request as { tool_name?: string }).tool_name || 'Unknown Tool';
    const input = (request as { input?: Record<string, unknown> }).input || {};
    const suggestions = (request as { permission_suggestions?: unknown[] }).permission_suggestions;
    const toolUseId = (request as { tool_use_id?: string }).tool_use_id || requestId;

    this._pendingPermissions.set(requestId, { requestId, toolName, input, suggestions, toolUseId });

    let pattern: string | undefined;
    if (toolName === 'Bash' && input.command) {
      pattern = this._getCommandPattern(String(input.command).trim());
    }

    this._permissionRequestEmitter.emit('request', {
      requestId, toolName, input, suggestions, toolUseId,
      decisionReason: (request as { decision_reason?: string }).decision_reason,
      blockedPath: (request as { blocked_path?: string }).blocked_path,
      pattern,
    });
  }

  // Common command patterns: [firstWord, subcommand] → wildcard pattern
  private static readonly COMMAND_PATTERNS: [string, string, string][] = [
    // Package managers
    ['npm', 'install', 'npm install *'],
    ['npm', 'i', 'npm i *'],
    ['npm', 'add', 'npm add *'],
    ['npm', 'remove', 'npm remove *'],
    ['npm', 'uninstall', 'npm uninstall *'],
    ['npm', 'update', 'npm update *'],
    ['npm', 'run', 'npm run *'],
    ['npm', 'test', 'npm test *'],
    ['npx', '', 'npx *'],
    ['yarn', 'add', 'yarn add *'],
    ['yarn', 'remove', 'yarn remove *'],
    ['yarn', 'install', 'yarn install *'],
    ['pnpm', 'install', 'pnpm install *'],
    ['pnpm', 'add', 'pnpm add *'],
    ['pnpm', 'remove', 'pnpm remove *'],
    ['bun', 'install', 'bun install *'],
    ['bun', 'add', 'bun add *'],
    // Git commands
    ['git', 'add', 'git add *'],
    ['git', 'commit', 'git commit *'],
    ['git', 'push', 'git push *'],
    ['git', 'pull', 'git pull *'],
    ['git', 'checkout', 'git checkout *'],
    ['git', 'branch', 'git branch *'],
    ['git', 'merge', 'git merge *'],
    ['git', 'clone', 'git clone *'],
    ['git', 'reset', 'git reset *'],
    ['git', 'rebase', 'git rebase *'],
    ['git', 'tag', 'git tag *'],
    ['git', 'diff', 'git diff *'],
    ['git', 'log', 'git log *'],
    ['git', 'status', 'git status'],
    // Docker commands
    ['docker', 'run', 'docker run *'],
    ['docker', 'build', 'docker build *'],
    ['docker', 'exec', 'docker exec *'],
    ['docker', 'logs', 'docker logs *'],
    ['docker', 'stop', 'docker stop *'],
    ['docker', 'start', 'docker start *'],
    ['docker', 'rm', 'docker rm *'],
    ['docker', 'rmi', 'docker rmi *'],
    ['docker', 'pull', 'docker pull *'],
    ['docker', 'push', 'docker push *'],
    // Build tools
    ['make', '', 'make *'],
    ['cargo', 'build', 'cargo build *'],
    ['cargo', 'run', 'cargo run *'],
    ['cargo', 'test', 'cargo test *'],
    ['cargo', 'install', 'cargo install *'],
    ['mvn', 'compile', 'mvn compile *'],
    ['mvn', 'test', 'mvn test *'],
    ['mvn', 'package', 'mvn package *'],
    ['gradle', 'build', 'gradle build *'],
    ['gradle', 'test', 'gradle test *'],
    ['go', 'build', 'go build *'],
    ['go', 'test', 'go test *'],
    // System commands
    ['curl', '', 'curl *'],
    ['wget', '', 'wget *'],
    ['ssh', '', 'ssh *'],
    ['scp', '', 'scp *'],
    ['rsync', '', 'rsync *'],
    ['tar', '', 'tar *'],
    ['zip', '', 'zip *'],
    ['unzip', '', 'unzip *'],
    ['mkdir', '', 'mkdir *'],
    ['cat', '', 'cat *'],
    ['ls', '', 'ls *'],
    ['cd', '', 'cd *'],
    // Development tools
    ['node', '', 'node *'],
    ['python', '', 'python *'],
    ['python3', '', 'python3 *'],
    ['pip', 'install', 'pip install *'],
    ['pip3', 'install', 'pip3 install *'],
    ['composer', 'install', 'composer install *'],
    ['composer', 'require', 'composer require *'],
    ['bundle', 'install', 'bundle install *'],
    ['gem', 'install', 'gem install *'],
  ];

  private _getCommandPattern(command: string): string {
    const parts = command.split(/\s+/);
    const firstWord = parts[0] || command;
    const subCommand = parts[1] || '';
    for (const [cmd, sub, pattern] of ClaudeService.COMMAND_PATTERNS) {
      if (firstWord === cmd && (sub === '' || subCommand === sub)) return pattern;
    }
    return parts.length > 1 ? `${firstWord} *` : firstWord;
  }

  private _cancelPendingPermissions(): void {
    this._pendingPermissions.clear();
  }

  dispose(): void {
    void this.stopProcess();
    this._messageEmitter.removeAllListeners();
    this._processEndEmitter.removeAllListeners();
    this._errorEmitter.removeAllListeners();
    this._permissionRequestEmitter.removeAllListeners();
  }
}
