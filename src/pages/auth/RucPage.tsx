import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Building2 } from 'lucide-react'
import { publicService, storeTenant } from '@/services/public.service'
import { getCentralApiOrigin } from '@/config/apiBaseUrl'
import { useTenantBinding } from '@/contexts/TenantBindingContext'
import { isDevelopmentMode } from '@/lib/runtime/environment'
import { DevServerSettings } from '@/components/settings/DevServerSettings'

/**
 * Windows / Android: vinculación RUC → slug + URL del tenant (persistida en disco).
 * En web no se usa esta pantalla (el subdominio identifica al tenant).
 */
export default function RucPage() {
  const navigate = useNavigate()
  const { isBound, stored, reload } = useTenantBinding()
  const [ruc, setRuc] = useState(stored?.ruc ?? '')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isBound) {
      navigate('/login', { replace: true })
    }
  }, [isBound, navigate])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const rucTrim = ruc.replace(/\D/g, '').trim()
    if (rucTrim.length < 8) {
      toast.error('Ingresa un RUC válido (mínimo 8 dígitos)')
      return
    }
    setLoading(true)
    try {
      const data = await publicService.getTenantByRuc(rucTrim)
      await storeTenant(data, rucTrim)
      await reload()
      toast.success(`Empresa vinculada: ${data.name}`)
      navigate('/login', { replace: true })
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { error?: string } }; message?: string }
      const serverMsg = e?.response?.data?.error
      const localMsg = e?.message
      if (localMsg && !serverMsg) {
        toast.error(localMsg)
      } else if (serverMsg) {
        toast.error(serverMsg)
      } else if (e?.response?.status) {
        toast.error(`Error ${e.response.status} al consultar la empresa`)
      } else {
        toast.error(`No se pudo conectar con la API central (${getCentralApiOrigin()}). Verifica tu conexión.`)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="ruc-bind-screen bg-gradient-to-br from-green-900 via-green-800 to-emerald-900">
      <div className="ruc-bind-card rounded-2xl bg-white/95 p-6 shadow-xl backdrop-blur sm:p-8">
        <div className="mb-3 flex justify-center">
          <img src="/logo.png" alt="Tukifac" className="ruc-bind-logo h-16 w-auto object-contain" />
        </div>
        <p className="mb-1 text-center text-sm text-gray-600">Panel ERP Tukifac</p>
        <p className="ruc-bind-lead mb-6 text-center text-xs leading-relaxed text-gray-500">
          Ingrese el RUC de su empresa. La vinculación queda guardada en este dispositivo. Para cambiar de
          empresa debe desinstalar la aplicación.
        </p>
        {isDevelopmentMode() && (
          <div className="mb-4">
            <DevServerSettings />
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">RUC de la empresa</label>
            <input
              type="text"
              inputMode="numeric"
              value={ruc}
              onChange={(e) => setRuc(e.target.value.replace(/\D/g, ''))}
              placeholder="20123456789"
              maxLength={11}
              autoFocus
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full touch-target items-center justify-center gap-2 rounded-xl bg-green-700 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-800 disabled:opacity-50"
          >
            <Building2 size={18} />
            {loading ? 'Buscando empresa...' : 'Vincular empresa'}
          </button>
        </form>
      </div>
    </div>
  )
}
