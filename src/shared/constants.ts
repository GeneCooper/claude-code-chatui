// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/**
 * Agent mode: fast (minimal token) vs deep (thorough analysis)
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
        "1. UNDERSTAND: Restate the core requirement in one sentence. If ambiguous, ask before proceeding.",
        "2. LOCATE: Find the relevant code with minimal tool calls. State what you found.",
        "3. EXECUTE: Make the changes. No narration during execution.",
        "4. SUMMARIZE: One sentence — what changed and why.",
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

/** Agent system prompt — appended via --append-system-prompt */
export const AGENT_SYSTEM_PROMPT = [
    "OUTPUT RULES:",
    "1. Act immediately — no preamble, no restating the question, no \"Let me...\".",
    "2. Call tools directly. Batch independent reads/searches in parallel.",
    "3. Code over prose. If asked to fix/change something, just do it.",
    "4. After completing work, reply with ONE short sentence summarizing what changed.",
    "5. No pleasantries, no bullet-list explanations, no unnecessary comments in code.",
    "6. If clarification is needed, ask ONE specific question — do not guess.",
].join(" ");

/** File-editing tools that need before/after diff */
export const FILE_EDIT_TOOLS: string[] = ["Edit", "MultiEdit", "Write"];

/** Tools whose results are hidden by default (unless error) */
export const HIDDEN_RESULT_TOOLS: string[] = ["Read", "TodoWrite"];

/** File extensions excluded from workspace file search */
export const FILE_SEARCH_EXCLUDES =
    "**/node_modules/**,**/.git/**,**/dist/**,**/build/**,**/.next/**,**/.nuxt/**,**/target/**,**/bin/**,**/obj/**";
