import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ar from './locales/ar.json'
import en from './locales/en.json'

export const languages = ['en', 'ar'] as const
const rtlLanguages = ['ar']
const storageKey = 'language'

function savedLanguage(): string {
  try {
    const value = localStorage.getItem(storageKey)
    if (value && (languages as readonly string[]).includes(value)) return value
  } catch {
    // Storage can be blocked (private window); fall back to English.
  }
  return 'en'
}

// Keep <html lang dir>, the page title and the saved choice in step with the language.
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  document.documentElement.dir = rtlLanguages.includes(lng) ? 'rtl' : 'ltr'
  document.title = i18n.t('app.title')
  try {
    localStorage.setItem(storageKey, lng)
  } catch {
    // Not saved; the language still works for this visit.
  }
})

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: savedLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
