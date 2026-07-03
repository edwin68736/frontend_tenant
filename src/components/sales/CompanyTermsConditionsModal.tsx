import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { companyService } from '@/services/company.service'

type Props = {
  open: boolean
  onClose: () => void
  value: string
  onSaved: (terms: string) => void
}

export function CompanyTermsConditionsModal({ open, onClose, value, onSaved }: Props) {
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setDraft(value ?? '')
  }, [open, value])

  const handleSave = async () => {
    setSaving(true)
    try {
      const current = await companyService.getConfig()
      await companyService.updateConfig({
        ...current,
        terms_and_conditions: draft.trim(),
      })
      onSaved(draft.trim())
      toast.success('Términos y condiciones actualizados')
      onClose()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-lg w-full mx-2 sm:mx-0">
      <h3 className="font-bold text-gray-800">Términos y condiciones</h3>
      <p className="text-xs text-gray-500 mt-1">
        Texto global de la empresa. Se imprime en comprobantes, notas de venta y cotizaciones mientras la opción
        «Mostrar términos y condiciones» esté activa (preferencia de la empresa).
      </p>
      <textarea
        rows={8}
        className="w-full mt-3 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y min-h-[140px]"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Ej.: Plazo de pago 30 días, garantía, política de cambios…"
      />
      <div className="flex gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : null}
          Guardar
        </button>
      </div>
    </Modal>
  )
}
