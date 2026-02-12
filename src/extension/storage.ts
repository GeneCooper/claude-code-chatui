import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type {
  ConversationData, ConversationMessage, ConversationIndexEntry,
  BackupCommit, MCPServerConfig, MCPConfig,
} from '../shared/types';

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

// ============================================================================
// BackupService
// ============================================================================

export class BackupService {
  private _backupDir: string;
  private _commits: BackupCommit[] = [];
  private _initialized = false;

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._backupDir = path.join(_context.globalStorageUri.fsPath, 'backups');
  }

  get commits(): BackupCommit[] { return this._commits; }

  async initialize(): Promise<void> {
    if (this._initialized) return;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;
    if (!fs.existsSync(this._backupDir)) fs.mkdirSync(this._backupDir, { recursive: true });
    const gitDir = path.join(this._backupDir, '.git');
    if (!fs.existsSync(gitDir)) {
      try {
        await this._exec(`git init --separate-git-dir "${gitDir}"`, workspaceFolder.uri.fsPath);
        await this._exec(`git --git-dir="${gitDir}" --work-tree="${workspaceFolder.uri.fsPath}" config user.email "backup@claude-code-chatui"`);
        await this._exec(`git --git-dir="${gitDir}" --work-tree="${workspaceFolder.uri.fsPath}" config user.name "Claude Code ChatUI Backup"`);
      } catch (err) { console.error('Failed to initialize backup repo:', err); return; }
    }
    this._initialized = true;
  }

  async createCheckpoint(userMessage: string): Promise<BackupCommit | null> {
    if (!this._initialized) await this.initialize();
    if (!this._initialized) return null;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return null;
    const gitDir = path.join(this._backupDir, '.git');
    const gitCmd = `git --git-dir="${gitDir}" --work-tree="${workspaceFolder.uri.fsPath}"`;
    try {
      await this._exec(`${gitCmd} add -A`);
      const truncated = userMessage.substring(0, 50) + (userMessage.length > 50 ? '...' : '');
      const isFirst = this._commits.length === 0;
      const status = await this._exec(`${gitCmd} status --porcelain`);
      const commitMessage = status.trim()
        ? (isFirst ? `Initial backup: ${truncated}` : `Before: ${truncated}`)
        : `Checkpoint (no changes): ${truncated}`;
      await this._exec(`${gitCmd} commit --allow-empty -m "${commitMessage.replace(/"/g, '\\"')}"`);
      const sha = (await this._exec(`${gitCmd} rev-parse HEAD`)).trim();
      const commit: BackupCommit = { id: `commit-${Date.now()}`, sha, message: commitMessage, timestamp: new Date().toISOString() };
      this._commits.push(commit);
      return commit;
    } catch (err) { console.error('Failed to create backup checkpoint:', err); return null; }
  }

  async restoreToCommit(commitSha: string): Promise<boolean> {
    if (!this._initialized) return false;
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return false;
    const gitDir = path.join(this._backupDir, '.git');
    const gitCmd = `git --git-dir="${gitDir}" --work-tree="${workspaceFolder.uri.fsPath}"`;
    try { await this._exec(`${gitCmd} checkout ${commitSha} -- .`); return true; }
    catch (err) { console.error('Failed to restore backup:', err); return false; }
  }

  private _exec(command: string, cwd?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      cp.exec(command, {
        cwd: cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
        shell: process.platform === 'win32' ? 'cmd.exe' : '/bin/sh',
      }, (err, stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message));
        else resolve(stdout);
      });
    });
  }
}
