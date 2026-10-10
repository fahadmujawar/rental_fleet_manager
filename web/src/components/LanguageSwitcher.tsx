import { useTranslation } from 'react-i18next'
import { languages } from '../i18n'

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation()

  return (
    <div className="flex items-center gap-2" role="group" aria-label={t('language.label')}>
      {languages.map((lng) => (
        <button
          key={lng}
          type="button"
          lang={lng}
          onClick={() => i18n.changeLanguage(lng)}
          aria-pressed={i18n.language === lng}
          className={`rounded px-3 py-1 text-sm ${
            i18n.language === lng ? 'bg-gray-900 text-white' : 'border border-gray-300 text-gray-700'
          }`}
        >
          {t(`language.${lng}`)}
        </button>
      ))}
    </div>
  )
}
