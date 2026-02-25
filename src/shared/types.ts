// ============================================================================
// Claude CLI Message Types (from stdout stream-json)
// ============================================================================

interface ClaudeCliMessage {
  type: 'system' | 'assistant' | 'user' | 'result';
}

// System messages
interface SystemInitMessage extends ClaudeCliMessage {
  type: 'system';
  subtype: 'init';
  session_id: string;
  tools?: unknown[];
  mcp_servers?: unknown[];
}

interface SystemStatusMessage extends ClaudeCliMessage {
  type: 'system';
  subtype: 'status';
  status: 'compacting' | null;
}

interface SystemCompactBoundaryMessage extends ClaudeCliMessage {
  type: 'system';
  subtype: 'compact_boundary';
  compact_metadata?: {
    trigger?: string;
    pre_tokens?: number;
  };
}

type SystemMessage = SystemInitMessage | SystemStatusMessage | SystemCompactBoundaryMessage;

// Content blocks
interface TextContent {
  type: 'text';
  text: string;
}

interface ThinkingContent {
  type: 'thinking';
  thinking: string;
}

interface ToolUseContent {
  type: 'tool_use';
  id?: string;
  tool_use_id?: string;
  name: string;
  input?: Record<string, unknown>;
}

interface ToolResultContent {
  type: 'tool_result';
  tool_use_id?: string;
  content?: string | unknown;
  is_error?: boolean;
}

type ContentBlock = TextContent | ThinkingContent | ToolUseContent | ToolResultContent;

// Token usage
interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// Assistant message
interface AssistantMessage extends ClaudeCliMessage {
  type: 'assistant';
  message?: {
    content: ContentBlock[];
    usage?: TokenUsage;
  };
}

// User message (tool results)
interface UserMessage extends ClaudeCliMessage {
  type: 'user';
  message?: {
    content: (TextContent | ToolResultContent)[];
  };
}

// Result message
interface ResultMessage extends ClaudeCliMessage {
  type: 'result';
  subtype: 'success' | 'error';
  session_id?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  num_turns?: number;
  is_error?: boolean;
  result?: string;
}

// Union type for all CLI messages
export type ClaudeMessage = SystemMessage | AssistantMessage | UserMessage | ResultMessage;

// ============================================================================
// Permission types
// ============================================================================

export interface PermissionRequest {
  requestId: string;
  toolName: string;
  input: Record<string, unknown>;
  suggestions?: PermissionSuggestion[];
  toolUseId: string;
  decisionReason?: string;
  blockedPath?: string;
  pattern?: string;
}

export interface PermissionSuggestion {
  type: 'allow' | 'deny' | 'allow_always';
  description?: string;
}

// ============================================================================
// Conversation types
// ============================================================================

export interface ConversationData {
  sessionId: string;
  startTime: string | undefined;
  endTime: string;
  messageCount: number;
  totalCost: number;
  totalTokens: {
    input: number;
    output: number;
  };
  messages: ConversationMessage[];
  filename: string;
}

export interface ConversationMessage {
  timestamp: string;
  messageType: string;
  data: unknown;
}

export interface ConversationIndexEntry {
  filename: string;
  sessionId: string;
  startTime: string;
  endTime: string;
  messageCount: number;
  totalCost: number;
  firstUserMessage: string;
  lastUserMessage: string;
}

// ============================================================================
// MCP types
// ============================================================================

export interface MCPServerConfig {
  type: 'stdio' | 'http' | 'sse';
  command?: string;
  url?: string;
  args?: string[];
  headers?: Record<string, string>;
}

export interface MCPConfig {
  mcpServers: Record<string, MCPServerConfig>;
}

// ============================================================================
// Backup types
// ============================================================================

export interface BackupCommit {
  id: string;
  sha: string;
  message: string;
  timestamp: string;
}

// ============================================================================
// File picker types
// ============================================================================

export interface WorkspaceFile {
  name: string;
  path: string;
  fsPath: string;
}

// ============================================================================
// Slash command types
// ============================================================================

export interface SlashCommand {
  command: string;
  description: string;
  category: 'snippet' | 'native';
}

// ============================================================================
// Usage types
// ============================================================================

export interface UsageData {
  currentSession: { usageCost: number; costLimit: number; resetsIn: string };
  weekly: { costLikely: number; costLimit: number; resetsAt: string };
}

// ============================================================================
// Todo types
// ============================================================================

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm?: string;
}

// ============================================================================
// Webview communication types
// ============================================================================

/** Messages from Webview to Extension */
export type WebviewToExtensionMessage =
  | { type: 'sendMessage'; text: string; planMode?: boolean; thinkingMode?: boolean; model?: string; images?: string[] }
  | { type: 'newSession' }
  | { type: 'createNewPanel' }
  | { type: 'rewindToMessage'; userInputIndex: number }

  | { type: 'stopRequest' }
  | { type: 'ready' }
  | { type: 'permissionResponse'; id: string; approved: boolean; alwaysAllow?: boolean }
  | { type: 'getConversationList' }
  | { type: 'loadConversation'; filename: string }
  | { type: 'openFile'; filePath: string }
  | { type: 'openExternal'; url: string }
  | { type: 'openDiff'; oldContent: string; newContent: string; filePath: string }
  | { type: 'getSettings' }
  | { type: 'updateSettings'; settings: Record<string, unknown> }
  | { type: 'selectModel'; model: string }
  | { type: 'openModelTerminal' }
  | { type: 'runInstallCommand' }
  | { type: 'saveInputText'; text: string }
  | { type: 'executeSlashCommand'; command: string }
  | { type: 'getWorkspaceFiles'; searchTerm?: string }
  | { type: 'loadMCPServers' }
  | { type: 'saveMCPServer'; name: string; config: MCPServerConfig }
  | { type: 'deleteMCPServer'; name: string }
  | { type: 'createBackup'; message: string }
  | { type: 'restoreBackup'; commitSha: string }
  | { type: 'refreshUsage' }
  | { type: 'openCCUsageTerminal' }
  | { type: 'pickImageFile' }
  | { type: 'pickWorkspaceFile' }
  | { type: 'getClipboardText' }
  | { type: 'resolveDroppedFile'; uri: string };

export interface ToolUseData {
  toolInfo: string;
  toolInput: string;
  rawInput: Record<string, unknown>;
  toolName: string;
  fileContentBefore?: string;
  startLine?: number;
  startLines?: number[];
}

