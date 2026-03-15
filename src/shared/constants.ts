// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/** Available role persona presets — user picks one to shape Claude's perspective for the session */
export const ROLE_PRESETS: Array<{ id: string; name: string; prompt: string; color: string }> = [
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
    {
        id: 'reviewer',
        name: '代码审查员',
        prompt: '你是一位严格的代码审查员。请从代码质量、命名规范、可读性、错误处理、边界条件和最佳实践的角度来审查。指出具体的问题并给出改进建议。',
        color: '#8b5cf6',
    },
    {
        id: 'devops',
        name: 'DevOps 工程师',
        prompt: '你是一位 DevOps 工程师。请从部署、CI/CD、容器化、监控、日志、可观测性和运维便利性的角度来分析。重点关注生产环境的可靠性。',
        color: '#06b6d4',
    },
    {
        id: 'frontend',
        name: '前端专家',
        prompt: '你是一位前端专家。请从用户体验、响应式设计、可访问性、浏览器兼容性、组件设计和前端性能的角度来分析。重点关注用户交互体验。',
        color: '#ec4899',
    },
    {
        id: 'backend',
        name: '后端专家',
        prompt: '你是一位后端专家。请从 API 设计、数据库建模、并发处理、错误恢复、数据一致性和服务可靠性的角度来分析。重点关注系统的健壮性。',
        color: '#10b981',
    },
    {
        id: 'testing',
        name: '测试工程师',
        prompt: '你是一位测试工程师。请从测试覆盖率、测试策略、边界情况、回归风险、可测试性和测试自动化的角度来分析。重点关注质量保证。',
        color: '#f97316',
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
