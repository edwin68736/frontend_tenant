import { useState } from 'react'
import { toast } from 'sonner'
import { Server } from 'lucide-react'
import { getDisplayedTenantApiUrl } from '@/config/apiBaseUrl'
import { updateDevTenantApiUrl } from '@/lib/tenantBinding/store'
import { useTenantBinding } from '@/contexts/TenantBindingContext'

/** Solo en `import.meta.env.DEV` dentro de apps nativas. */
export function DevServerSettings() {
  const { stored, reload } = useTenantBinding()
  const [url, setUrl] = useState(stored?.apiUrl ?? '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateDevTenantApiUrl(url)
      await reload()
      toast.success('Servidor de desarrollo actualizado')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la URL')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mb-4 space-y-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex items-start gap-2">
        <Server className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" aria-hidden />
        <div>
          <h2 className="text-sm font-bold text-amber-950">Servidor (desarrollo)</h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
            Las peticiones usan el proxy de Vite con el encabezado{' '}
            <code className="font-mono text-[11px]">X-Tenant-Api-Origin</code>.
          </p>
          <p className="mt-2 text-xs text-gray-600">
            Activo: <span className="break-all font-mono">{getDisplayedTenantApiUrl()}</span>
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://localhost:3000"
          className="flex-1 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-green-600"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || !url.trim()}
          className="shrink-0 rounded-xl bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:opacity-50"
        >
          {saving ? 'Guardando…' : 'Aplicar URL'}
        </button>
      </div>
    </section>
  )
}
