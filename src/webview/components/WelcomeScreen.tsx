import { useState } from 'react'
import { LogoIcon } from './Header'
import { TEMPLATES, TEMPLATE_CATEGORIES, getTemplateLabel, getTemplatePrompt, getCategoryLabel } from '../data/templates'
import { t } from '../i18n'

const TIPS = [
  { keyI18n: 'welcome.tip.slash', descI18n: 'welcome.tip.slashDesc' },
  { keyI18n: 'welcome.tip.drop', descI18n: 'welcome.tip.dropDesc' },
  { keyI18n: 'welcome.tip.yolo', descI18n: 'welcome.tip.yoloDesc' },
  { keyI18n: 'welcome.tip.newline', descI18n: 'welcome.tip.newlineDesc' },
]

interface Props {
  onHintClick: (text: string) => void
}

export function WelcomeScreen({ onHintClick }: Props) {
  const [activeCategory, setActiveCategory] = useState<string>('quickstart')
  const filtered = TEMPLATES.filter((tpl) => tpl.category === activeCategory)

  return (
    <div
      className="flex flex-col items-center justify-center text-center"
      style={{
        flex: 1,
        minHeight: '50vh',
        padding: '32px 12px',
        animation: 'fadeIn 0.5s ease',
        overflow: 'hidden',
      }}
    >
      <div
        className="mb-3"
        style={{
          opacity: 0.9,
          filter: 'drop-shadow(0 4px 12px rgba(237, 110, 29, 0.3))',
        }}
      >
        <LogoIcon size={40} />
      </div>

      <h2
        className="m-0"
        style={{ fontSize: '17px', fontWeight: 700, letterSpacing: '-0.3px', marginBottom: '6px' }}
      >
        {t('app.title')}
      </h2>

      <p className="m-0" style={{ fontSize: '12px', opacity: 0.7, marginBottom: '16px' }}>
        {t('app.subtitle')}
      </p>

      {/* Category tabs */}
      <div
        className="flex items-center gap-1 mb-3"
        style={{ maxWidth: '480px' }}
      >
        {TEMPLATE_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="cursor-pointer border-none text-inherit"
            style={{
              padding: '4px 10px',
              borderRadius: '12px',
              fontSize: '11px',
              fontWeight: activeCategory === cat.id ? 600 : 400,
              background: activeCategory === cat.id ? 'rgba(237, 110, 29, 0.12)' : 'transparent',
              color: activeCategory === cat.id ? 'var(--chatui-accent)' : 'inherit',
              border: `1px solid ${activeCategory === cat.id ? 'var(--chatui-accent)' : 'transparent'}`,
              opacity: activeCategory === cat.id ? 1 : 0.6,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { if (activeCategory !== cat.id) e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { if (activeCategory !== cat.id) e.currentTarget.style.opacity = '0.6' }}
          >
            {getCategoryLabel(cat)}
          </button>
        ))}
      </div>

      {/* Template grid */}
      <div
        className="grid grid-cols-2 gap-1.5 w-full"
        style={{ maxWidth: '480px', margin: '0 auto', marginBottom: '20px' }}
      >
        {filtered.map((hint) => (
          <button
            key={hint.labelKey}
            onClick={() => onHintClick(getTemplatePrompt(hint))}
            className="flex items-center gap-2 text-left cursor-pointer text-inherit"
            style={{
              padding: '8px 10px',
              border: '1px solid var(--vscode-panel-border)',
              background: 'rgba(128, 128, 128, 0.05)',
              borderRadius: 'var(--radius-md)',
              transition: 'all 0.2s ease',
              minWidth: 0,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--chatui-accent)'
              e.currentTarget.style.color = 'var(--chatui-accent)'
              e.currentTarget.style.background = 'rgba(237, 110, 29, 0.06)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--vscode-panel-border)'
              e.currentTarget.style.color = 'inherit'
              e.currentTarget.style.background = 'rgba(128, 128, 128, 0.05)'
            }}
          >
            <span style={{ fontSize: '13px', flexShrink: 0 }}>{hint.icon}</span>
            <span className="truncate" style={{ fontWeight: 500, fontSize: '12px' }}>{getTemplateLabel(hint)}</span>
          </button>
        ))}
      </div>

      {/* Feature tips */}
      <div style={{ width: '100%' }}>
        <div
          className="flex flex-wrap items-center justify-center gap-1.5"
          style={{ opacity: 0.5, fontSize: '10px' }}
        >
          {TIPS.map((tip, i) => (
            <span key={tip.keyI18n} className="flex items-center gap-0.5">
              {i > 0 && <span style={{ margin: '0 1px', opacity: 0.3 }}>&middot;</span>}
              <kbd
                style={{
                  padding: '1px 4px',
                  borderRadius: '3px',
                  border: '1px solid var(--vscode-panel-border)',
                  background: 'rgba(128, 128, 128, 0.1)',
                  fontFamily: 'inherit',
                  fontSize: '9px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                {t(tip.keyI18n)}
              </kbd>
              <span style={{ whiteSpace: 'nowrap' }}>{t(tip.descI18n)}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
