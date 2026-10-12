import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const { t } = useTranslation()
  const location = useLocation()

  if (loading) return <p className="p-6 text-start text-gray-600">{t('app.loading')}</p>
  // Remember the page, so the login page can return to it.
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}
