import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { EMPLOYEE_TYPES, restaurantService } from '@/services/restaurant.service'
import type { TenantUser } from '@/services/users.service'
import type { RestaurantStaffState } from './types'

type Props = {
  user: TenantUser | null
  open: boolean
  staff: RestaurantStaffState | undefined
  onClose: () => void
  onSaved: (userId: number, staff: RestaurantStaffState | undefined) => void
}

export function RestaurantUserProfileModal({ user, open, staff, onClose, onSaved }: Props) {
  const [employeeType, setEmployeeType] = useState('')
  const [pin, setPin] = useState('')
  const [clearPin, setClearPin] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmployeeType(staff?.employeeType ?? '')
    setPin('')
    setClearPin(false)
  }, [open, staff?.employeeType, staff?.hasPin])

  const hasPinCurrently = !!staff?.hasPin

  const handleSave = async () => {
    if (!user) return
    const pinDigits = pin.replace(/\D/g, '')
    if (employeeType && !clearPin && pinDigits && (pinDigits.length < 4 || pinDigits.length > 6)) {
      toast.error('PIN de operación: 4 a 6 dígitos')
      return
    }
    setSaving(true)
    try {
      const res = await restaurantService.setUserStaff(user.id, {
        employee_type: employeeType,
        ...(pinDigits ? { pin: pinDigits } : {}),
        ...(clearPin ? { clear_pin: true } : {}),
      })
      const next: RestaurantStaffState | undefined = employeeType
        ? { employeeType, hasPin: res.has_pin ?? false }
        : undefined
      onSaved(user.id, next)
      toast.success(employeeType ? 'Perfil de restaurante guardado' : 'Acceso restaurante quitado')
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      const isDup =
        msg?.toLowerCase().includes('pin ya está asignado') ||
        msg?.toLowerCase().includes('pin duplicado')
      toast.error(
        isDup
          ? 'Ese PIN ya lo usa otro usuario. Elija otro PIN de 4 a 6 dígitos.'
          : msg ?? 'Error al guardar',
      )
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-md w-full mx-2">
      <h3 className="font-bold text-gray-800 text-base">Perfil restaurante</h3>
      <p className="text-xs text-gray-500 mt-1 mb-4">
        {user.name} · {user.email}
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de empleado</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={employeeType}
            onChange={e => setEmployeeType(e.target.value)}
          >
            {EMPLOYEE_TYPES.map(r => (
              <option key={r.value || 'none'} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-gray-400 mt-1">
            Solo usuarios con perfil pueden usar Tukichef (POS, cocina, etc.).
          </p>
        </div>

        {employeeType ? (
          <div className="border border-gray-100 rounded-xl p-3 space-y-3 bg-gray-50/50">
            <div>
              <p className="text-xs font-medium text-gray-600">PIN de operación (Tukichef)</p>
              <p className="text-[10px] text-gray-400 mt-0.5">
                Login rápido en terminal. Cada PIN debe ser único entre los usuarios del restaurante.
              </p>
              <p className="text-xs mt-2">
                Estado:{' '}
                <span className={hasPinCurrently && !clearPin ? 'text-green-700 font-medium' : 'text-gray-500'}>
                  {clearPin ? 'Se quitará al guardar' : hasPinCurrently ? 'PIN configurado' : 'Sin PIN'}
                </span>
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nuevo PIN (opcional)</label>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                disabled={clearPin}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono bg-white disabled:bg-gray-100"
                placeholder="4–6 dígitos"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={clearPin}
                onChange={e => {
                  setClearPin(e.target.checked)
                  if (e.target.checked) setPin('')
                }}
                className="rounded border-gray-300"
              />
              Quitar PIN
            </label>
          </div>
        ) : (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2">
            Sin perfil de restaurante: este usuario no accede a Tukichef.
          </p>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
