import translations from './locales/en.json'

/**
 * Translate a key with optional parameter substitution.
 * Parameters use {name} syntax: t('greeting', { name: 'World' })
 */
export function t(key: string, params?: Record<string, string | number>): string {
  let text = (translations as Record<string, string>)[key] || key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
    }
  }
  return text
}
