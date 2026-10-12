import { useTranslation } from 'react-i18next'
import { supabase } from '../lib/supabase'
import { LanguageSwitcher } from './LanguageSwitcher'

export function AppHeader() {
  const { t } = useTranslation()

  return (
    <header className="flex items-center justify-between gap-4 p-4">
      <LanguageSwitcher />
      <button
        type="button"
        onClick={() => supabase.auth.signOut()}
        className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-700"
      >
        {t('home.logout')}
      </button>
    </header>
  )
}
