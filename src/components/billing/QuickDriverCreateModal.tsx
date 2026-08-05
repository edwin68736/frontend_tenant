import { useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { PortalModal } from '@/components/ui/PortalModal'
import { fleetService, type GreDriver } from '@/services/fleet.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST } from '@/constants/sunat'
import { isValidGreLicencia, normalizeGreLicencia } from '@/utils/greDriver'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (driver: GreDriver) => void
  stacked?: boolean
}

const emptyForm = () => ({
  doc_type: '1',
  doc_number: '',
  full_name: '',
  license_number: '',
  phone: '',
  is_default: false,
  active: true,
})

/**
 * Alta rápida de conductor desde el formulario de guía.
 *
 * Misma razón que QuickCarrierCreateModal: evitar que el usuario abandone la guía a medio
 * llenar para ir a registrar el conductor y volver.
 */
export function QuickDriverCreateModal({ open, onClose, onCreated, stacked = false }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<ReturnType<typeof emptyForm>>) => setForm((f) => ({ ...f, ...p }))

  const handleSave = async () => {
    if (!form.doc_number.trim() || !form.full_name.trim()) {
      toast.error('Documento y nombre son obligatorios')
      return
    }
    const licNorm = normalizeGreLicencia(form.license_number)
    if (!licNorm) {
      toast.error('La licencia de conducir es obligatoria para guías GRE')
      return
    }
    if (!isValidGreLicencia(licNorm)) {
      toast.error('Licencia inválida: use 9-10 caracteres alfanuméricos (no el DNI)')
      return
    }
    if (form.doc_number.trim() === licNorm) {
      toast.error('La licencia no puede ser igual al documento')
      return
    }
    setSaving(true)
    try {
      const created = await fleetService.createDriver({ ...form, license_number: licNorm })
      toast.success('Conductor registrado')
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
      <h3 className="font-bold text-gray-800 text-lg mb-3">Nuevo conductor</h3>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento (cat. 06) *</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.doc_type}
              onChange={(e) => patch({ doc_type: e.target.value })}
            >
              {SUNAT_TIPO_DOC_IDENTIDAD_LIST.filter((d) => ['1', '4', '7', '0'].includes(d.code)).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.shortLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº documento *</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
              value={form.doc_number}
              onChange={(e) => patch({ doc_number: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre completo *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2"
            value={form.full_name}
            onChange={(e) => patch({ full_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nº licencia de conducir *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
            value={form.license_number}
            onChange={(e) => patch({ license_number: e.target.value.toUpperCase() })}
            placeholder="9-10 caracteres (ej. 0001122020)"
          />
          <p className="text-[11px] text-gray-500 mt-1">No use el DNI. Valide en slcp.mtc.gob.pe</p>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2"
            value={form.phone}
            onChange={(e) => patch({ phone: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => patch({ is_default: e.target.checked })}
          />
          Usar como conductor predeterminado en guías
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
            {saving ? 'Guardando…' : 'Registrar conductor'}
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
