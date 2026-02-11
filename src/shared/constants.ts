// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/**
 * Thinking intensity levels
 */
export enum ThinkingIntensity {
    Think = "think",
    ThinkHard = "think-hard",
    ThinkHarder = "think-harder",
    Ultrathink = "ultrathink",
}

/** Thinking intensity levels with output constraints */
export const THINKING_INTENSITIES = {
    think: "Think briefly, then give a concise and actionable answer.",
    "think-hard":
        "THINK HARD about this step by step. Be thorough but keep your response focused. Prefer code over explanation.",
    "think-harder":
        "THINK HARDER THROUGH THIS STEP BY STEP. Analyze carefully and consider edge cases, but converge on a precise, actionable solution. Avoid over-explaining \u2014 show, don't tell.",
    ultrathink:
        "ULTRATHINK: Perform deep analysis. Consider all approaches, trade-offs, and edge cases. Then provide the optimal solution with clear but concise reasoning. Prioritize correctness and code over verbose explanation.",
} as const;

/** File-editing tools that need before/after diff */
export const FILE_EDIT_TOOLS: string[] = ["Edit", "MultiEdit", "Write"];

/** Tools whose results are hidden by default (unless error) */
export const HIDDEN_RESULT_TOOLS: string[] = ["Read", "TodoWrite"];

/** Default context window limit for Claude models (tokens) */
export const MODEL_CONTEXT_LIMIT = 200_000;

/** File extensions excluded from workspace file search */
export const FILE_SEARCH_EXCLUDES =
    "**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/target/**,**/bin/**,**/obj/**";
