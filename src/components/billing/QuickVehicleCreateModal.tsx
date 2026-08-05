import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { PortalModal } from '@/components/ui/PortalModal'
import { fleetService, type GreVehicle } from '@/services/fleet.service'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (vehicle: GreVehicle) => void
  stacked?: boolean
}

const emptyForm = () => ({
  plate: '',
  brand: '',
  model: '',
  habilitation_cert: '',
  is_default: false,
  active: true,
})

/**
 * Alta rápida de vehículo desde el formulario de guía.
 *
 * Misma razón que QuickCarrierCreateModal/QuickDriverCreateModal.
 */
export function QuickVehicleCreateModal({ open, onClose, onCreated, stacked = false }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<ReturnType<typeof emptyForm>>) => setForm((f) => ({ ...f, ...p }))

  const handleSave = async () => {
    if (!form.plate.trim()) {
      toast.error('La placa es obligatoria')
      return
    }
    setSaving(true)
    try {
      const created = await fleetService.createVehicle(form)
      toast.success('Vehículo registrado')
      onCreated(created)
      onClose()
      setForm(emptyForm())
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const body = (
    <>
      <h3 className="font-bold text-gray-800 text-lg mb-3">Nuevo vehículo</h3>
      <div className="space-y-3 text-sm">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Placa *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono uppercase"
            value={form.plate}
            onChange={(e) => patch({ plate: e.target.value.toUpperCase() })}
            placeholder="ABC-123"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Marca</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.brand}
              onChange={(e) => patch({ brand: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Modelo</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.model}
              onChange={(e) => patch({ model: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Certificado habilitación vehicular</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
            value={form.habilitation_cert}
            onChange={(e) => patch({ habilitation_cert: e.target.value })}
            placeholder="Nº certificado SUNAT / MTC"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => patch({ is_default: e.target.checked })}
          />
          Usar como vehículo predeterminado en guías
        </label>
        <div className="flex gap-2 pt-2">
          <button type="button" onClick={onClose} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Registrar vehículo'}
          </button>
        </div>
      </div>
    </>
  )

  if (stacked) {
    return (
      <PortalModal open={open} onClose={onClose} className="max-w-xl w-[min(100%,36rem)]" stacked>
        <div className="rounded-2xl bg-white p-6 sm:p-7 shadow-xl w-full">{body}</div>
      </PortalModal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-xl w-[min(100%,36rem)]">
      {body}
    </Modal>
  )
}
