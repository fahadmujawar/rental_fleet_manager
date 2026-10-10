import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const { t } = useTranslation()

  if (loading) return <p className="p-6 text-start text-gray-600">{t('app.loading')}</p>
  if (!session) return <Navigate to="/login" replace />
  return children
}
