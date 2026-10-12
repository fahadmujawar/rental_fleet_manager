import type { ReactNode } from 'react'
import { createBrowserRouter, createRoutesFromElements, Navigate, Route } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MachineDetailPage } from './pages/MachineDetailPage'
import { MachineFormPage } from './pages/MachineFormPage'
import { MachineListPage } from './pages/MachineListPage'

function protect(page: ReactNode) {
  return <RequireAuth>{page}</RequireAuth>
}

// A data router: needed for useBlocker (ask before leaving a form with unsaved changes).
export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={protect(<HomePage />)} />
      <Route path="/machines" element={protect(<MachineListPage />)} />
      <Route path="/machines/new" element={protect(<MachineFormPage />)} />
      <Route path="/machines/:id" element={protect(<MachineDetailPage />)} />
      <Route path="/machines/:id/edit" element={protect(<MachineFormPage />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </>,
  ),
)
