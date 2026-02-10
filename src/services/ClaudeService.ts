import * as vscode from 'vscode';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import type { ClaudeMessage, PermissionRequest } from '../shared/types';
import { THINKING_INTENSITIES, type ThinkingIntensity } from '../shared/constants';

export interface SendMessageOptions {
  cwd: string;
  planMode?: boolean;
  thinkingMode?: boolean;
  yoloMode?: boolean;
  model?: string;
  mcpConfigPath?: string;
}

interface PendingPermission {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: unknown[];
  toolUseId: string;
}

/**
 * Manages the Claude CLI child process and bidirectional stdin/stdout communication.
 */
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

  // Event registration
  onMessage(cb: (msg: ClaudeMessage) => void): void { this._messageEmitter.on('message', cb); }
  onProcessEnd(cb: () => void): void { this._processEndEmitter.on('end', cb); }
  onError(cb: (err: string) => void): void { this._errorEmitter.on('error', cb); }
  onPermissionRequest(cb: (req: PermissionRequest) => void): void { this._permissionRequestEmitter.on('request', cb); }

  get sessionId(): string | undefined { return this._sessionId; }
  setSessionId(id: string | undefined): void { this._sessionId = id; }

  /**
   * Send a message to Claude CLI via a spawned process.
   */
  async sendMessage(message: string, options: SendMessageOptions): Promise<void> {
    // Prepend thinking prompt if thinking mode enabled
    let actualMessage = message;
    if (options.thinkingMode) {
      const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
      const intensity = config.get<ThinkingIntensity>('thinking.intensity', 'think');
      const prompt = THINKING_INTENSITIES[intensity] || 'THINK';
      actualMessage = `${prompt} THROUGH THIS STEP BY STEP: \n${actualMessage}`;
    }

    // Build CLI arguments
    const args = ['--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose'];

    if (options.yoloMode) {
      args.push('--dangerously-skip-permissions');
    } else {
      args.push('--permission-prompt-tool', 'stdio');
    }

    if (options.mcpConfigPath) {
      args.push('--mcp-config', options.mcpConfigPath);
    }

    if (options.planMode && !options.yoloMode) {
      args.push('--permission-mode', 'plan');
    }

    if (options.model && options.model !== 'default') {
      args.push('--model', options.model);
    }

    if (this._sessionId) {
      args.push('--resume', this._sessionId);
    }

    // Abort any previous request
    this._abortController = new AbortController();

    const claudeProcess = cp.spawn('claude', args, {
      signal: this._abortController.signal,
      shell: process.platform === 'win32',
      detached: process.platform !== 'win32',
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });

    this._process = claudeProcess;

    // Send user message to stdin
    if (claudeProcess.stdin) {
      const userMsg = {
        type: 'user',
        session_id: this._sessionId || '',
        message: {
          role: 'user',
          content: [{ type: 'text', text: actualMessage }],
        },
        parent_tool_use_id: null,
      };
      claudeProcess.stdin.write(JSON.stringify(userMsg) + '\n');
    }

    // Process stdout (JSON stream, line by line)
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

          // Handle permission control requests
          if (json.type === 'control_request') {
            this._handleControlRequest(json, claudeProcess);
            continue;
          }

          // Handle control responses (e.g., account info)
          if (json.type === 'control_response') {
            continue;
          }

          // End stdin on result
          if (json.type === 'result') {
            if (claudeProcess.stdin && !claudeProcess.stdin.destroyed) {
              claudeProcess.stdin.end();
            }
          }

          this._messageEmitter.emit('message', json as ClaudeMessage);
        } catch {
          // Ignore non-JSON lines
        }
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
      if (code !== 0 && errorOutput.trim()) {
        this._errorEmitter.emit('error', errorOutput.trim());
      }
    });

    claudeProcess.on('error', (error) => {
      if (!this._process) return;
      this._process = undefined;
      this._cancelPendingPermissions();
      this._processEndEmitter.emit('end');
      this._errorEmitter.emit('error', `Error running Claude: ${error.message}`);
    });
  }

  /**
   * Stop the current Claude process.
   */
  async stopProcess(): Promise<void> {
    if (!this._process) return;

    try {
      this._abortController?.abort();
      if (this._process.stdin && !this._process.stdin.destroyed) {
        this._process.stdin.end();
      }
      if (process.platform === 'win32' && this._process.pid) {
        cp.exec(`taskkill /pid ${this._process.pid} /T /F`);
      } else if (this._process.pid) {
        process.kill(-this._process.pid, 'SIGTERM');
      }
    } catch {
      // Process may already be dead
    }

    this._process = undefined;
    this._cancelPendingPermissions();
  }

  /**
   * Send a permission response back to Claude via stdin.
   */
  sendPermissionResponse(requestId: string, approved: boolean, alwaysAllow?: boolean): void {
    const pending = this._pendingPermissions.get(requestId);
    if (!pending) return;

    this._pendingPermissions.delete(requestId);

    if (this._process?.stdin && !this._process.stdin.destroyed) {
      const response = {
        type: 'control_response',
        request_id: requestId,
        permission_decision: approved
          ? (alwaysAllow ? 'allow_always' : 'allow')
          : 'deny',
      };
      this._process.stdin.write(JSON.stringify(response) + '\n');
    }
  }

  private _handleControlRequest(controlRequest: { request_id: string; request: Record<string, unknown> }, claudeProcess: cp.ChildProcess): void {
    const request = controlRequest.request;
    const requestId = controlRequest.request_id;

    if ((request as { subtype?: string }).subtype !== 'can_use_tool') return;

    const toolName = (request as { tool_name?: string }).tool_name || 'Unknown Tool';
    const input = (request as { input?: Record<string, unknown> }).input || {};
    const suggestions = (request as { permission_suggestions?: unknown[] }).permission_suggestions;
    const toolUseId = (request as { tool_use_id?: string }).tool_use_id || requestId;

    this._pendingPermissions.set(requestId, { requestId, toolName, input, suggestions, toolUseId });

    // Generate bash command pattern
    let pattern: string | undefined;
    if (toolName === 'Bash' && input.command) {
      const cmd = String(input.command).trim();
      const firstWord = cmd.split(/\s+/)[0];
      pattern = firstWord || cmd;
    }

    this._permissionRequestEmitter.emit('request', {
      requestId,
      toolName,
      input,
      suggestions,
      toolUseId,
      decisionReason: (request as { decision_reason?: string }).decision_reason,
      blockedPath: (request as { blocked_path?: string }).blocked_path,
      pattern,
    });
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
