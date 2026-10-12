import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/RequireAuth'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { MachineDetailPage } from './pages/MachineDetailPage'
import { MachineListPage } from './pages/MachineListPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <HomePage />
          </RequireAuth>
        }
      />
      <Route
        path="/machines"
        element={
          <RequireAuth>
            <MachineListPage />
          </RequireAuth>
        }
      />
      <Route
        path="/machines/:id"
        element={
          <RequireAuth>
            <MachineDetailPage />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
