/** Tool names that get special treatment */
export const TOOL_NAMES = {
  Read: 'Read',
  Write: 'Write',
  Edit: 'Edit',
  MultiEdit: 'MultiEdit',
  Bash: 'Bash',
  Glob: 'Glob',
  Grep: 'Grep',
  Task: 'Task',
  TodoRead: 'TodoRead',
  TodoWrite: 'TodoWrite',
  WebFetch: 'WebFetch',
  WebSearch: 'WebSearch',
} as const;

/** File-editing tools that need before/after diff */
export const FILE_EDIT_TOOLS: string[] = [TOOL_NAMES.Edit, TOOL_NAMES.MultiEdit, TOOL_NAMES.Write];

/** Tools whose results are hidden by default (unless error) */
export const HIDDEN_RESULT_TOOLS: string[] = [TOOL_NAMES.Read, TOOL_NAMES.TodoWrite];

/** Thinking intensity levels */
export const THINKING_INTENSITIES = {
  think: 'THINK',
  'think-hard': 'THINK HARD',
  'think-harder': 'THINK HARDER',
  ultrathink: 'ULTRATHINK',
} as const;

export type ThinkingIntensity = keyof typeof THINKING_INTENSITIES;

/** Slash commands available in the picker */
export const SLASH_COMMANDS = [
  // Prompt snippets
  { command: 'performance-analysis', description: 'Analyze code for performance issues', category: 'snippet' as const },
  { command: 'security-review', description: 'Review code for security vulnerabilities', category: 'snippet' as const },
  { command: 'implementation-review', description: 'Review implementation details', category: 'snippet' as const },
  { command: 'code-explanation', description: 'Explain how code works', category: 'snippet' as const },
  { command: 'bug-fix', description: 'Help fix bugs', category: 'snippet' as const },
  { command: 'refactor', description: 'Improve readability and maintainability', category: 'snippet' as const },
  { command: 'test-generation', description: 'Generate comprehensive tests', category: 'snippet' as const },
  { command: 'documentation', description: 'Generate code documentation', category: 'snippet' as const },
  // Native Claude commands
  { command: 'clear', description: 'Clear conversation', category: 'native' as const },
  { command: 'compact', description: 'Compact conversation', category: 'native' as const },
  { command: 'config', description: 'Configuration', category: 'native' as const },
  { command: 'cost', description: 'Show cost information', category: 'native' as const },
  { command: 'doctor', description: 'System diagnostics', category: 'native' as const },
  { command: 'help', description: 'Show help', category: 'native' as const },
  { command: 'init', description: 'Initialize project', category: 'native' as const },
  { command: 'login', description: 'Authentication', category: 'native' as const },
  { command: 'memory', description: 'Memory management', category: 'native' as const },
  { command: 'model', description: 'Model selection', category: 'native' as const },
  { command: 'permissions', description: 'Permissions management', category: 'native' as const },
  { command: 'review', description: 'Code review', category: 'native' as const },
  { command: 'status', description: 'Show status', category: 'native' as const },
  { command: 'usage', description: 'Show usage statistics', category: 'native' as const },
];

/** File extensions excluded from workspace file search */
export const FILE_SEARCH_EXCLUDES = '**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/target/**,**/bin/**,**/obj/**';
