// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/** Default discussion roles for multi-agent mode */
export const DEFAULT_DISCUSSION_ROLES: Array<{ id: string; name: string; prompt: string; color: string }> = [
    {
        id: 'architect',
        name: '架构师',
        prompt: '你是一位资深软件架构师。请从系统设计、模块化、设计模式、可维护性和长期可扩展性的角度来分析和评估。重点关注架构层面的问题。',
        color: '#3b82f6',
    },
    {
        id: 'security',
        name: '安全专家',
        prompt: '你是一位安全专家。请从安全漏洞、注入风险、认证授权问题、数据暴露和安全最佳实践的角度来分析。重点关注潜在的安全风险。',
        color: '#ef4444',
    },
    {
        id: 'performance',
        name: '性能工程师',
        prompt: '你是一位性能工程师。请从运行效率、内存使用、算法复杂度、缓存机会和潜在瓶颈的角度来分析。重点关注性能优化空间。',
        color: '#f59e0b',
    },
];

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
