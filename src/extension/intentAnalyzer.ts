import type { ProjectProfile } from './projectProfiler';

// ============================================================================
// Types
// ============================================================================

export type MessageIntent =
  | 'coding'
  | 'debugging'
  | 'research'
  | 'design'
  | 'testing'
  | 'deployment'
  | 'refactoring'
  | 'general';

export interface IntentAnalysis {
  primaryIntent: MessageIntent;
  toolHints: string[];
}

// ============================================================================
// Intent patterns with weights
// ============================================================================

interface IntentPattern {
  pattern: RegExp;
  weight: number;
}

const INTENT_PATTERNS: Record<MessageIntent, IntentPattern[]> = {
  debugging: [
    { pattern: /\b(debug|troubleshoot|diagnose)\b/i, weight: 5 },
    { pattern: /\b(bug|error|fix|crash|exception|fail(ed|ure|s)?|broken|issue)\b/i, weight: 3 },
    { pattern: /\b(stack\s*trace|segfault|panic|undefined\s+is\s+not|cannot\s+read\s+propert)/i, weight: 4 },
    { pattern: /\b(doesn'?t\s+work|not\s+working|wrong\s+output|unexpected)/i, weight: 3 },
    // Chinese patterns
    { pattern: /(修复|修bug|报错|异常|崩溃|出错|问题|故障|不工作|不对)/i, weight: 3 },
  ],
  research: [
    { pattern: /\b(what\s+is|how\s+(does|do|to|can)|explain|documentation|docs)\b/i, weight: 3 },
    { pattern: /\b(look\s*up|find\s+out|learn|understand|teach\s+me|show\s+me\s+how)\b/i, weight: 3 },
    { pattern: /\b(latest|recent|new\s+feature|API\s+docs|reference|guide|tutorial)\b/i, weight: 2 },
    { pattern: /\b(difference\s+between|compare|vs\.?|versus|pros?\s+and\s+cons?)\b/i, weight: 2 },
    // Chinese patterns
    { pattern: /(什么是|怎么用|怎么做|如何|解释|查一下|了解|学习|文档|教程)/i, weight: 3 },
  ],
  design: [
    { pattern: /\b(architect(ure)?|design\s+(pattern|system)|structure|organize)\b/i, weight: 4 },
    { pattern: /\b(trade-?off|approach|strategy|plan\s+(out|for)|system\s+design)\b/i, weight: 3 },
    { pattern: /\b(micro\s*service|database\s+schema|API\s+design|data\s+model)\b/i, weight: 5 },
    { pattern: /\b(scalab|extensib|maintain|modular|decouple|separation)/i, weight: 2 },
    // Chinese patterns
    { pattern: /(架构|设计模式|方案|结构|规划|系统设计|技术选型)/i, weight: 3 },
  ],
  testing: [
    { pattern: /\b(test|spec|coverage|unit\s*test|integration\s*test|e2e)\b/i, weight: 4 },
    { pattern: /\b(assert|mock|stub|spy|fixture|test\s*case|test\s*suite)\b/i, weight: 3 },
    { pattern: /\b(TDD|BDD|testing\s+library|playwright|cypress|vitest|jest)\b/i, weight: 4 },
    // Chinese patterns
    { pattern: /(测试|单测|集成测试|端到端|覆盖率|测试用例)/i, weight: 4 },
  ],
  deployment: [
    { pattern: /\b(deploy|docker|CI\/?CD|pipeline|release|publish)\b/i, weight: 4 },
    { pattern: /\b(kubernetes|k8s|helm|terraform|ansible|nginx)\b/i, weight: 5 },
    { pattern: /\b(container|image|registry|cloud|AWS|GCP|Azure|Vercel|Netlify)\b/i, weight: 3 },
    { pattern: /\b(GitHub\s*Actions?|Jenkins|GitLab\s*CI|CircleCI)\b/i, weight: 4 },
    // Chinese patterns
    { pattern: /(部署|发布|上线|容器|运维|持续集成|持续部署)/i, weight: 4 },
  ],
  refactoring: [
    { pattern: /\b(refactor|clean\s*up|improve|simplify|reorganize|restructure)\b/i, weight: 4 },
    { pattern: /\b(extract|dedup(licate)?|DRY|SOLID|reduce\s+complexity)\b/i, weight: 3 },
    { pattern: /\b(rename|move|split|merge|consolidate|optimize)\b/i, weight: 2 },
    // Chinese patterns
    { pattern: /(重构|优化|简化|整理|清理|拆分|合并)/i, weight: 3 },
  ],
  coding: [
    { pattern: /\b(implement|create|add|build|write|make|develop)\b/i, weight: 2 },
    { pattern: /\b(feature|component|function|class|endpoint|module|page|route)\b/i, weight: 2 },
    { pattern: /\b(generate|scaffold|boilerplate|template|skeleton)\b/i, weight: 3 },
    // Chinese patterns
    { pattern: /(实现|创建|添加|编写|开发|新增|功能|组件|接口|模块)/i, weight: 2 },
  ],
  general: [],
};

const MIN_CONFIDENCE_THRESHOLD = 2;

// ============================================================================
// IntentAnalyzer
// ============================================================================

export class IntentAnalyzer {
  /**
   * Analyze the user's message to determine intent and generate tool hints.
   * Pure logic, no side effects, <1ms execution.
   */
  analyze(message: string, profile: ProjectProfile | null): IntentAnalysis {
    const scores = new Map<MessageIntent, number>();

    for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as [MessageIntent, IntentPattern[]][]) {
      let score = 0;
      for (const { pattern, weight } of patterns) {
        if (pattern.test(message)) {
          score += weight;
        }
      }
      if (score > 0) scores.set(intent, score);
    }

    // Find highest-scoring intent
    let primaryIntent: MessageIntent = 'general';
    let maxScore = 0;
    for (const [intent, score] of scores) {
      if (score > maxScore) {
        maxScore = score;
        primaryIntent = intent;
      }
    }

    // Fall back to 'general' if confidence too low
    if (maxScore < MIN_CONFIDENCE_THRESHOLD) {
      primaryIntent = 'general';
    }

    const toolHints = this._generateToolHints(primaryIntent, profile);

    return { primaryIntent, toolHints };
  }

  private _generateToolHints(intent: MessageIntent, profile: ProjectProfile | null): string[] {
    const hints: string[] = [];

    switch (intent) {
      case 'research': {
        const libs = profile?.detectedLibraries
          .filter((l) => !l.startsWith('@types/') && l !== 'typescript')
          .slice(0, 8) || [];
        if (libs.length > 0) {
          hints.push(`Use context7 MCP to look up documentation for project dependencies: ${libs.join(', ')}.`);
        }
        hints.push('Use fetch MCP to retrieve online documentation when the user asks about recent APIs or features not in your training data.');
        break;
      }

      case 'design':
        hints.push('Use sequential-thinking MCP for complex architectural decisions. Break down the problem into components, evaluate trade-offs, and propose a clear structure.');
        if (profile?.framework) {
          hints.push(`Follow ${profile.framework} community patterns and conventions for architectural decisions.`);
        }
        break;

      case 'debugging':
        hints.push('Read the relevant source files and error context first. Check git diff for recent changes that may have introduced the bug.');
        hints.push('Use sequential-thinking MCP if the root cause is unclear — systematically narrow down the problem.');
        break;

      case 'testing':
        if (profile?.testFramework) {
          const cmd = this._getTestRunCommand(profile);
          hints.push(`This project uses ${profile.testFramework}. Run tests with \`${cmd}\` after writing test files.`);
        }
        if (profile?.detectedLibraries.some((l) => l.includes('testing-library'))) {
          hints.push('Use React Testing Library patterns: test behavior, not implementation. Prefer getByRole over getByTestId.');
        }
        hints.push('Use context7 MCP to look up the testing framework API if needed.');
        break;

      case 'deployment':
        hints.push('Check existing Dockerfile, CI config (.github/workflows, .gitlab-ci.yml), and deployment scripts before making changes.');
        hints.push('Use fetch MCP to check the latest documentation for cloud services or CI platforms if needed.');
        break;

      case 'refactoring':
        hints.push('Before refactoring, read all related files to understand the full scope of changes needed. Check for tests that may need updating.');
        if (profile?.testFramework) {
          hints.push(`Run \`${this._getTestRunCommand(profile)}\` after refactoring to ensure nothing is broken.`);
        }
        break;

      case 'coding':
        hints.push('Check existing patterns and conventions in the codebase before implementing new code. Reuse existing utilities and abstractions.');
        if (profile?.framework) {
          hints.push(`Use context7 MCP to look up ${profile.framework} API documentation if implementing framework-specific features.`);
        }
        break;

      case 'general':
        // Minimal hints for general messages
        if (profile?.detectedLibraries && profile.detectedLibraries.length > 0) {
          hints.push('Use context7 MCP for library documentation lookup when needed.');
        }
        break;
    }

    return hints;
  }

  private _getTestRunCommand(profile: ProjectProfile): string {
    switch (profile.testFramework) {
      case 'vitest': return `${profile.packageManager === 'bun' ? 'bun' : 'npx'} vitest`;
      case 'jest': return `${profile.packageManager === 'bun' ? 'bun' : 'npx'} jest`;
      case 'pytest': return 'pytest';
      case 'go-test': return 'go test ./...';
      case 'cargo-test': return 'cargo test';
      case 'playwright': return 'npx playwright test';
      case 'cypress': return 'npx cypress run';
      default: return `${profile.packageManager || 'npm'} test`;
    }
  }
}
