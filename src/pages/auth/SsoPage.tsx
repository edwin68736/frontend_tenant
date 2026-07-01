import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { isNativeShell } from '@/lib/platform/detect'

/**
 * Compatibilidad con enlaces antiguos /auth/sso?token=...
 * El token se procesa en AuthProvider; aquí solo redirigimos dentro del SPA.
 */
export default function SsoPage() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isNativeShell()) {
    return <Navigate to="/login" replace />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />
  }

  return <Navigate to="/login" replace />
}
