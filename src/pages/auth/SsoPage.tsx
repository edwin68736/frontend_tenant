import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { decodeJWT, type JWTPayload } from '@/services/auth.service'
import { isNativeShell } from '@/lib/platform/detect'

/**
 * Acceso maestro desde Panel Central (solo ERP web).
 * No disponible en Android, Tauri ni Capacitor.
 */
export default function SsoPage() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isNativeShell()) return

    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')?.trim()
    if (!token) {
      setError('Token no proporcionado')
      return
    }

    const payload = decodeJWT<JWTPayload>(token)
    if (!payload?.user_id || payload.type !== 'tenant') {
      setError('Token inválido')
      return
    }

    const user = {
      id: payload.user_id,
      name: payload.role_name === 'Administrador' ? 'Administrador' : payload.email,
      email: payload.email,
      role: payload.role_name,
      home_branch_id: payload.active_branch_id,
    }

    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(user))

    window.history.replaceState({}, document.title, '/auth/sso')
    window.location.replace('/home')
  }, [])

  if (isNativeShell()) {
    return <Navigate to="/login" replace />
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <p className="text-center text-sm text-red-600">{error}</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
    </div>
  )
}
