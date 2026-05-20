import { type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  permission: string
  children: ReactNode
  fallback?: ReactNode
}

/** Muestra children solo si el usuario tiene el permiso; si no, muestra fallback o mensaje por defecto. */
export default function RequirePermission({ permission, children, fallback }: Props) {
  const { hasPermission } = useAuth()

  if (!hasPermission(permission)) {
    if (fallback !== undefined) return <>{fallback}</>
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
          <Lock size={26} className="text-gray-400" />
        </div>
        <h3 className="text-gray-700 font-semibold">Sin permiso</h3>
        <p className="text-gray-500 text-sm mt-1 max-w-xs">
          No tienes permiso para acceder a esta acción o sección.
        </p>
        <span className="mt-2 text-xs font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded">
          {permission}
        </span>
      </div>
    )
  }

  return <>{children}</>
}
