import { type ReactNode } from 'react'
import { Lock, FileText } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface Props {
  moduleKey: string
  children: ReactNode
}

export default function RequireModule({ moduleKey, children }: Props) {
  const { hasModule } = useAuth()

  if (!hasModule(moduleKey)) {
    if (moduleKey === 'billing') {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center max-w-md mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
            <FileText size={32} className="text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Facturación electrónica no habilitada</h3>
          <p className="text-gray-600 text-sm">
            Debe actualizar o mejorar su plan para habilitar la facturación electrónica.
          </p>
          <p className="text-gray-500 text-xs mt-3">
            Mientras tanto, solo puede emitir <strong>Notas de venta</strong>.
          </p>
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <Lock size={28} className="text-gray-400" />
        </div>
        <h3 className="text-gray-700 font-semibold text-lg">Módulo no habilitado</h3>
        <p className="text-gray-400 text-sm mt-1 max-w-xs">
          Este módulo no está incluido en tu plan actual. Contacta al administrador para habilitarlo.
        </p>
        <span className="mt-3 text-xs font-mono bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
          {moduleKey}
        </span>
      </div>
    )
  }

  return <>{children}</>
}
