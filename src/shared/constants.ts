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
