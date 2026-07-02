import { useEffect, useState } from 'react'
import { Building2, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { companyService, type CompanyConfig } from '@/services/company.service'

interface TenantCompanyEditModalProps {
  open: boolean
  onClose: () => void
  company: CompanyConfig | null
  onSaved: (patch: Partial<CompanyConfig>) => void
}

export function TenantCompanyEditModal({
  open,
  onClose,
  company,
  onSaved,
}: TenantCompanyEditModalProps) {
  const [draft, setDraft] = useState({
    trade_name: '',
    phone: '',
    address: '',
    email: '',
    additional_notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !company) return
    setDraft({
      trade_name: company.trade_name?.trim() ?? '',
      phone: company.phone?.trim() ?? '',
      address: company.address?.trim() ?? '',
      email: company.email?.trim() ?? '',
      additional_notes: company.additional_notes?.trim() ?? '',
    })
  }, [open, company])

  const setField = (key: keyof typeof draft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await companyService.updateConfig({
        trade_name: draft.trade_name.trim(),
        phone: draft.phone.trim(),
        address: draft.address.trim(),
        email: draft.email.trim(),
        additional_notes: draft.additional_notes.trim(),
      })
      onSaved({
        trade_name: draft.trade_name.trim(),
        phone: draft.phone.trim(),
        address: draft.address.trim(),
        email: draft.email.trim(),
        additional_notes: draft.additional_notes.trim(),
      })
      toast.success('Datos de la empresa actualizados')
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-lg">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Building2 size={18} className="text-gray-400 shrink-0" />
          <div className="min-w-0">
            <h3 className="font-bold text-gray-800">Datos en el comprobante</h3>
            <p className="text-xs text-gray-500">Nombre comercial, contacto y dirección del emisor</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-50"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre comercial</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={draft.trade_name}
            onChange={(e) => setField('trade_name', e.target.value)}
            placeholder="Nombre comercial"
            disabled={saving}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={draft.phone}
            onChange={(e) => setField('phone', e.target.value)}
            placeholder="Teléfono"
            disabled={saving}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
          <textarea
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none"
            value={draft.address}
            onChange={(e) => setField('address', e.target.value)}
            placeholder="Dirección fiscal / comercial"
            disabled={saving}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Correo</label>
          <input
            type="email"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            value={draft.email}
            onChange={(e) => setField('email', e.target.value)}
            placeholder="correo@empresa.com"
            disabled={saving}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Información adicional</label>
          <textarea
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y min-h-[96px]"
            value={draft.additional_notes}
            onChange={(e) => setField('additional_notes', e.target.value)}
            placeholder="Horarios, leyendas en tickets, datos bancarios, políticas, etc."
            disabled={saving}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Se imprime en tickets y comprobantes térmicos. No se muestra en el encabezado de esta pantalla.
          </p>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="px-4 py-2.5 rounded-xl bg-primary-600 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Guardar
        </button>
      </div>
    </Modal>
  )
}
