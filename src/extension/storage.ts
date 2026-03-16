import * as vscode from 'vscode';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';
import { spawn, type ChildProcess } from 'child_process';
import type {
  ConversationData, ConversationMessage, ConversationIndexEntry,
  MCPServerConfig, MCPConfig, UsageData, SkillConfig,
} from '../shared/types';

// ============================================================================
// RateLimitCache
// ============================================================================

interface CachedRateLimits {
  session5h: number;
  weekly7d: number;
  reset5h?: number;
  reset7d?: number;
  timestamp: number;
}

const CACHE_FILE_PATH = path.join(os.homedir(), '.claude', 'rate-limit-cache.json');

async function readRateLimitCache(): Promise<CachedRateLimits | null> {
  try {
    const raw = await fsp.readFile(CACHE_FILE_PATH, 'utf-8');
    const data = JSON.parse(raw) as CachedRateLimits;
    if (typeof data.session5h !== 'number' || typeof data.weekly7d !== 'number' || typeof data.timestamp !== 'number') return null;
    return data;
  } catch { return null; }
}

function writeRateLimitCache(data: Omit<CachedRateLimits, 'timestamp'>): void {
  const claudeDir = path.dirname(CACHE_FILE_PATH);
  void fsp.mkdir(claudeDir, { recursive: true }).then(() =>
    fsp.writeFile(CACHE_FILE_PATH, JSON.stringify({ ...data, timestamp: Date.now() }, null, 2), 'utf-8'),
  ).catch(() => { /* silently fail */ });
}

function getCacheAgeMinutes(cache: CachedRateLimits): number {
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
  };

  private _ensureConfigDir(): void {
    if (!fs.existsSync(this._configDir)) fs.mkdirSync(this._configDir, { recursive: true });
    if (!fs.existsSync(this._configPath)) {
      const config: MCPConfig = { mcpServers: { ...MCPService.DEFAULT_SERVERS } };
      fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), 'utf8');
    } else {
      this._migrateDefaults();
    }
  }

  /** Servers that were previously bundled as defaults but are now opt-in */
  private static readonly REMOVED_DEFAULTS = ['memory', 'fetch', 'playwright', 'magicui', 'shadcn'];

  private _migrateDefaults(): void {
    try {
      const config = JSON.parse(fs.readFileSync(this._configPath, 'utf8')) as MCPConfig;
      let changed = false;
      // Add any new defaults
      for (const [name, serverConfig] of Object.entries(MCPService.DEFAULT_SERVERS)) {
        if (!(name in config.mcpServers)) {
          config.mcpServers[name] = serverConfig;
          changed = true;
        }
      }
      // Remove old defaults that are no longer bundled (user can re-add manually)
      for (const name of MCPService.REMOVED_DEFAULTS) {
        if (name in config.mcpServers) {
          delete config.mcpServers[name];
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(this._configPath, JSON.stringify(config, null, 2), 'utf8');
      }
    } catch { /* ignore corrupted config */ }
  }

  loadServers(): Record<string, MCPServerConfig> {
    try {
      return (JSON.parse(fs.readFileSync(this._configPath, 'utf8')) as MCPConfig).mcpServers || {};
    } catch { return {}; }
  }

  async saveServer(name: string, config: MCPServerConfig): Promise<void> {
    const allConfig = await this._loadConfigAsync();
    allConfig.mcpServers[name] = config;
    await this._writeConfigAsync(allConfig);
  }

  async deleteServer(name: string): Promise<boolean> {
    const allConfig = await this._loadConfigAsync();
    if (!(name in allConfig.mcpServers)) return false;
    delete allConfig.mcpServers[name];
    await this._writeConfigAsync(allConfig);
    return true;
  }

  private _loadConfig(): MCPConfig {
    try { return JSON.parse(fs.readFileSync(this._configPath, 'utf8')) as MCPConfig; }
    catch { return { mcpServers: {} }; }
  }

  private async _loadConfigAsync(): Promise<MCPConfig> {
    try { return JSON.parse(await fsp.readFile(this._configPath, 'utf8')) as MCPConfig; }
    catch { return { mcpServers: {} }; }
  }

  private async _writeConfigAsync(config: MCPConfig): Promise<void> {
    await fsp.writeFile(this._configPath, JSON.stringify(config, null, 2), 'utf8');
  }
}

// ============================================================================
// SkillService
// ============================================================================

export class SkillService {
  private _skillsDir: string;

  constructor() {
    this._skillsDir = path.join(os.homedir(), '.claude', 'skills');
    this._ensureDir();
  }

  private _ensureDir(): void {
    if (!fs.existsSync(this._skillsDir)) {
      fs.mkdirSync(this._skillsDir, { recursive: true });
    }
  }

  /** Parse a skill file (with optional YAML frontmatter) into SkillConfig */
  private _parseSkillFile(filePath: string, fallbackName?: string): SkillConfig | null {
    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      const baseName = path.basename(filePath);
      let name = fallbackName ?? baseName.replace(/\.md$/, '');
      let description = '';
      let content = raw;

      const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
      if (fmMatch) {
        const frontmatter = fmMatch[1];
        content = fmMatch[2].trim();

        const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
        if (nameMatch) name = nameMatch[1].trim().replace(/^["']|["']$/g, '');

        const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
        if (descMatch) description = descMatch[1].trim().replace(/^["']|["']$/g, '');
      }

      return { name, description, content, filePath, enabled: true };
    } catch { return null; }
  }

  /** Load all skills from ~/.claude/skills/ — supports 3 formats:
   *  1. Flat .md files (our custom format)
   *  2. Subdirectories containing SKILL.md (CLI plugin format)
   *  3. Files without extension (CLI flat format with frontmatter)
   */
  loadSkills(): Record<string, SkillConfig> {
    const result: Record<string, SkillConfig> = {};
    try {
      const entries = fs.readdirSync(this._skillsDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(this._skillsDir, entry.name);
        // Resolve symlinks to get the real type
        let isDir = entry.isDirectory();
        let isFile = entry.isFile();
        if (entry.isSymbolicLink()) {
          try {
            const stat = fs.statSync(fullPath);
            isDir = stat.isDirectory();
            isFile = stat.isFile();
          } catch { continue; } // broken symlink
        }

        if (isDir) {
          // Format 2: directory with SKILL.md inside
          const skillMdPath = path.join(fullPath, 'SKILL.md');
          if (fs.existsSync(skillMdPath)) {
            const skill = this._parseSkillFile(skillMdPath, entry.name);
            if (skill) result[skill.name] = skill;
          }
        } else if (isFile) {
          // Format 1 (.md) and Format 3 (no extension)
          const skill = this._parseSkillFile(fullPath, entry.name.replace(/\.md$/, ''));
          if (skill) result[skill.name] = skill;
        }
      }
    } catch { /* directory read failed */ }
    return result;
  }

  /** Save a skill as a SKILL.md file */
  async saveSkill(name: string, description: string, content: string): Promise<void> {
    this._ensureDir();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase();
    const filePath = path.join(this._skillsDir, `${safeName}.md`);
    const fileContent = `---\nname: ${name}\ndescription: ${description}\n---\n\n${content}`;
    await fsp.writeFile(filePath, fileContent, 'utf8');
  }

  /** Delete a skill by name — handles all formats */
  async deleteSkill(name: string): Promise<boolean> {
    const skills = this.loadSkills();
    const skill = skills[name];
    if (!skill) return false;
    try {
      // For directory-based skills, filePath points to dir/SKILL.md — remove the parent dir
      const parentDir = path.dirname(skill.filePath);
      if (parentDir !== this._skillsDir) {
        await fsp.rm(parentDir, { recursive: true });
      } else {
        await fsp.unlink(skill.filePath);
      }
      return true;
    } catch { return false; }
  }
}

// ============================================================================
// ConversationService
// ============================================================================

export class ConversationService {
  /** Max conversations to keep on disk. Older ones are auto-deleted. */
  private static readonly MAX_CONVERSATIONS = 100;
  private _conversationsDir: string;
  private _workspacePath: string | undefined;
  /** Maps sessionId → filename for dedup (same session overwrites same file) */
  private _sessionFileMap = new Map<string, string>();

  constructor(private readonly _context: vscode.ExtensionContext) {
    this._conversationsDir = path.join(_context.globalStorageUri.fsPath, 'conversations');
    if (!fs.existsSync(this._conversationsDir)) fs.mkdirSync(this._conversationsDir, { recursive: true });
    this._workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    this._buildSessionFileMap();
  }

  /** Scan existing files to populate the sessionId → filename map */
  private _buildSessionFileMap(): void {
    try {
      const deletedFiles = new Set<string>();
      const files = fs.readdirSync(this._conversationsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(this._conversationsDir, file), 'utf8');
          const data = JSON.parse(raw) as ConversationData;
          if (data.sessionId) {
            const existing = this._sessionFileMap.get(data.sessionId);
            if (existing) {
              // Keep the newer file, delete the older one
              try { fs.unlinkSync(path.join(this._conversationsDir, existing)); deletedFiles.add(existing); } catch {}
            }
            this._sessionFileMap.set(data.sessionId, file);
          }
        } catch { /* skip corrupted */ }
      }
      // Sync index: remove entries pointing to deleted duplicate files
      if (deletedFiles.size > 0) {
        const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
        const cleaned = index.filter((e) => !deletedFiles.has(e.filename));
        if (cleaned.length !== index.length) {
          void this._context.globalState.update('claude.conversationIndex', cleaned);
        }
      }
    } catch { /* dir read failed */ }
  }

  async saveConversation(
    sessionId: string, messages: ConversationMessage[],
    totalCost: number, totalTokensInput: number, totalTokensOutput: number,
  ): Promise<void> {
    if (!sessionId || messages.length === 0) return;

    // Reuse existing filename for same session, or create new one
    let filename = this._sessionFileMap.get(sessionId);
    if (!filename) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      filename = `conversation-${timestamp}.json`;
      this._sessionFileMap.set(sessionId, filename);
    }
    const filePath = path.join(this._conversationsDir, filename);
    const startTime = messages[0]?.timestamp;
    const endTime = messages[messages.length - 1]?.timestamp || new Date().toISOString();

    const conversationData: ConversationData = {
      sessionId, startTime, endTime,
      messageCount: messages.length, totalCost,
      totalTokens: { input: totalTokensInput, output: totalTokensOutput },
      messages, filename,
      workspacePath: this._workspacePath,
    };

    try {
      // Write without pretty-print to save ~30% disk space
      await fsp.writeFile(filePath, JSON.stringify(conversationData), 'utf8');
      await this._updateConversationIndex(conversationData);
      // Auto-cleanup old conversations beyond the limit
      void this._cleanupOldConversations();
    } catch (err) { console.error('Failed to save conversation:', err); }
  }

  /** Remove oldest conversation files when exceeding MAX_CONVERSATIONS */
  private async _cleanupOldConversations(): Promise<void> {
    try {
      const files = (await fsp.readdir(this._conversationsDir)).filter((f) => f.endsWith('.json'));
      if (files.length <= ConversationService.MAX_CONVERSATIONS) return;

      // Sort by filename (contains timestamp) — oldest first
      files.sort();
      const toDelete = new Set(files.slice(0, files.length - ConversationService.MAX_CONVERSATIONS));
      for (const file of toDelete) {
        try {
          await fsp.unlink(path.join(this._conversationsDir, file));
          // Remove from session map
          for (const [sid, fname] of this._sessionFileMap) {
            if (fname === file) { this._sessionFileMap.delete(sid); break; }
          }
        } catch { /* ignore */ }
      }
      // Sync the index: remove entries whose files were deleted
      const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
      const cleaned = index.filter((e) => !toDelete.has(e.filename));
      if (cleaned.length !== index.length) {
        await this._context.globalState.update('claude.conversationIndex', cleaned);
      }
    } catch { /* ignore */ }
  }

  async loadConversation(filename: string): Promise<ConversationData | null> {
    try {
      const raw = await fsp.readFile(path.join(this._conversationsDir, filename), 'utf8');
      return JSON.parse(raw) as ConversationData;
    } catch { console.error(`Failed to load conversation: ${filename}`); return null; }
  }

  getConversationList(): ConversationIndexEntry[] {
    const index = this._context.globalState.get<ConversationIndexEntry[]>('claude.conversationIndex', []);
    // Auto-rebuild entries with missing firstUserMessage (one-time migration)
    const needsRebuild = index.some((e) => !e.firstUserMessage);
    if (needsRebuild) { void this._rebuildIndex(); }
    // Filter by current workspace
    const filtered = this._workspacePath
      ? index.filter((e) => e.workspacePath === this._workspacePath)
      : index;
    // Deduplicate by sessionId (keep latest endTime), then sort
    const seen = new Map<string, ConversationIndexEntry>();
    for (const entry of filtered) {
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
          workspacePath: data.workspacePath,
          summary: this._generateSummary(data.messages),
        });
      } catch { /* skip corrupted files */ }
    }
    const sorted = newIndex.sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime()).slice(0, 100);
    await this._context.globalState.update('claude.conversationIndex', sorted);
  }

  searchConversations(query: string): ConversationIndexEntry[] {
    if (!query.trim()) return this.getConversationList();
    const lower = query.toLowerCase();
    return this.getConversationList().filter((entry) =>
      entry.firstUserMessage.toLowerCase().includes(lower) ||
      entry.lastUserMessage.toLowerCase().includes(lower) ||
      (entry.summary && entry.summary.toLowerCase().includes(lower)),
    );
  }

  getLatestSessionId(): string | undefined {
    const list = this.getConversationList();
    return list.length > 0 ? list[0].sessionId : undefined;
  }

  async findBySessionId(sessionId: string): Promise<ConversationData | null> {
    const list = this.getConversationList();
    const entry = list.find((e) => e.sessionId === sessionId);
    if (!entry) return null;
    return this.loadConversation(entry.filename);
  }

  async getLatestConversation(): Promise<ConversationData | null> {
    const list = this.getConversationList();
    if (list.length === 0) return null;
    return this.loadConversation(list[0].filename);
  }

  /** Extract a concise summary title from conversation messages */
  private _generateSummary(messages: ConversationMessage[]): string {
    let firstUserMessage = '';
    let firstAssistantText = '';
    const toolNames = new Set<string>();

    for (const msg of messages) {
      if (msg.messageType === 'userInput' && !firstUserMessage) {
        const text = typeof msg.data === 'string'
          ? msg.data
          : (msg.data && typeof msg.data === 'object' && 'text' in msg.data ? String((msg.data as Record<string, unknown>).text) : '');
        if (text) firstUserMessage = text;
      }
      if (msg.messageType === 'output' && !firstAssistantText) {
        const text = typeof msg.data === 'string' ? msg.data : '';
        if (text && text.length > 5) firstAssistantText = text;
      }
      if (msg.messageType === 'toolUse') {
        const d = msg.data as Record<string, unknown> | undefined;
        const name = d?.toolName as string | undefined;
        if (name) toolNames.add(name);
      }
    }

    // Strategy: use assistant's first response as summary (it usually describes what it's doing)
    // Fallback to user's first message if no assistant response
    let summary = '';
    if (firstAssistantText) {
      // Take first meaningful sentence from assistant response
      const cleaned = firstAssistantText
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/\n{2,}/g, '\n')
        .trim();
      // Get first sentence or first line
      const sentenceMatch = cleaned.match(/^(.+?[。.!！?？\n])/);
      summary = sentenceMatch ? sentenceMatch[1].trim() : cleaned.split('\n')[0].trim();
    }

    if (!summary && firstUserMessage) {
      summary = firstUserMessage;
    }

    // Append tool tags for quick visual context
    if (toolNames.size > 0) {
      const keyTools = [...toolNames]
        .filter(t => !['TodoWrite', 'Task'].includes(t))
        .slice(0, 3);
      if (keyTools.length > 0 && summary.length < 60) {
        summary += ` [${keyTools.join(', ')}]`;
      }
    }

    return summary.substring(0, 120);
  }

  /** Build a context summary for resuming a conversation */
  buildContextSummary(messages: ConversationMessage[]): string {
    const userMessages: string[] = [];
    const assistantSnippets: string[] = [];
    const toolsUsed = new Set<string>();
    const filesModified = new Set<string>();

    for (const msg of messages) {
      if (msg.messageType === 'userInput') {
        const text = typeof msg.data === 'string'
          ? msg.data
          : (msg.data && typeof msg.data === 'object' && 'text' in msg.data ? String((msg.data as Record<string, unknown>).text) : '');
        if (text) userMessages.push(text.substring(0, 200));
      }
      if (msg.messageType === 'output') {
        const text = typeof msg.data === 'string' ? msg.data : '';
        if (text && text.length > 10) {
          // Keep first 200 chars of each assistant response
          assistantSnippets.push(text.substring(0, 200));
        }
      }
      if (msg.messageType === 'toolUse') {
        const d = msg.data as Record<string, unknown> | undefined;
        const name = d?.toolName as string | undefined;
        if (name) toolsUsed.add(name);
        // Track file modifications
        const raw = d?.rawInput as Record<string, unknown> | undefined;
        const filePath = (raw?.file_path ?? raw?.path) as string | undefined;
        if (filePath && (name === 'Edit' || name === 'Write' || name === 'Read')) {
          filesModified.add(filePath);
        }
      }
    }

    const parts: string[] = ['[Previous Conversation Context - This is a resumed conversation. Here is what was discussed previously:]'];

    if (userMessages.length > 0) {
      // Include up to 5 user messages for context
      const selected = userMessages.length <= 5
        ? userMessages
        : [userMessages[0], ...userMessages.slice(-4)];
      parts.push('User requests:\n' + selected.map((m, i) => `${i + 1}. ${m}`).join('\n'));
    }

    if (assistantSnippets.length > 0) {
      // Include first and last assistant response
      const snippets = assistantSnippets.length <= 3
        ? assistantSnippets
        : [assistantSnippets[0], assistantSnippets[assistantSnippets.length - 1]];
      parts.push('Key assistant responses:\n' + snippets.map(s => `- ${s}`).join('\n'));
    }

    if (toolsUsed.size > 0) {
      parts.push(`Tools used: ${[...toolsUsed].join(', ')}`);
    }

    if (filesModified.size > 0) {
      const files = [...filesModified].slice(0, 10);
      parts.push(`Files involved: ${files.join(', ')}`);
    }

    parts.push('[/Previous Conversation Context]');
    return parts.join('\n\n');
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
    const summary = this._generateSummary(data.messages);
    const filtered = index.filter((e) => e.sessionId !== data.sessionId);
    filtered.push({
      filename: data.filename, sessionId: data.sessionId,
      startTime: data.startTime || data.endTime, endTime: data.endTime,
      messageCount: data.messageCount, totalCost: data.totalCost,
      firstUserMessage: firstUserMessage.substring(0, 100),
      lastUserMessage: lastUserMessage.substring(0, 100),
      workspacePath: data.workspacePath,
      summary,
    });
    const trimmed = filtered
      .sort((a, b) => new Date(b.endTime).getTime() - new Date(a.endTime).getTime())
      .slice(0, 100);
    await this._context.globalState.update('claude.conversationIndex', trimmed);
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

  private _pollingStarted = false;

  constructor(private readonly _outputChannel?: vscode.OutputChannel) {
    this._log('UsageService initializing (deferred polling)');
    this._loadFromCache();
    // Polling is deferred — call startPollingIfNeeded() when first panel is created
  }

  /** Start polling lazily — called when the first panel or sidebar is created. */
  startPollingIfNeeded(): void {
    if (this._pollingStarted || this._isDisposed) return;
    this._pollingStarted = true;
    this._startPolling();
  }

  private _log(message: string): void {
    this._outputChannel?.appendLine(`[UsageService] ${message}`);
  }

  private _loadFromCache(): void {
    void readRateLimitCache().then((cache) => {
      if (!cache) return;
      this._log(`Cache found (${getCacheAgeMinutes(cache)} minutes old)`);
      this._usageData = this._buildUsageDataFromCache(cache);
      this._dataEmitter.emit('update', this._usageData);
    });
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
        const cache = await readRateLimitCache();
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
