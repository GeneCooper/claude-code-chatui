// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/**
 * Think mode: fast (minimal token) vs deep (thorough analysis)
 */
export enum AgentMode {
    Fast = "fast",
    Deep = "deep",
    Precise = "precise",
}

/** Agent mode prompts — injected as user message prefix */
export const AGENT_MODE_PROMPTS = {
    fast: "Be concise. Act immediately. Code over explanation. One-sentence summary when done.",
    deep: [
        "Follow this workflow strictly:",
        "PHASE 1 — RESEARCH:",
        "  1. UNDERSTAND: Verify your understanding is correct. If ambiguous, ask ONE clarifying question with concrete options.",
        "  2. LOCATE: Find the relevant code. Batch independent searches in parallel. State what you found.",
        "  3. ASSESS: Gauge complexity. Simple (≤3 files, clear change) → proceed. Complex (3+ files or architectural) → outline your plan in 3-5 bullet points before executing.",
        "PHASE 2 — IMPLEMENT:",
        "  4. EXECUTE: Make the changes. No narration during execution.",
        "  5. VERIFY: Check that the change does not break imports, types, or existing tests.",
        "PHASE 3 — REPORT:",
        "  6. SUMMARIZE: One sentence — what changed and why.",
    ].join("\n"),
    precise: [
        "ANTI-HALLUCINATION RULES — you MUST follow every rule below:",
        "1. NEVER fabricate file paths, function names, variable names, APIs, or CLI flags. If you haven't read it, don't cite it.",
        "2. When referencing code, ALWAYS include `file_path:line_number`. Read the file first if you haven't.",
        "3. If you are unsure or don't have enough context, say \"I'm not sure\" or \"I need to check\" — NEVER guess.",
        "4. Distinguish clearly between FACT (what the code says) and INFERENCE (what you think it means).",
        "5. When asked about behavior, READ the actual implementation before answering. Do not rely on names or comments alone.",
        "6. If a user's assumption seems wrong, point it out with evidence from code — don't just agree.",
        "7. Prefer showing relevant code snippets over paraphrasing. Let the code speak.",
        "8. When making changes, verify the target file and context exist BEFORE editing. Never edit blindly.",
    ].join("\n"),
} as const;

/** System prompt — concise rules that supplement CLAUDE.md (if present) or serve as standalone fallback */
export const AGENT_SYSTEM_PROMPT = [
    "1. Act immediately — no preamble. Code over prose.",
    "2. Batch independent tool calls in parallel.",
    "3. After completing work, reply with ONE short sentence summarizing what changed.",
    "4. If clarification is needed, ask ONE specific question — do not guess.",
    "5. CONTEXT-FIRST: On first message, scan package.json and key configs to understand the project before acting.",
    "6. MINIMAL CHANGE: Only modify what the user asked for. Do not refactor surrounding code unless requested.",
    "7. Never delete or overwrite files without reading them first.",
    "8. Reply in the same language the user uses.",
    "9. Never fabricate file paths, function names, or APIs. If unsure, say so.",
    "10. Keep working until the task is fully resolved.",
].join(" ");

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
