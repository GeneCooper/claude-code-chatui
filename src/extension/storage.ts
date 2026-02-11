import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import type {
  ConversationData, ConversationMessage, ConversationIndexEntry,
  BackupCommit, MCPServerConfig, MCPConfig, UsageData,
} from '../shared/types';

// ============================================================================
// RateLimitCache
// ============================================================================

export interface CachedRateLimits {
  session5h: number;
  weekly7d: number;
  reset5h?: number;
  reset7d?: number;
  timestamp: number;
}

const CACHE_FILE_PATH = path.join(os.homedir(), '.claude', 'rate-limit-cache.json');

export function readRateLimitCache(): CachedRateLimits | null {
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) return null;
    const data = JSON.parse(fs.readFileSync(CACHE_FILE_PATH, 'utf-8')) as CachedRateLimits;
    if (typeof data.session5h !== 'number' || typeof data.weekly7d !== 'number' || typeof data.timestamp !== 'number') return null;
    return data;
  } catch { return null; }
}

export function writeRateLimitCache(data: Omit<CachedRateLimits, 'timestamp'>): void {
  try {
    const claudeDir = path.dirname(CACHE_FILE_PATH);
    if (!fs.existsSync(claudeDir)) fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify({ ...data, timestamp: Date.now() }, null, 2), 'utf-8');
  } catch { /* silently fail */ }
}

export function getCacheAgeMinutes(cache: CachedRateLimits): number {
  return Math.round((Date.now() - cache.timestamp) / (60 * 1000));
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
    return [...index].sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime());
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

// ============================================================================
// UsageService
// ============================================================================

const POLLING_INTERVAL_MS = 5 * 60 * 1000;
const COMMAND_TIMEOUT_MS = 60_000;

interface RateLimitData {
  session5h: number;
  weekly7d: number;
  reset5h?: number;
  reset7d?: number;
}

export class UsageService implements vscode.Disposable {
  private _usageData: UsageData | undefined;
  private _pollInterval: NodeJS.Timeout | undefined;
  private _dataEmitter = new EventEmitter();
  private _fetchInFlight: Promise<void> | null = null;
  private _currentProcess: ChildProcess | null = null;
  private _isDisposed = false;

  constructor(private readonly _outputChannel?: vscode.OutputChannel) {
    this._log('UsageService initializing');
    this._loadFromCache();
    this._startPolling();
  }

  private _log(message: string): void {
    this._outputChannel?.appendLine(`[UsageService] ${message}`);
  }

  private _loadFromCache(): void {
    const cache = readRateLimitCache();
    if (!cache) return;
    this._log(`Cache found (${getCacheAgeMinutes(cache)} minutes old)`);
    this._usageData = this._buildUsageDataFromCache(cache);
    this._dataEmitter.emit('update', this._usageData);
  }

  private _buildUsageDataFromCache(cache: CachedRateLimits): UsageData {
    return this._buildUsageDataFromRateLimits({
      session5h: cache.session5h, weekly7d: cache.weekly7d,
      reset5h: cache.reset5h, reset7d: cache.reset7d,
    });
  }

  onUsageUpdate(callback: (data: UsageData) => void): vscode.Disposable {
    this._dataEmitter.on('update', callback);
    return { dispose: () => { this._dataEmitter.off('update', callback); } };
  }

  onError(callback: (error: string) => void): vscode.Disposable {
    this._dataEmitter.on('error', callback);
    return { dispose: () => { this._dataEmitter.off('error', callback); } };
  }

  private _startPolling(): void {
    if (this._isDisposed) return;
    this._stopPolling();
    this._pollInterval = setInterval(() => { if (!this._isDisposed) void this.fetchUsageData(); }, POLLING_INTERVAL_MS);
    void this.fetchUsageData();
  }

  private _stopPolling(): void {
    if (this._pollInterval) { clearInterval(this._pollInterval); this._pollInterval = undefined; }
  }

  async fetchUsageData(): Promise<void> {
    if (this._isDisposed) return;
    if (this._fetchInFlight) { await this._fetchInFlight; return; }
    this._fetchInFlight = this._doFetch();
    try { await this._fetchInFlight; } finally { this._fetchInFlight = null; }
  }

  onClaudeSessionEnd(): void {
    setTimeout(() => { if (!this._isDisposed) void this.fetchUsageData(); }, 1000);
  }

  /** Accept rate-limit data parsed from the main Claude process stderr (real-time update). */
  updateFromRateLimits(data: { session5h?: number; weekly7d?: number; reset5h?: number; reset7d?: number }): void {
    if (this._isDisposed) return;
    const rateLimits: RateLimitData = {
      session5h: data.session5h ?? this._usageData?.currentSession.usageCost ?? 0,
      weekly7d: data.weekly7d ?? this._usageData?.weekly.costLikely ?? 0,
      reset5h: data.reset5h,
      reset7d: data.reset7d,
    };
    this._saveToCache(rateLimits);
    this._usageData = this._buildUsageDataFromRateLimits(rateLimits);
    this._dataEmitter.emit('update', this._usageData);
  }

  private async _doFetch(): Promise<void> {
    if (this._isDisposed) return;
    try {
      const usageData = await this._fetchFromClaudeCommand();
      if (usageData) {
        this._usageData = usageData;
        this._dataEmitter.emit('update', this._usageData);
      } else {
        const cache = readRateLimitCache();
        if (cache) {
          const cachedData = this._buildUsageDataFromCache(cache);
          this._usageData = cachedData;
          this._dataEmitter.emit('update', cachedData);
        }
      }
    } catch (error) {
      this._log(`Failed to fetch: ${error instanceof Error ? error.message : String(error)}`);
      this._dataEmitter.emit('error', 'Error getting usage');
    }
  }

  private async _fetchFromClaudeCommand(): Promise<UsageData | null> {
    if (this._isDisposed) return null;
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let resolved = false;
      let timeoutId: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
        if (this._currentProcess) {
          this._currentProcess.stdout?.removeAllListeners();
          this._currentProcess.stderr?.removeAllListeners();
          this._currentProcess.removeAllListeners();
          this._currentProcess = null;
        }
      };
      const safeResolve = (value: UsageData | null) => {
        if (!resolved) { resolved = true; cleanup(); resolve(value); }
      };

      timeoutId = setTimeout(() => {
        this._log('Command timed out after 60s');
        if (this._currentProcess && !this._currentProcess.killed) this._currentProcess.kill('SIGTERM');
        safeResolve(null);
      }, COMMAND_TIMEOUT_MS);

      try {
        this._currentProcess = spawn('claude', ['-p', '.', '--output-format', 'json', '--model', 'claude-haiku-4-5-20251001'], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
          env: { ...process.env, ANTHROPIC_LOG: 'debug' },
        });
        this._currentProcess.stdout?.on('data', (data: Buffer) => { stdout += data.toString(); });
        this._currentProcess.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); });
        this._currentProcess.on('close', () => {
          const combined = stdout + '\n' + stderr;
          const rateLimits = this._parseRateLimitHeaders(combined);
          if (rateLimits) { this._saveToCache(rateLimits); safeResolve(this._buildUsageDataFromRateLimits(rateLimits)); }
          else safeResolve(null);
        });
        this._currentProcess.on('error', () => { safeResolve(null); });
      } catch { safeResolve(null); }
    });
  }

  private _parseRateLimitHeaders(output: string): RateLimitData | null {
    let session5h: number | undefined;
    let weekly7d: number | undefined;
    let reset5h: number | undefined;
    let reset7d: number | undefined;
    if (!output.includes('ratelimit') && !output.includes('utilization')) return null;

    const match5h = output.match(/["']?anthropic-ratelimit-unified-5h-utilization["']?\s*[":]\s*["']?([0-9.]+)/i);
    if (match5h) { const v = parseFloat(match5h[1]); if (!isNaN(v) && v >= 0 && v <= 2) session5h = Math.min(1, v); }

    const match7d = output.match(/["']?anthropic-ratelimit-unified-7d-utilization["']?\s*[":]\s*["']?([0-9.]+)/i);
    if (match7d) { const v = parseFloat(match7d[1]); if (!isNaN(v) && v >= 0 && v <= 2) weekly7d = Math.min(1, v); }

    const matchReset5h = output.match(/["']?anthropic-ratelimit-unified-5h-reset["']?\s*[":]\s*["']?([0-9]+)/i);
    if (matchReset5h) reset5h = parseInt(matchReset5h[1], 10);

    const matchReset7d = output.match(/["']?anthropic-ratelimit-unified-7d-reset["']?\s*[":]\s*["']?([0-9]+)/i);
    if (matchReset7d) reset7d = parseInt(matchReset7d[1], 10);

    if (session5h === undefined && weekly7d === undefined) return null;
    return { session5h: session5h ?? 0, weekly7d: weekly7d ?? 0, reset5h, reset7d };
  }

  private _buildUsageDataFromRateLimits(rateLimits: RateLimitData): UsageData {
    return {
      currentSession: {
        usageCost: rateLimits.session5h, costLimit: 1,
        resetsIn: rateLimits.reset5h ? this._formatResetTime(rateLimits.reset5h) : '~5 hr',
      },
      weekly: {
        costLikely: rateLimits.weekly7d, costLimit: 1,
        resetsAt: rateLimits.reset7d ? this._formatResetTime(rateLimits.reset7d) : '~7 days',
      },
    };
  }

  private _formatResetTime(timestamp: number): string {
    const resetDate = new Date(timestamp * 1000);
    const diffMs = resetDate.getTime() - Date.now();
    if (diffMs <= 0) return 'Now';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const parts: string[] = [];
    if (diffHours > 0) parts.push(`${diffHours} hr`);
    if (diffMinutes > 0 || parts.length === 0) parts.push(`${diffMinutes} min`);
    const timeStr = resetDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    if (diffHours >= 24) {
      return `${resetDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at ${timeStr}`;
    }
    return `${parts.join(' ')} @ ${timeStr}`;
  }

  private _saveToCache(rateLimits: RateLimitData): void {
    writeRateLimitCache({ session5h: rateLimits.session5h, weekly7d: rateLimits.weekly7d, reset5h: rateLimits.reset5h, reset7d: rateLimits.reset7d });
  }

  get currentUsage(): UsageData | undefined { return this._usageData; }

  dispose(): void {
    this._isDisposed = true;
    this._stopPolling();
    this._dataEmitter.removeAllListeners();
    if (this._currentProcess) {
      if (!this._currentProcess.killed) this._currentProcess.kill('SIGTERM');
      this._currentProcess.stdout?.removeAllListeners();
      this._currentProcess.stderr?.removeAllListeners();
      this._currentProcess.removeAllListeners();
      this._currentProcess = null;
    }
  }
}
