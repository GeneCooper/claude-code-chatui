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
  | { type: 'pickImageFile' }
  | { type: 'pickWorkspaceFile' }
  | { type: 'getClipboardText' }
  | { type: 'resolveDroppedFile'; uri: string }
  | { type: 'editMessage'; userInputIndex: number; newText: string }
  | { type: 'regenerateResponse' }
;

/** Messages from Extension to Webview */
type ExtensionToWebviewMessage =
  | { type: 'ready'; data: string }
  | { type: 'userInput'; data: { text: string; images?: string[] } }
  | { type: 'output'; data: string }
  | { type: 'thinking'; data: string }
  | { type: 'loading'; data: string }
  | { type: 'clearLoading' }
  | { type: 'error'; data: string }
  | { type: 'setProcessing'; data: { isProcessing: boolean } }
  | { type: 'sessionCleared' }
  | { type: 'sessionInfo'; data: { sessionId: string; tools: unknown[]; mcpServers?: unknown[] } }
  | { type: 'updateTotals'; data: TotalsData }
  | { type: 'updateTokens'; data: TokensData }
  | { type: 'toolUse'; data: ToolUseData }
  | { type: 'toolResult'; data: ToolResultData }
  | { type: 'permissionRequest'; data: PermissionRequestData }
  | { type: 'updatePermissionStatus'; data: { id: string; status: string } }
  | { type: 'compacting'; data: { isCompacting: boolean } }
  | { type: 'compactBoundary'; data: { trigger?: string; preTokens?: number } }
  | { type: 'showInstallModal' }
  | { type: 'restoreState'; state: unknown }
  | { type: 'conversationList'; data: ConversationIndexEntry[] }
  | { type: 'settingsData'; data: SettingsData }
  | { type: 'workspaceFiles'; data: WorkspaceFile[] }
  | { type: 'mcpServers'; data: Record<string, MCPServerConfig> }
  | { type: 'mcpServerSaved'; data: { name: string } }
  | { type: 'mcpServerDeleted'; data: { name: string } }
  | { type: 'mcpServerError'; data: { error: string } }
  | { type: 'slashCommands'; data: SlashCommand[] }
  | { type: 'showLoginRequired'; data: { message: string } }
  | { type: 'todosUpdate'; data: { todos: TodoItem[] } }
  | { type: 'installComplete'; data: { success: boolean; error?: string } }
  | { type: 'platformInfo'; data: { platform: string; isWindows: boolean } }
  | { type: 'imageFilePicked'; data: { name: string; dataUrl: string } }
  | { type: 'clipboardContent'; data: { text: string } }
  | { type: 'attachFileContext'; data: { filePath: string } }
  | { type: 'fileDropped'; data: { filePath: string } }
  | { type: 'editorSelection'; data: { filePath: string; startLine: number; endLine: number; text: string } | null }
  | { type: 'activeFileChanged'; data: { filePath: string; languageId: string } | null }
  | { type: 'batchReplay'; data: { messages: Array<{ type: string; data: unknown }>; sessionId?: string; totalCost?: number; isProcessing?: boolean } }
;

interface SettingsData {
  thinkingIntensity: string;
  yoloMode: boolean;
}

interface TotalsData {
  totalCost: number;
  totalTokensInput: number;
  totalTokensOutput: number;
  requestCount: number;
  currentCost?: number;
  currentDuration?: number;
  currentTurns?: number;
}

interface TokensData {
  totalTokensInput: number;
  totalTokensOutput: number;
  currentInputTokens: number;
  currentOutputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface ToolUseData {
  toolInfo: string;
  toolInput: string;
  rawInput: Record<string, unknown>;
  toolName: string;
  fileContentBefore?: string;
  startLine?: number;
  startLines?: number[];
}

interface ToolResultData {
  content: string;
  isError: boolean;
  toolUseId?: string;
  toolName?: string;
  rawInput?: Record<string, unknown>;
  fileContentBefore?: string;
  fileContentAfter?: string;
  startLine?: number;
  startLines?: number[];
  hidden?: boolean;
}

interface PermissionRequestData {
  id: string;
  tool: string;
  input: Record<string, unknown>;
  pattern?: string;
  suggestions?: PermissionSuggestion[];
  decisionReason?: string;
  blockedPath?: string;
  status: 'pending' | 'approved' | 'denied';
}
