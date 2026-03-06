// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/**
 * System prompt — prepended to every user message as context-loss safety net.
 * Covers behaviors that CLI doesn't enforce and CLAUDE.md may lose in long conversations.
 * Keep lean (~100 tokens) to preserve reasoning budget.
 */
export const AGENT_SYSTEM_PROMPT = [
    "Reply in the same language the user uses.",
    "Read code before modifying it. Never edit files you haven't read.",
    "After editing code, verify for errors (compile/lint/type-check). Fix them before reporting done.",
    "Only change what was asked. Do not refactor surrounding code unless requested.",
    "If unsure, ask one specific question instead of guessing.",
    "Keep working until the task is fully resolved — do not stop halfway.",
].join("\n");

/** Subagent type badge colors — shared between JourneyTimeline and ToolUseBlock */
export const SUBAGENT_COLORS: Record<string, string> = {
    Bash: '#f59e0b',
    Explore: '#3b82f6',
    'general-purpose': '#10b981',
};

/** File-editing tools that need before/after diff */
export const FILE_EDIT_TOOLS: string[] = ["Edit", "MultiEdit", "Write", "NotebookEdit"];

/** Tools whose results are hidden by default (unless error) */
export const HIDDEN_RESULT_TOOLS: string[] = ["Read", "TodoWrite"];
