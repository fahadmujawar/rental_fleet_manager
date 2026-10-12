import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { supabase } from '../lib/supabase'

// The page RequireAuth came from, if it is a path in this app ("//host" would leave the app); else Home.
function returnPath(state: unknown): string {
  const from = (state as { from?: { pathname?: unknown; search?: unknown } } | null)?.from
  if (typeof from?.pathname !== 'string' || !from.pathname.startsWith('/') || from.pathname.startsWith('//')) return '/'
  return from.pathname + (typeof from.search === 'string' ? from.search : '')
}

export function LoginPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const { session, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorKey, setErrorKey] = useState<string | null>(null)

  if (loading) return <p className="p-6 text-start text-gray-600">{t('app.loading')}</p>
  if (session) return <Navigate to={returnPath(location.state)} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setErrorKey(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setErrorKey(error.code === 'invalid_credentials' ? 'login.errors.invalidCredentials' : 'login.errors.generic')
      setSubmitting(false)
    }
    // On success, AuthProvider receives the new session and the redirect above runs.
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex justify-end p-4">
        <LanguageSwitcher />
      </header>

      <main className="mx-auto mt-12 max-w-sm px-4">
        <h1 className="mb-6 text-start text-2xl font-semibold text-gray-900">{t('login.heading')}</h1>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-6 shadow">
          <label className="block text-start">
            <span className="mb-1 block text-sm text-gray-700">{t('login.email')}</span>
            <input
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-start"
            />
          </label>

          <label className="block text-start">
            <span className="mb-1 block text-sm text-gray-700">{t('login.password')}</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-start"
            />
          </label>

          {errorKey && (
            <p role="alert" className="text-start text-sm text-red-700">
              {t(errorKey)}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-60"
          >
            {submitting ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </main>
    </div>
  )
}
