import en from './locales/en.json'
import zhCN from './locales/zh-CN.json'

type Translations = Record<string, string>

const locales: Record<string, Translations> = {
  en,
  'zh-cn': zhCN,
  'zh-tw': zhCN, // fallback to simplified Chinese
}

let currentLocale = 'en'
let currentTranslations: Translations = en

export function setLocale(locale: string): void {
  const normalized = locale.toLowerCase()
  // Try exact match, then language prefix
  const translations = locales[normalized] || locales[normalized.split('-')[0]]
  if (translations) {
    currentLocale = normalized
    currentTranslations = translations
  }
}

export function getLocale(): string {
  return currentLocale
}

/**
 * Translate a key with optional parameter substitution.
 * Parameters use {name} syntax: t('greeting', { name: 'World' })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = currentTranslations[key] || en[key] || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return text
}

export function detectLocale(): string {
  // Check navigator language in webview
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase()
  }
  return 'en'
}
