// Lightweight i18n — auto-detects VS Code locale, falls back to English.
// Usage: import { t } from './i18n'  →  t('snippets')

const keys = [
  'snippets', 'snippets.title',
  'snippets.modeSingle', 'snippets.modeMulti',
  'snippets.singleDesc', 'snippets.multiDesc',
  'snippets.singleTip', 'snippets.multiTip',
  'snippets.edit', 'snippets.delete',
  'snippets.namePlaceholder', 'snippets.promptPlaceholder',
  'snippets.cancel', 'snippets.save', 'snippets.create',
  'snippets.search', 'snippets.builtIn', 'snippets.custom',
  'snippets.noMatch', 'snippets.createCustom', 'snippets.new',
  'error.sessionExpired', 'error.loadConversation',
  'error.revertFile', 'error.saveHooks', 'tip.yoloMode',
] as const

type Key = (typeof keys)[number]
type Messages = Record<Key, string>

const en: Messages = {
  'snippets': 'Snippets',
  'snippets.title': 'Prompt Snippets',
  'snippets.modeSingle': '● Single',
  'snippets.modeMulti': '◆ Multi',
  'snippets.singleDesc': 'One role, maximum focus',
  'snippets.multiDesc': 'Multiple roles combined',
  'snippets.singleTip': 'Single mode (recommended): One focused role per message for best results. Click to switch to multi-select.',
  'snippets.multiTip': 'Multi mode: Multiple roles at once (may reduce focus). Click to switch to single-select.',
  'snippets.edit': 'Edit snippet',
  'snippets.delete': 'Delete snippet',
  'snippets.namePlaceholder': 'Snippet name',
  'snippets.promptPlaceholder': 'Enter the prompt content that will be prepended to your messages...',
  'snippets.cancel': 'Cancel',
  'snippets.save': 'Save',
  'snippets.create': 'Create',
  'snippets.search': 'Search snippets...',
  'snippets.builtIn': 'Built-in',
  'snippets.custom': 'Custom',
  'snippets.noMatch': 'No snippets match',
  'snippets.createCustom': 'Create custom snippet',
  'snippets.new': 'New Snippet',
  'error.sessionExpired': 'Session expired. Send your message again to start a new conversation.',
  'error.loadConversation': 'Failed to load conversation',
  'error.revertFile': 'Failed to revert file',
  'error.saveHooks': 'Failed to save hooks configuration',
  'tip.yoloMode': 'Tip: Enable YOLO mode in Settings to skip permission prompts.',
}

const zh: Messages = {
  'snippets': '提示词',
  'snippets.title': '提示词片段',
  'snippets.modeSingle': '● 单选',
  'snippets.modeMulti': '◆ 多选',
  'snippets.singleDesc': '专注单一角色',
  'snippets.multiDesc': '组合多个角色',
  'snippets.singleTip': '单选模式（推荐）：每条消息专注一个角色，效果最佳。点击切换为多选。',
  'snippets.multiTip': '多选模式：同时组合多个角色（可能分散注意力）。点击切换为单选。',
  'snippets.edit': '编辑',
  'snippets.delete': '删除',
  'snippets.namePlaceholder': '片段名称',
  'snippets.promptPlaceholder': '输入提示词内容，将作为角色设定添加到消息前...',
  'snippets.cancel': '取消',
  'snippets.save': '保存',
  'snippets.create': '创建',
  'snippets.search': '搜索片段...',
  'snippets.builtIn': '内置',
  'snippets.custom': '自定义',
  'snippets.noMatch': '未找到匹配的片段',
  'snippets.createCustom': '创建自定义片段',
  'snippets.new': '新建片段',
  'error.sessionExpired': '会话已过期，请重新发送消息以开始新对话。',
  'error.loadConversation': '加载历史会话失败',
  'error.revertFile': '文件还原失败',
  'error.saveHooks': '保存 Hooks 配置失败',
  'tip.yoloMode': '提示：在设置中启用 YOLO 模式可跳过权限确认。',
}

const translations: Record<string, Messages> = { en, zh }

let currentLocale = 'en'

/** Called once when platformInfo arrives from extension */
export function setLocale(locale: string): void {
  currentLocale = locale.startsWith('zh') ? 'zh' : 'en'
}

export function getLocale(): string {
  return currentLocale
}

/** Translate a key to the current locale */
export function t(key: Key): string {
  return (translations[currentLocale] ?? en)[key] ?? en[key]
}
