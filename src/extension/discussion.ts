import * as vscode from 'vscode';
import * as cp from 'child_process';
import { EventEmitter } from 'events';
import type { DiscussionRole } from '../shared/types';
import { DEFAULT_DISCUSSION_ROLES } from '../shared/constants';
import { createModuleLogger } from '../shared/logger';

const log = createModuleLogger('DiscussionService');

interface DiscussionOptions {
  cwd: string;
  model?: string;
  effortLevel?: string;
}

/**
 * Manages parallel Claude CLI processes for multi-agent discussion mode.
 * Each role agent is a one-shot advisory process (no tool use, no session).
 * After all roles respond, a synthesizer agent combines the perspectives.
 */
export class DiscussionService implements vscode.Disposable {
  private _roleProcesses = new Map<string, cp.ChildProcess>();
  private _synthesizerProcess: cp.ChildProcess | undefined;
  private _isRunning = false;

  private _roleOutputEmitter = new EventEmitter();
  private _roleCompleteEmitter = new EventEmitter();
  private _synthesisOutputEmitter = new EventEmitter();
  private _discussionCompleteEmitter = new EventEmitter();
  private _errorEmitter = new EventEmitter();

  onRoleOutput(cb: (roleId: string, text: string) => void): void { this._roleOutputEmitter.on('output', cb); }
  onRoleComplete(cb: (roleId: string) => void): void { this._roleCompleteEmitter.on('complete', cb); }
  onSynthesisOutput(cb: (text: string) => void): void { this._synthesisOutputEmitter.on('output', cb); }
  onDiscussionComplete(cb: () => void): void { this._discussionCompleteEmitter.on('complete', cb); }
  onError(cb: (roleId: string, error: string) => void): void { this._errorEmitter.on('error', cb); }

  get isRunning(): boolean { return this._isRunning; }

  async startDiscussion(
    message: string,
    roles: DiscussionRole[] | undefined,
    options: DiscussionOptions,
  ): Promise<void> {
    if (this._isRunning) {
      await this.stopDiscussion();
    }

    this._isRunning = true;
    const activeRoles = roles && roles.length > 0 ? roles : DEFAULT_DISCUSSION_ROLES;

    log.info('Starting discussion', { roleCount: activeRoles.length });

    // Spawn all role agents in parallel
    const roleOutputs = new Map<string, string>();
    const rolePromises: Promise<void>[] = [];

    for (const role of activeRoles) {
      roleOutputs.set(role.id, '');
      rolePromises.push(this._spawnRoleAgent(role, message, options, roleOutputs));
    }

    // Wait for all roles to complete
    await Promise.allSettled(rolePromises);

    if (!this._isRunning) return; // Stopped during role execution

    // Start synthesis
    await this._startSynthesis(roleOutputs, message, activeRoles, options);

    this._isRunning = false;
    this._discussionCompleteEmitter.emit('complete');
  }

  async stopDiscussion(): Promise<void> {
    this._isRunning = false;

    // Kill all role processes
    for (const [roleId, proc] of this._roleProcesses) {
      this._killProcess(proc);
      this._roleProcesses.delete(roleId);
    }

    // Kill synthesizer
    if (this._synthesizerProcess) {
      this._killProcess(this._synthesizerProcess);
      this._synthesizerProcess = undefined;
    }
  }

  private _spawnRoleAgent(
    role: DiscussionRole,
    message: string,
    options: DiscussionOptions,
    roleOutputs: Map<string, string>,
  ): Promise<void> {
    return new Promise((resolve) => {
      const roleMessage = `${role.prompt}\n\n---\n\n用户的问题/需求：\n${message}\n\n请从你的专业角度给出分析和建议，保持简洁（200-400字）。`;

      const args = [
        '-p', '--output-format', 'stream-json', '--input-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--max-turns', '1',
      ];
      if (options.model) args.push('--model', options.model);
      if (options.effortLevel) args.push('--effort', options.effortLevel);

      const proc = cp.spawn('claude', args, {
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });

      this._roleProcesses.set(role.id, proc);

      // Send message via stdin
      if (proc.stdin) {
        const userMsg = {
          type: 'user',
          session_id: '',
          message: { role: 'user', content: [{ type: 'text', text: roleMessage }] },
          parent_tool_use_id: null,
        };
        proc.stdin.on('error', () => {});
        proc.stdin.write(JSON.stringify(userMsg) + '\n');
      }

      let remainder = '';
      let accumulated = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const combined = remainder + data.toString();
        const lines = combined.split('\n');
        remainder = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);

            // Extract assistant text from stream-json messages
            if (json.type === 'assistant' && json.message?.content) {
              for (const block of json.message.content) {
                if (block.type === 'text' && block.text) {
                  accumulated = block.text;
                  roleOutputs.set(role.id, accumulated);
                  this._roleOutputEmitter.emit('output', role.id, accumulated);
                }
              }
            }

            // Also handle result messages
            if (json.type === 'result' && json.result?.content) {
              for (const block of json.result.content) {
                if (block.type === 'text' && block.text) {
                  accumulated = block.text;
                  roleOutputs.set(role.id, accumulated);
                  this._roleOutputEmitter.emit('output', role.id, accumulated);
                }
              }
              if (proc.stdin && !proc.stdin.destroyed) proc.stdin.end();
            }
          } catch { /* non-JSON */ }
        }
      });

      proc.stderr?.on('data', () => { /* ignore debug output */ });

      proc.on('close', () => {
        this._roleProcesses.delete(role.id);
        if (accumulated) {
          this._roleCompleteEmitter.emit('complete', role.id);
        } else {
          this._errorEmitter.emit('error', role.id, 'No response received');
        }
        resolve();
      });

      proc.on('error', (error) => {
        this._roleProcesses.delete(role.id);
        this._errorEmitter.emit('error', role.id, error.message);
        resolve();
      });
    });
  }

  private async _startSynthesis(
    roleOutputs: Map<string, string>,
    originalMessage: string,
    roles: DiscussionRole[],
    options: DiscussionOptions,
  ): Promise<void> {
    // Build synthesis prompt
    const expertSections = roles.map(role => {
      const output = roleOutputs.get(role.id) || '(无响应)';
      return `### ${role.name}的分析：\n${output}`;
    }).join('\n\n');

    const synthesisMessage = `你是一个综合分析专家。多位专家已经从不同角度分析了用户的需求，请综合他们的观点给出最终建议。

## 用户原始问题
${originalMessage}

## 各专家分析
${expertSections}

## 你的任务
综合以上专家的观点，给出一个统一的、全面的回答。要：
1. 整合各方关键洞见
2. 指出专家们一致同意的方面
3. 对有分歧的地方给出你的判断
4. 给出明确可行的建议`;

    return new Promise((resolve) => {
      const args = [
        '-p', '--output-format', 'stream-json', '--input-format', 'stream-json',
        '--dangerously-skip-permissions',
        '--max-turns', '1',
      ];
      if (options.model) args.push('--model', options.model);
      if (options.effortLevel) args.push('--effort', options.effortLevel);

      const proc = cp.spawn('claude', args, {
        shell: process.platform === 'win32',
        detached: process.platform !== 'win32',
        cwd: options.cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      });

      this._synthesizerProcess = proc;

      if (proc.stdin) {
        const userMsg = {
          type: 'user',
          session_id: '',
          message: { role: 'user', content: [{ type: 'text', text: synthesisMessage }] },
          parent_tool_use_id: null,
        };
        proc.stdin.on('error', () => {});
        proc.stdin.write(JSON.stringify(userMsg) + '\n');
      }

      let remainder = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const combined = remainder + data.toString();
        const lines = combined.split('\n');
        remainder = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const json = JSON.parse(trimmed);
            if (json.type === 'assistant' && json.message?.content) {
              for (const block of json.message.content) {
                if (block.type === 'text' && block.text) {
                  this._synthesisOutputEmitter.emit('output', block.text);
                }
              }
            }
            if (json.type === 'result' && json.result?.content) {
              for (const block of json.result.content) {
                if (block.type === 'text' && block.text) {
                  this._synthesisOutputEmitter.emit('output', block.text);
                }
              }
              if (proc.stdin && !proc.stdin.destroyed) proc.stdin.end();
            }
          } catch { /* non-JSON */ }
        }
      });

      proc.stderr?.on('data', () => {});

      proc.on('close', () => {
        this._synthesizerProcess = undefined;
        resolve();
      });

      proc.on('error', () => {
        this._synthesizerProcess = undefined;
        resolve();
      });
    });
  }

  private _killProcess(proc: cp.ChildProcess): void {
    try {
      if (proc.stdin && !proc.stdin.destroyed) proc.stdin.end();
      const pid = proc.pid;
      if (process.platform === 'win32' && pid) {
        try { cp.execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' }); } catch { /* already dead */ }
      } else if (pid) {
        process.kill(-pid, 'SIGTERM');
      }
    } catch { /* already dead */ }
  }

  dispose(): void {
    void this.stopDiscussion();
    this._roleOutputEmitter.removeAllListeners();
    this._roleCompleteEmitter.removeAllListeners();
    this._synthesisOutputEmitter.removeAllListeners();
    this._discussionCompleteEmitter.removeAllListeners();
    this._errorEmitter.removeAllListeners();
  }
}
