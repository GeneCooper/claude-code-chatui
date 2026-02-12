import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import type { ConversationMessage } from '../shared/types';
import { MEMORIES_DIR, MEMORIES_FILE, MAX_MEMORY_FILE_SIZE } from '../shared/constants';

export interface MemoriesInfo {
  count: number;
  lastUpdated: string | null;
  filePath: string;
}

export class MemoriesService implements vscode.Disposable {
  constructor(private readonly _context: vscode.ExtensionContext) {}

  private _getMemoriesPath(): string | null {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;
    return path.join(workspaceFolder.uri.fsPath, MEMORIES_DIR, MEMORIES_FILE);
  }

  async getMemories(): Promise<string | null> {
    const memoriesPath = this._getMemoriesPath();
    if (!memoriesPath || !fs.existsSync(memoriesPath)) return null;
    try {
      return fs.readFileSync(memoriesPath, 'utf8');
    } catch { return null; }
  }

  async getMemoriesInfo(): Promise<MemoriesInfo> {
    const memoriesPath = this._getMemoriesPath();
    const relPath = `${MEMORIES_DIR}/${MEMORIES_FILE}`;
    if (!memoriesPath || !fs.existsSync(memoriesPath)) {
      return { count: 0, lastUpdated: null, filePath: relPath };
    }
    try {
      const content = fs.readFileSync(memoriesPath, 'utf8');
      const count = (content.match(/^## /gm) || []).length;
      const stat = fs.statSync(memoriesPath);
      return { count, lastUpdated: stat.mtime.toISOString(), filePath: relPath };
    } catch {
      return { count: 0, lastUpdated: null, filePath: relPath };
    }
  }

  async extractMemories(conversation: ConversationMessage[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    if (!config.get<boolean>('memories.enabled', true)) return;
    if (!config.get<boolean>('memories.autoExtract', true)) return;

    const userMessages = conversation.filter((m) => m.messageType === 'userInput');
    if (userMessages.length < 3) return;

    const memoriesPath = this._getMemoriesPath();
    if (!memoriesPath) return;

    const summaryLines: string[] = [];
    for (const msg of conversation.slice(-20)) {
      if (msg.messageType === 'userInput') {
        const text = typeof msg.data === 'string' ? msg.data : (msg.data as Record<string, unknown>)?.text as string;
        if (text) summaryLines.push(`User: ${text.substring(0, 200)}`);
      } else if (msg.messageType === 'output') {
        summaryLines.push(`Claude: ${String(msg.data).substring(0, 200)}`);
      }
    }

    if (summaryLines.length < 4) return;

    const extractionPrompt = `Given this conversation summary, extract 1-3 key architectural decisions, coding patterns, or project preferences worth remembering for future sessions. Format each as a markdown section with ## heading and 1-2 line description. Be concise. If nothing worth remembering, output exactly "NONE".

Conversation:
${summaryLines.join('\n')}`;

    await this._callClaude(extractionPrompt, (result) => {
      if (!result || result.trim() === 'NONE' || result.trim().length < 10) return;
      this._appendMemories(memoriesPath, result.trim());
    });
  }

  private _appendMemories(memoriesPath: string, newContent: string): void {
    const dir = path.dirname(memoriesPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const timestamp = new Date().toISOString().split('T')[0];
    const header = `\n\n<!-- Extracted: ${timestamp} -->\n`;

    let existing = '';
    if (fs.existsSync(memoriesPath)) {
      existing = fs.readFileSync(memoriesPath, 'utf8');
    } else {
      existing = '# Project Memories\n\nAutomatically extracted decisions and patterns.\n';
    }

    const combined = existing + header + newContent;
    const maxSize = vscode.workspace.getConfiguration('claudeCodeChatUI')
      .get<number>('memories.maxSize', MAX_MEMORY_FILE_SIZE);

    if (combined.length > maxSize) {
      // Keep header and trim oldest entries
      const headerEnd = combined.indexOf('\n\n<!-- Extracted:');
      const preamble = headerEnd > 0 ? combined.substring(0, headerEnd) : '# Project Memories\n';
      const rest = combined.substring(headerEnd);
      const trimmed = rest.substring(rest.length - (maxSize - preamble.length));
      fs.writeFileSync(memoriesPath, preamble + trimmed, 'utf8');
    } else {
      fs.writeFileSync(memoriesPath, combined, 'utf8');
    }
  }

  async clearMemories(): Promise<void> {
    const memoriesPath = this._getMemoriesPath();
    if (memoriesPath && fs.existsSync(memoriesPath)) {
      fs.unlinkSync(memoriesPath);
    }
  }

  async editMemories(): Promise<void> {
    const memoriesPath = this._getMemoriesPath();
    if (!memoriesPath) return;
    if (!fs.existsSync(memoriesPath)) {
      const dir = path.dirname(memoriesPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(memoriesPath, '# Project Memories\n\nAdd your memories here.\n', 'utf8');
    }
    const doc = await vscode.workspace.openTextDocument(memoriesPath);
    await vscode.window.showTextDocument(doc);
  }

  async getSystemPromptContent(): Promise<string | null> {
    const config = vscode.workspace.getConfiguration('claudeCodeChatUI');
    if (!config.get<boolean>('memories.enabled', true)) return null;
    const memories = await this.getMemories();
    if (!memories || memories.trim().length === 0) return null;
    return `[Project Memories - Context from previous sessions]\n${memories}`;
  }

  private _callClaude(prompt: string, callback: (result: string | null) => void): Promise<void> {
    return new Promise((resolve) => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      const cwd = workspaceFolder ? workspaceFolder.uri.fsPath : process.cwd();

      const proc = cp.spawn('claude', ['-p', prompt, '--output-format', 'text', '--model', 'claude-haiku-4-5-20251001'], {
        cwd,
        shell: process.platform === 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      proc.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
      proc.on('close', () => { callback(stdout.trim() || null); resolve(); });
      proc.on('error', () => { callback(null); resolve(); });
      setTimeout(() => { try { if (!proc.killed) proc.kill('SIGTERM'); } catch { /* already dead */ } }, 30000);
    });
  }

  dispose(): void {}
}
