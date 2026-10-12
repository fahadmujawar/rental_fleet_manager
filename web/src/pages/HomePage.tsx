import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { AppHeader } from '../components/AppHeader'
import { supabase } from '../lib/supabase'

type HomeState =
  | { status: 'loading' }
  | { status: 'error'; errorKey: string }
  | { status: 'ready'; fullName: string; companyName: string }

export function HomePage() {
  const { t } = useTranslation()
  const { session } = useAuth()
  const userId = session?.user.id
  const [state, setState] = useState<HomeState>({ status: 'loading' })

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function load() {
      // Both reads go through RLS: users only see their own active company.
      const profile = await supabase
        .from('profiles')
        .select('full_name, company_id')
        .eq('id', userId)
        .maybeSingle()

      if (cancelled) return
      if (profile.error || !profile.data) {
        setState({ status: 'error', errorKey: 'home.errors.profile' })
        return
      }

      const company = await supabase
        .from('companies')
        .select('name')
        .eq('id', profile.data.company_id)
        .maybeSingle()

      if (cancelled) return
      if (company.error || !company.data) {
        setState({ status: 'error', errorKey: 'home.errors.company' })
        return
      }

      setState({ status: 'ready', fullName: profile.data.full_name, companyName: company.data.name })
    }

    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />

      <main className="mx-auto mt-12 max-w-2xl px-4 text-start">
        {state.status === 'loading' && <p className="text-gray-600">{t('app.loading')}</p>}

        {state.status === 'error' && (
          <p role="alert" className="text-red-700">
            {t(state.errorKey)}
          </p>
        )}

        {state.status === 'ready' && (
          <>
            <h1 className="text-2xl font-semibold text-gray-900">{t('home.welcome', { name: state.fullName })}</h1>
            <p className="mt-2 text-gray-700">{t('home.company', { name: state.companyName })}</p>
            <nav aria-label={t('home.nav.label')} className="mt-8">
              <ul className="space-y-2">
                <li>
                  <Link to="/machines" className="text-blue-700 underline">
                    {t('home.nav.machines')}
                  </Link>
                </li>
              </ul>
            </nav>
          </>
        )}
      </main>
    </div>
  )
}
