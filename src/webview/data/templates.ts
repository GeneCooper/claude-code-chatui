import { t } from '../i18n'

export interface Template {
  icon: string
  labelKey: string
  promptKey: string
  category: 'quickstart' | 'quality' | 'learning' | 'architecture'
}

export const TEMPLATE_CATEGORIES = [
  { id: 'quickstart' as const, labelKey: 'welcome.quickStart' },
  { id: 'quality' as const, labelKey: 'welcome.codeQuality' },
  { id: 'learning' as const, labelKey: 'welcome.learning' },
  { id: 'architecture' as const, labelKey: 'welcome.architecture' },
]

export const TEMPLATES: Template[] = [
  // Quick Start
  { icon: '🐛', labelKey: 'template.fixBug', promptKey: 'template.fixBugPrompt', category: 'quickstart' },
  { icon: '🚀', labelKey: 'template.addFeature', promptKey: 'template.addFeaturePrompt', category: 'quickstart' },
  { icon: '🧪', labelKey: 'template.writeTests', promptKey: 'template.writeTestsPrompt', category: 'quickstart' },
  { icon: '✨', labelKey: 'template.refactor', promptKey: 'template.refactorPrompt', category: 'quickstart' },
  // Code Quality
  { icon: '🔍', labelKey: 'template.codeReview', promptKey: 'template.codeReviewPrompt', category: 'quality' },
  { icon: '🔐', labelKey: 'template.securityAudit', promptKey: 'template.securityAuditPrompt', category: 'quality' },
  { icon: '⚡', labelKey: 'template.performance', promptKey: 'template.performancePrompt', category: 'quality' },
  { icon: '📝', labelKey: 'template.addTypes', promptKey: 'template.addTypesPrompt', category: 'quality' },
  // Learning
  { icon: '📖', labelKey: 'template.explainCode', promptKey: 'template.explainCodePrompt', category: 'learning' },
  { icon: '🗺️', labelKey: 'template.codebaseTour', promptKey: 'template.codebaseTourPrompt', category: 'learning' },
  { icon: '❓', labelKey: 'template.howDoesXWork', promptKey: 'template.howDoesXWorkPrompt', category: 'learning' },
  { icon: '📊', labelKey: 'template.compareApproaches', promptKey: 'template.compareApproachesPrompt', category: 'learning' },
  // Architecture
  { icon: '🏗️', labelKey: 'template.designSystem', promptKey: 'template.designSystemPrompt', category: 'architecture' },
  { icon: '📐', labelKey: 'template.apiDesign', promptKey: 'template.apiDesignPrompt', category: 'architecture' },
  { icon: '🗄️', labelKey: 'template.databaseSchema', promptKey: 'template.databaseSchemaPrompt', category: 'architecture' },
  { icon: '🔄', labelKey: 'template.migrationPlan', promptKey: 'template.migrationPlanPrompt', category: 'architecture' },
]

export function getTemplateLabel(tpl: Template): string { return t(tpl.labelKey) }
export function getTemplatePrompt(tpl: Template): string { return t(tpl.promptKey) }
export function getCategoryLabel(cat: typeof TEMPLATE_CATEGORIES[number]): string { return t(cat.labelKey) }
