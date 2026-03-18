// ============================================================================
// Shared Constants (only exports that are actually used)
// ============================================================================

/** Prompt snippet preset — reusable prompt fragments users can attach to messages */
export interface PromptSnippetPreset {
    id: string;
    name: string;
    prompt: string;
    color: string;
}

export const PROMPT_SNIPPET_PRESETS: PromptSnippetPreset[] = [
    {
        id: 'architect',
        name: '架构师',
        prompt: '请额外从软件架构的视角关注以下方面：系统设计、模块化、设计模式、可维护性和长期可扩展性。重点分析架构层面的问题。',
        color: '#3b82f6',
    },
    {
        id: 'security',
        name: '安全专家',
        prompt: '请额外从安全的视角关注以下方面：安全漏洞、注入风险、认证授权问题、数据暴露和安全最佳实践。重点分析潜在的安全风险。',
        color: '#ef4444',
    },
    {
        id: 'performance',
        name: '性能工程师',
        prompt: '请额外从性能的视角关注以下方面：运行效率、内存使用、算法复杂度、缓存机会和潜在瓶颈。重点分析性能优化空间。',
        color: '#f59e0b',
    },
    {
        id: 'reviewer',
        name: '代码审查员',
        prompt: '请额外从代码审查的视角关注以下方面：代码质量、命名规范、可读性、错误处理、边界条件和最佳实践。指出具体的问题并给出改进建议。',
        color: '#8b5cf6',
    },
    {
        id: 'devops',
        name: 'DevOps',
        prompt: '请额外从 DevOps 的视角关注以下方面：部署、CI/CD、容器化、监控、日志、可观测性和运维便利性。重点分析生产环境的可靠性。',
        color: '#06b6d4',
    },
    {
        id: 'frontend',
        name: '前端专家',
        prompt: '请额外从前端的视角关注以下方面：用户体验、响应式设计、可访问性、浏览器兼容性、组件设计和前端性能。重点关注用户交互体验。',
        color: '#ec4899',
    },
    {
        id: 'backend',
        name: '后端专家',
        prompt: '请额外从后端的视角关注以下方面：API 设计、数据库建模、并发处理、错误恢复、数据一致性和服务可靠性。重点关注系统的健壮性。',
        color: '#10b981',
    },
    {
        id: 'testing',
        name: '测试工程师',
        prompt: '请额外从测试的视角关注以下方面：测试覆盖率、测试策略、边界情况、回归风险、可测试性和测试自动化。重点关注质量保证。',
        color: '#f97316',
    },
    {
        id: 'python',
        name: 'Python 专家',
        prompt: '请额外从 Python 最佳实践的视角关注以下方面：PEP 8 规范、类型提示、dataclass、上下文管理器等现代特性、Pythonic 写法、虚拟环境管理、依赖管理（pip/poetry）和常用库（FastAPI、Pydantic、SQLAlchemy、pytest）。',
        color: '#3776ab',
    },
    {
        id: 'fullstack',
        name: '全栈工程师',
        prompt: '请额外从全栈开发的视角关注以下方面：前端（React/Vue/TypeScript）与后端（Node.js/Python/Go）的端到端实现、API 契约、状态管理和部署流程。注重前后端协作效率和一致性。',
        color: '#7c3aed',
    },
    {
        id: 'data-scientist',
        name: '数据科学家',
        prompt: '请额外从数据科学的视角关注以下方面：数据分析、特征工程、机器学习模型选择与调优、pandas/numpy/scikit-learn/PyTorch/TensorFlow 使用。关注数据质量、可复现性、模型评估指标和实验管理。',
        color: '#0891b2',
    },
    {
        id: 'bioinformatics',
        name: '生物信息学',
        prompt: '请额外从生物信息学的视角关注以下方面：基因组学、转录组学、蛋白质组学分析流程、Bioconductor/R、Biopython、samtools、GATK、snakemake 工具使用。关注数据格式（FASTA/FASTQ/VCF/BAM）、流程可复现性和统计分析的严谨性。',
        color: '#059669',
    },
    {
        id: 'dba',
        name: '数据库专家',
        prompt: '请额外从数据库的视角关注以下方面：SQL 优化、索引策略、表设计范式、事务隔离级别和数据迁移。涉及 MySQL、PostgreSQL、Redis、MongoDB 等主流数据库。关注查询性能、数据完整性和高可用架构。',
        color: '#dc2626',
    },
    {
        id: 'algorithm',
        name: '算法专家',
        prompt: '请额外从算法的视角关注以下方面：数据结构选择、算法设计与复杂度分析。针对具体场景评估最优算法、时间和空间复杂度。关注边界条件、特殊输入和算法正确性。',
        color: '#6d28d9',
    },
    {
        id: 'technical-writer',
        name: '技术文档',
        prompt: '请额外从技术文档的视角关注以下方面：清晰、简洁、结构化的文档编写，README、API 文档、架构设计文档的规范性。使用恰当的示例代码、表格和图表来辅助说明。确保文档对目标读者友好。',
        color: '#64748b',
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
