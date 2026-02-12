export interface Template {
  icon: string
  label: string
  prompt: string
  category: 'quickstart' | 'quality' | 'learning' | 'architecture'
}

export const TEMPLATE_CATEGORIES = [
  { id: 'quickstart' as const, label: 'Quick Start' },
  { id: 'quality' as const, label: 'Code Quality' },
  { id: 'learning' as const, label: 'Learning' },
  { id: 'architecture' as const, label: 'Architecture' },
]

export const TEMPLATES: Template[] = [
  // Quick Start
  { icon: '🐛', label: 'Fix a bug', prompt: 'Help me fix a bug in', category: 'quickstart' },
  { icon: '🚀', label: 'Add feature', prompt: 'Help me implement', category: 'quickstart' },
  { icon: '🧪', label: 'Write tests', prompt: 'Write comprehensive tests for', category: 'quickstart' },
  { icon: '✨', label: 'Refactor', prompt: 'Refactor this code for better readability:', category: 'quickstart' },
  // Code Quality
  { icon: '🔍', label: 'Code review', prompt: 'Review this code for issues and improvements:', category: 'quality' },
  { icon: '🔐', label: 'Security audit', prompt: 'Perform a security audit on this code, check for OWASP top 10 vulnerabilities:', category: 'quality' },
  { icon: '⚡', label: 'Performance', prompt: 'Analyze and optimize the performance of:', category: 'quality' },
  { icon: '📝', label: 'Add types', prompt: 'Add TypeScript types and interfaces to:', category: 'quality' },
  // Learning
  { icon: '📖', label: 'Explain code', prompt: 'Explain how this code works step by step:', category: 'learning' },
  { icon: '🗺️', label: 'Codebase tour', prompt: 'Give me an overview of this project structure and architecture', category: 'learning' },
  { icon: '❓', label: 'How does X work', prompt: 'How does this feature work:', category: 'learning' },
  { icon: '📊', label: 'Compare approaches', prompt: 'Compare the pros and cons of these approaches:', category: 'learning' },
  // Architecture
  { icon: '🏗️', label: 'Design system', prompt: 'Design the architecture for', category: 'architecture' },
  { icon: '📐', label: 'API design', prompt: 'Design a REST API for', category: 'architecture' },
  { icon: '🗄️', label: 'Database schema', prompt: 'Design a database schema for', category: 'architecture' },
  { icon: '🔄', label: 'Migration plan', prompt: 'Create a migration plan to', category: 'architecture' },
]

export function getTemplateLabel(tpl: Template): string { return tpl.label }
export function getTemplatePrompt(tpl: Template): string { return tpl.prompt }
export function getCategoryLabel(cat: typeof TEMPLATE_CATEGORIES[number]): string { return cat.label }
