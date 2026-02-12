import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { promisify } from 'util';
import type {
  ConversationData, ConversationMessage, ConversationIndexEntry,
  MCPServerConfig, MCPConfig,
} from '../shared/types';

const exec = promisify(cp.exec);

// ============================================================================
// BackupService
// ============================================================================

export interface BackupCommit {
  id: string;
  sha: string;
  message: string;
  timestamp: string;
}

export class BackupService {
  private _repoPath: string | undefined;
  private _commits: BackupCommit[] = [];

  constructor(private readonly _context: vscode.ExtensionContext) {}

  get commits(): BackupCommit[] { return this._commits; }

  async initialize(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) return;

      const storagePath = this._context.storageUri?.fsPath;
      if (!storagePath) return;

      this._repoPath = path.join(storagePath, 'backups', '.git');

      try {
        await vscode.workspace.fs.stat(vscode.Uri.file(this._repoPath));
      } catch {
        await vscode.workspace.fs.createDirectory(vscode.Uri.file(this._repoPath));
        const workspacePath = workspaceFolder.uri.fsPath;
        await exec(`git --git-dir="${this._repoPath}" --work-tree="${workspacePath}" init`);
        await exec(`git --git-dir="${this._repoPath}" config user.name "Claude Code Chat"`);
        await exec(`git --git-dir="${this._repoPath}" config user.email "claude@backup.local"`);
      }
    } catch (err) {
      console.error('Failed to initialize backup repository:', err);
    }
  }

  async createBackup(userMessage: string): Promise<BackupCommit | undefined> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder || !this._repoPath) return;

      const workspacePath = workspaceFolder.uri.fsPath;
      const now = new Date();
      const commitMsg = `Before: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;

      await exec(`git --git-dir="${this._repoPath}" --work-tree="${workspacePath}" add -A`);

      let isFirstCommit = false;
      try { await exec(`git --git-dir="${this._repoPath}" rev-parse HEAD`); }
      catch { isFirstCommit = true; }

      const { stdout: status } = await exec(`git --git-dir="${this._repoPath}" --work-tree="${workspacePath}" status --porcelain`);

      let actualMessage: string;
      if (isFirstCommit) {
        actualMessage = `Initial backup: ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
      } else if (status.trim()) {
        actualMessage = commitMsg;
      } else {
        actualMessage = `Checkpoint (no changes): ${userMessage.substring(0, 50)}${userMessage.length > 50 ? '...' : ''}`;
      }

      await exec(`git --git-dir="${this._repoPath}" --work-tree="${workspacePath}" commit --allow-empty -m "${actualMessage.replace(/"/g, '\\"')}"`);
      const { stdout: sha } = await exec(`git --git-dir="${this._repoPath}" rev-parse HEAD`);

      const commit: BackupCommit = {
        id: `commit-${now.toISOString().replace(/[:.]/g, '-')}`,
        sha: sha.trim(),
        message: actualMessage,
        timestamp: now.toISOString(),
      };
      this._commits.push(commit);
      return commit;
    } catch (err) {
      console.error('Failed to create backup commit:', err);
      return undefined;
    }
  }

  async restore(commitSha: string): Promise<{ success: boolean; message: string }> {
    const commit = this._commits.find((c) => c.sha === commitSha);
    if (!commit) return { success: false, message: 'Commit not found' };

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder || !this._repoPath) {
      return { success: false, message: 'No workspace folder or backup repository available' };
    }

    try {
      const workspacePath = workspaceFolder.uri.fsPath;
      await exec(`git --git-dir="${this._repoPath}" --work-tree="${workspacePath}" checkout ${commitSha} -- .`);
      return { success: true, message: `Restored to: ${commit.message}` };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to restore: ${msg}` };
    }
  }
}

// ============================================================================
// MCPService
// ============================================================================

export class MCPService {
  private _configDir: string;
  private _configPath: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._configDir = path.join(_context.globalStorageUri.fsPath, 'mcp');
    this._configPath = path.join(this._configDir, 'mcp-servers.json');
    this._ensureConfigDir();
  }

  get configPath(): string { return this._configPath; }

  private static readonly DEFAULT_SERVERS: Record<string, MCPServerConfig> = {
    'context7': { type: 'http', url: 'https://context7.liam.sh/mcp' },
    'sequential-thinking': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
    'memory': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
    'fetch': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-fetch'] },
    'filesystem': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
    'github': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    'brave-search': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
    'figma': { type: 'stdio', command: 'npx', args: ['-y', 'figma-developer-mcp'] },
    'postgres': { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
  };

  private _ensureConfigDir(): void {
    if (!fs.existsSync(this._configDir)) fs.mkdirSync(this._configDir, { recursive: true });
    if (!fs.existsSync(this._configPath)) {
      const config: MCPConfig = { mcpServers: { ...MCPService.DEFAULT_SERVERS } };
      fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), 'utf8');
    }
  }

  loadServers(): Record<string, MCPServerConfig> {
    try {
      return (JSON.parse(fs.readFileSync(this._configPath, 'utf8')) as MCPConfig).mcpServers || {};
    } catch { return {}; }
  }

  saveServer(name: string, config: MCPServerConfig): void {
    const allConfig = this._loadConfig();
    allConfig.mcpServers[name] = config;
    this._writeConfig(allConfig);
  }

  deleteServer(name: string): boolean {
    const allConfig = this._loadConfig();
    if (!(name in allConfig.mcpServers)) return false;
    delete allConfig.mcpServers[name];
    this._writeConfig(allConfig);
    return true;
  }

  private _loadConfig(): MCPConfig {
    try { return JSON.parse(fs.readFileSync(this._configPath, 'utf8')) as MCPConfig; }
    catch { return { mcpServers: {} }; }
  }

  private _writeConfig(config: MCPConfig): void {
    fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}

// ============================================================================
// ConversationService
// ============================================================================

export class ConversationService {
  private _conversationsDir: string;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._conversationsDir = path.join(_context.globalStorageUri.fsPath, 'conversations');
    if (!fs.existsSync(this._conversationsDir)) fs.mkdirSync(this._conversationsDir, { recursive: true });
  }

  async saveConversation(
    sessionId: string, messages: ConversationMessage[],
    totalCost: number, totalTokensInput: number, totalTokensOutput: number,
  ): Promise<void> {
    if (!sessionId || messages.length === 0) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversation-${timestamp}.json`;
    const filePath = path.join(this._conversationsDir, filename);
    const startTime = messages[0]?.timestamp;
    const endTime = messages[messages.length - 1]?.timestamp || new Date().toISOString();

    const conversationData: ConversationData = {
      sessionId, startTime, endTime,
      messageCount: messages.length, totalCost,
      totalTokens: { input: totalTokensInput, output: totalTokensOutput },
      messages, filename,
    };

    try {
      fs.writeFileSync(filePath, JSON.stringify(conversationData, null, 2), 'utf8');
      await this._updateConversationIndex(conversationData);
    } catch (err) { console.error('Failed to save conversation:', err); }
  }

  loadConversation(filename: string): ConversationData | null {
    try {
      return JSON.parse(fs.readFileSync(path.join(this._conversationsDir, filename), 'utf8')) as ConversationData;
    } catch { console.error(`Failed to load conversation: ${filename}`); return null; }
  }

  getConversationList(): ConversationIndexEntry[] {
    const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
    // Auto-rebuild entries with missing firstUserMessage (one-time migration)
    const needsRebuild = index.some((e) => !e.firstUserMessage);
    if (needsRebuild) { void this._rebuildIndex(); }
    // Deduplicate by sessionId (keep latest endTime), then sort
    const seen = new Map<string, ConversationIndexEntry>();
    for (const entry of index) {
      const existing = seen.get(entry.sessionId);
      if (!existing || new Date(entry.endTime).getTime() > new Date(existing.endTime).getTime()) {
        seen.set(entry.sessionId, entry);
      }
    }
    return [...seen.values()].sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
  }

  private async _rebuildIndex(): Promise<void> {
    if (!fs.existsSync(this._conversationsDir)) return;
    const files = fs.readdirSync(this._conversationsDir).filter((f) => f.endsWith('.json'));
    const newIndex: ConversationIndexEntry[] = [];
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this._conversationsDir, file), 'utf8')) as ConversationData;
        let firstUserMessage = '';
        let lastUserMessage = '';
        for (const msg of data.messages) {
          if (msg.messageType === 'userInput') {
            const text = typeof msg.data === 'string'
              ? msg.data
              : (msg.data && typeof msg.data === 'object' && 'text' in msg.data ? String((msg.data as Record<string, unknown>).text) : '');
            if (text && !firstUserMessage) firstUserMessage = text;
            if (text) lastUserMessage = text;
          }
        }
        newIndex.push({
          filename: data.filename || file, sessionId: data.sessionId,
          startTime: data.startTime || data.endTime, endTime: data.endTime,
          messageCount: data.messageCount, totalCost: data.totalCost,
          firstUserMessage: firstUserMessage.substring(0, 100),
          lastUserMessage: lastUserMessage.substring(0, 100),
        });
      } catch { /* skip corrupted files */ }
    }
    const sorted = newIndex.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()).slice(0, 100);
    await this._context.globalState.update('claude.conversationIndex', sorted);
  }

  async deleteConversation(filename: string): Promise<boolean> {
    const filePath = path.join(this._conversationsDir, filename);
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
      await this._context.globalState.update('claude.conversationIndex', index.filter((e) => e.filename !== filename));
      return true;
    } catch (err) { console.error('Failed to delete conversation:', err); return false; }
  }

  searchConversations(query: string): ConversationIndexEntry[] {
    if (!query.trim()) return this.getConversationList();
    const lower = query.toLowerCase();
    return this.getConversationList().filter((entry) =>
      entry.firstUserMessage.toLowerCase().includes(lower) ||
      entry.lastUserMessage.toLowerCase().includes(lower),
    );
  }

  exportConversation(filename: string): string | null {
    const conversation = this.loadConversation(filename);
    return conversation ? JSON.stringify(conversation, null, 2) : null;
  }

  getLatestSessionId(): string | undefined {
    const list = this.getConversationList();
    return list.length > 0 ? list[0].sessionId : undefined;
  }

  getLatestConversation(): ConversationData | null {
    const list = this.getConversationList();
    if (list.length === 0) return null;
    return this.loadConversation(list[0].filename);
  }

  private async _updateConversationIndex(data: ConversationData): Promise<void> {
    const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
    let firstUserMessage = '';
    let lastUserMessage = '';
    for (const msg of data.messages) {
      if (msg.messageType === 'userInput') {
        const text = typeof msg.data === 'string'
          ? msg.data
          : (msg.data && typeof msg.data === 'object' && 'text' in msg.data ? String((msg.data as Record<string, unknown>).text) : '');
        if (text && !firstUserMessage) firstUserMessage = text;
        if (text) lastUserMessage = text;
      }
    }
    const filtered = index.filter((e) => e.sessionId !== data.sessionId);
    filtered.push({
      filename: data.filename, sessionId: data.sessionId,
      startTime: data.startTime || data.endTime, endTime: data.endTime,
      messageCount: data.messageCount, totalCost: data.totalCost,
      firstUserMessage: firstUserMessage.substring(0, 100),
      lastUserMessage: lastUserMessage.substring(0, 100),
    });
    const trimmed = filtered
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
      .slice(0, 100);
    await this._context.globalState.update('claude.conversationIndex', trimmed);
  }
}

