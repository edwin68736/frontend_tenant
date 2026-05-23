import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Save, KeyRound, Settings, Eye, EyeOff } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { restaurantService } from '@/services/restaurant.service'

export default function RestaurantSettingsPage() {
  return <RequireModule moduleKey="restaurant"><RestaurantSettingsContent /></RequireModule>
}

function RestaurantSettingsContent() {
  const [form, setForm] = useState({
    deletion_pin: '',
  })
  const [hasDeletionPin, setHasDeletionPin] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [showPin, setShowPin] = useState(false)
  const [saving, setSaving] = useState(false)

  const setF = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    restaurantService.getSettings()
      .then((s) => {
        setHasDeletionPin(s.has_deletion_pin)
      })
      .catch(() => toast.error('No se pudo cargar ajustes'))
      .finally(() => setLoadingSettings(false))
  }, [])

  const handleSave = async () => {
    const pin = form.deletion_pin.trim()
    if (pin.length < 4) {
      toast.error('El PIN debe tener al menos 4 dígitos')
      return
    }
    if (pin.length > 6) {
      toast.error('El PIN no puede tener más de 6 dígitos')
      return
    }
    setSaving(true)
    try {
      await restaurantService.updateSettings({ deletion_pin: pin })
      setHasDeletionPin(true)
      setForm({ deletion_pin: '' })
      toast.success('PIN de eliminación guardado correctamente')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error guardando')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Settings size={20} className="text-gray-400" />
        <div>
          <h2 className="text-lg font-bold text-gray-800">Ajustes del Restaurante</h2>
          <p className="text-sm text-gray-500">Configuración del módulo de restaurante</p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
        <p className="text-sm text-slate-700">
          El personal operativo (mozos, cajeros, cocina) se gestiona en <strong>Usuarios → Perfil restaurante</strong> con tipo de empleado y PIN opcional. Tukichef usa login por PIN o email según el perfil asignado.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><KeyRound size={14} /> Seguridad operativa</h3>

        {!loadingSettings && (
          <p className={`text-xs font-medium ${hasDeletionPin ? 'text-emerald-700' : 'text-amber-700'}`}>
            {hasDeletionPin
              ? 'PIN configurado. Para cambiarlo, ingresa un PIN nuevo y guarda.'
              : 'PIN no configurado. Sin PIN no se podrá anular pedidos ni comandas en el módulo restaurante.'}
          </p>
        )}

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PIN de eliminación</label>
          <p className="text-xs text-gray-400 mb-2">Código numérico de 4 a 6 dígitos, requerido para anular pedidos o comandas.</p>
          <div className="relative w-40">
            <input type={showPin ? 'text' : 'password'} maxLength={6} inputMode="numeric" className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-9 text-sm font-mono"
              placeholder="••••"
              value={form.deletion_pin} onChange={e => setF('deletion_pin', e.target.value.replace(/\D/g, ''))} />
            <button type="button" onClick={() => setShowPin(!showPin)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {showPin ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || form.deletion_pin.trim().length < 4}
          className="flex items-center gap-2 px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar PIN'}
        </button>
      </div>
    </div>
  )
}
