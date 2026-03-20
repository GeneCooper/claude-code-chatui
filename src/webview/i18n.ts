// Lightweight i18n — auto-detects VS Code locale, falls back to English.

const keys = [
  'error.sessionExpired', 'error.loadConversation',
  'error.saveHooks', 'tip.yoloMode',
] as const

type Key = (typeof keys)[number]
type Messages = Record<Key, string>

const en: Messages = {
  'error.sessionExpired': 'Session expired. Send your message again to start a new conversation.',
  'error.loadConversation': 'Failed to load conversation',
  'error.saveHooks': 'Failed to save hooks configuration',
  'tip.yoloMode': 'Tip: Enable YOLO mode in Settings to skip permission prompts.',
}

const zh: Messages = {
  'error.sessionExpired': '会话已过期，请重新发送消息以开始新对话。',
  'error.loadConversation': '加载历史会话失败',
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
