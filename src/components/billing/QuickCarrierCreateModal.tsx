import { useState } from 'react'
import { toast } from 'sonner'
import { Search } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { PortalModal } from '@/components/ui/PortalModal'
import { fleetService, type GreCarrier } from '@/services/fleet.service'
import { companyService } from '@/services/company.service'
import { consultaService } from '@/services/consulta.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST } from '@/constants/sunat'

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (carrier: GreCarrier) => void
  /** Capa superior (se abre encima del formulario de guía, que ya es un modal). */
  stacked?: boolean
}

const emptyForm = () => ({
  doc_type: '6',
  doc_number: '',
  business_name: '',
  fiscal_address: '',
  mtc_number: '',
  is_default: false,
  active: true,
})

/**
 * Alta rápida de transportista desde el formulario de guía.
 *
 * Antes había que salir a «Transportistas GRE», crear el registro y volver a armar la guía
 * desde cero. Este modal se abre encima y devuelve el transportista recién creado ya
 * seleccionado.
 */
export function QuickCarrierCreateModal({ open, onClose, onCreated, stacked = false }: Props) {
  const [form, setForm] = useState(emptyForm)
  const [tenantRuc, setTenantRuc] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [saving, setSaving] = useState(false)

  const patch = (p: Partial<ReturnType<typeof emptyForm>>) => setForm((f) => ({ ...f, ...p }))

  const handleConsultaRuc = async () => {
    const num = form.doc_number.trim().replace(/-/g, '')
    if (form.doc_type !== '6') {
      toast.error('La consulta SUNAT solo aplica para RUC (código 6)')
      return
    }
    if (num.length !== 11) {
      toast.error('Ingrese un RUC de 11 dígitos')
      return
    }
    const ruc = tenantRuc || (await companyService.getConfig().then((c) => c.ruc ?? '').catch(() => ''))
    if (ruc.length !== 11) {
      toast.error('Configure el RUC de su empresa primero')
      return
    }
    setTenantRuc(ruc)
    setConsultando(true)
    try {
      const res = await consultaService.ruc(ruc, num)
      if (!res.success || !res.razon_social) {
        toast.error('No se encontró el RUC en SUNAT')
        return
      }
      patch({
        business_name: res.razon_social ?? form.business_name,
        fiscal_address: res.direccion ?? res.direccion_completa ?? form.fiscal_address,
      })
      toast.success('Datos obtenidos de SUNAT')
    } catch {
      toast.error('Error consultando RUC')
    } finally {
      setConsultando(false)
    }
  }

  const handleSave = async () => {
    if (!form.doc_number.trim() || !form.business_name.trim()) {
      toast.error('Documento y nombre son obligatorios')
      return
    }
    setSaving(true)
    try {
      const created = await fleetService.createCarrier(form)
      toast.success('Transportista registrado')
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
      <h3 className="font-bold text-gray-800 text-lg mb-3">Nuevo transportista</h3>
      <div className="space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento (cat. 06) *</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.doc_type}
              onChange={(e) => patch({ doc_type: e.target.value })}
            >
              {SUNAT_TIPO_DOC_IDENTIDAD_LIST.filter((d) => ['6', '1', '4', '7', '0'].includes(d.code)).map((d) => (
                <option key={d.code} value={d.code}>
                  {d.code} — {d.shortLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº documento *</label>
            <div className="flex gap-1">
              <input
                className="flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 font-mono"
                value={form.doc_number}
                onChange={(e) => patch({ doc_number: e.target.value })}
                placeholder={form.doc_type === '6' ? '20123456789' : 'Documento'}
              />
              {form.doc_type === '6' && (
                <button
                  type="button"
                  onClick={handleConsultaRuc}
                  disabled={consultando}
                  className="shrink-0 px-3 rounded-xl border border-[rgb(var(--p400))] text-[rgb(var(--p700))] hover:bg-[rgb(var(--p50))] disabled:opacity-50"
                  title="Consultar RUC en SUNAT"
                >
                  <Search size={16} className={consultando ? 'animate-pulse' : ''} />
                </button>
              )}
            </div>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / razón social *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2"
            value={form.business_name}
            onChange={(e) => patch({ business_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dirección fiscal</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2"
            value={form.fiscal_address}
            onChange={(e) => patch({ fiscal_address: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nº registro MTC</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
            value={form.mtc_number}
            onChange={(e) => patch({ mtc_number: e.target.value })}
            placeholder="Registro MTC SUNAT"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => patch({ is_default: e.target.checked })}
          />
          Usar como transportista predeterminado en guías
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
            {saving ? 'Guardando…' : 'Registrar transportista'}
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
