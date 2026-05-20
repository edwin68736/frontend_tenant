import { useState } from 'react'
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
  const [showPin, setShowPin] = useState(false)
  const [saving, setSaving] = useState(false)

  const setF = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await restaurantService.updateSettings({ deletion_pin: form.deletion_pin })
      toast.success('Ajustes de restaurante guardados')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error guardando')
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

      {/* Cómo funciona el acceso */}
      <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
        <p className="text-sm text-slate-700">
          El módulo de restaurante utiliza el mismo acceso que este panel: los usuarios inician sesión con su usuario y contraseña y las peticiones se autentican con Bearer token. No hace falta configurar URL de comandas ni API Key. Más adelante podrás usar un frontend dedicado para mesas y comandas que se conectará de la misma forma (login y token).
        </p>
      </div>

      {/* Seguridad operativa */}
      <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2"><KeyRound size={14} /> Seguridad operativa</h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">PIN de eliminación</label>
          <p className="text-xs text-gray-400 mb-2">Código numérico requerido para eliminar o cancelar ítems en el módulo de restaurante (por ejemplo al anular una comanda).</p>
          <div className="relative w-40">
            <input type={showPin ? 'text' : 'password'} maxLength={6} className="w-full border border-gray-200 rounded-xl px-3 py-2 pr-9 text-sm font-mono"
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
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-5 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
          <Save size={15} /> {saving ? 'Guardando...' : 'Guardar ajustes'}
        </button>
      </div>
    </div>
  )
}
