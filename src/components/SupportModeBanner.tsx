import { Shield } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isWebBrowser } from '@/lib/platform/detect'

/** Banner informativo cuando la sesión proviene de Acceso Maestro (Panel Central). Solo ERP web. */
export default function SupportModeBanner() {
  const { isImpersonated } = useAuth()
  if (!isWebBrowser() || !isImpersonated) return null

  return (
    <div className="relative z-10 shrink-0 overflow-hidden rounded-2xl bg-white shadow-md">
      <div
        role="status"
        className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:px-4 sm:text-sm"
      >
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
          <div>
            <p className="font-semibold">Modo Soporte</p>
            <p className="text-amber-800/90">
              Sesión iniciada mediante Acceso Maestro desde el Panel Central. Las acciones realizadas
              pueden ser auditadas.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
