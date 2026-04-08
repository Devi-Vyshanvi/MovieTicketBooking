import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { useAuth } from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import SeatBookingPage from './pages/SeatBookingPage'
import SelectionPage from './pages/SelectionPage'
import AdminPage from './pages/AdminPage'

function App() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route
        path="/auth"
        element={
          isAuthenticated ? (
            <Navigate to="/" replace />
          ) : (
            <AuthPage />
          )
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SelectionPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/booking/:showtimeId"
        element={
          <ProtectedRoute>
            <SeatBookingPage />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <AdminPage />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
