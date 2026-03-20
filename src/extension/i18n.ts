import * as vscode from 'vscode'

const en: Record<string, string> = {
  'error.sessionExpired': 'Session expired. Send your message again to start a new conversation.',
  'error.loadConversation': 'Failed to load conversation',
  'tip.yoloMode': 'Tip: Enable YOLO mode in Settings to skip permission prompts.',
}

const zh: Record<string, string> = {
  'error.sessionExpired': '会话已过期，请重新发送消息以开始新对话。',
  'error.loadConversation': '加载历史会话失败',
  'tip.yoloMode': '提示：在设置中启用 YOLO 模式可跳过权限确认。',
}

const translations: Record<string, Record<string, string>> = { en, zh }

export function t(key: string): string {
  const locale = vscode.env.language.startsWith('zh') ? 'zh' : 'en'
  return translations[locale]?.[key] ?? en[key] ?? key
}
