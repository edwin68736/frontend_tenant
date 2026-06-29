import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { SearchCheck } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { PortalModal } from '@/components/ui/PortalModal'
import {
  contactsService,
  type Contact,
  type CreateContactInput,
} from '@/services/contacts.service'
import { consultaService } from '@/services/consulta.service'
import { companyService } from '@/services/company.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST, toTipoDocIdentidadCode } from '@/constants/sunat'
import {
  contactDocNumberPlaceholder,
  contactDocSupportsConsulta,
  sanitizeContactDocNumber,
} from '@/utils/contactDocTypes'

type QuickContactForm = {
  doc_type: string
  doc_number: string
  business_name: string
  address: string
  phone: string
  email: string
  ubigeo: string
  es_agente_de_retencion: boolean
  es_agente_de_percepcion: boolean
  es_agente_de_percepcion_combustible: boolean
  es_buen_contribuyente: boolean
}

const emptyForm = (defaultDocType = '1'): QuickContactForm => ({
  doc_type: defaultDocType,
  doc_number: '',
  business_name: '',
  address: '',
  phone: '',
  email: '',
  ubigeo: '',
  es_agente_de_retencion: false,
  es_agente_de_percepcion: false,
  es_agente_de_percepcion_combustible: false,
  es_buen_contribuyente: false,
})

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (contact: Contact) => void
  /** Código SUNAT de tipo doc. identidad (ej. 1 DNI, 6 RUC). */
  defaultDocType?: string
  /** Tipo de contacto a crear (cliente o proveedor). */
  contactType?: 'customer' | 'supplier'
  /** Capa superior (p. ej. sobre modal de cobro en POS). */
  stacked?: boolean
}

export function QuickContactCreateModal({
  open,
  onClose,
  onCreated,
  defaultDocType = '1',
  contactType = 'customer',
  stacked = false,
}: Props) {
  const [form, setForm] = useState<QuickContactForm>(() => emptyForm(defaultDocType))
  const [tenantRuc, setTenantRuc] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(emptyForm(defaultDocType))
  }, [open, defaultDocType])

  useEffect(() => {
    companyService.getConfig().then((c) => setTenantRuc(c?.ruc ?? '')).catch(() => setTenantRuc(''))
  }, [])

  const docType = toTipoDocIdentidadCode(form.doc_type)
  const showConsulta = contactDocSupportsConsulta(docType)
  const entityLabel = contactType === 'supplier' ? 'proveedor' : 'cliente'
  const entityLabelCap = contactType === 'supplier' ? 'Proveedor' : 'Cliente'

  const patch = (patch: Partial<QuickContactForm>) => setForm((f) => ({ ...f, ...patch }))

  const handleConsulta = async () => {
    const num = form.doc_number.trim().replace(/-/g, '')
    const isRUC = docType === '6'
    const isDNI = docType === '1'
    if (isRUC && num.length !== 11) {
      toast.error('Ingrese un RUC de 11 dígitos')
      return
    }
    if (isDNI && num.length !== 8) {
      toast.error('Ingrese un DNI de 8 dígitos')
      return
    }
    if (!tenantRuc || tenantRuc.length !== 11) {
      toast.error('RUC de la empresa no configurado')
      return
    }
    setConsultando(true)
    try {
      if (isRUC) {
        const res = await consultaService.ruc(tenantRuc, num)
        if (!res.success || !res.razon_social) {
          toast.error('No se encontró el RUC')
          return
        }
        patch({
          business_name: res.razon_social ?? '',
          address: res.direccion ?? '',
          ubigeo: res.ubigeo && res.ubigeo.length >= 6 ? res.ubigeo.slice(0, 6) : '',
          es_agente_de_retencion: res.es_agente_de_retencion ?? false,
          es_agente_de_percepcion: res.es_agente_de_percepcion ?? false,
          es_agente_de_percepcion_combustible: res.es_agente_de_percepcion_combustible ?? false,
          es_buen_contribuyente: res.es_buen_contribuyente ?? false,
        })
      } else {
        const res = await consultaService.dni(tenantRuc, num)
        if (!res.success || !res.nombre_completo) {
          toast.error('No se encontró el DNI')
          return
        }
        patch({ business_name: res.nombre_completo ?? '' })
      }
      toast.success('Datos obtenidos')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al consultar')
    } finally {
      setConsultando(false)
    }
  }

  const handleSave = async () => {
    const num = sanitizeContactDocNumber(docType, form.doc_number)
    if (!num && docType !== '0') {
      toast.error('Ingrese número de documento')
      return
    }
    if (!form.business_name.trim()) {
      toast.error('Ingrese nombre o razón social')
      return
    }
    setSaving(true)
    try {
      const payload: CreateContactInput = {
        type: contactType,
        doc_type: docType,
        doc_number: num,
        business_name: form.business_name.trim(),
        address: form.address.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        ubigeo: form.ubigeo.trim() || undefined,
      }
      if (docType === '6') {
        payload.es_agente_de_retencion = form.es_agente_de_retencion
        payload.es_agente_de_percepcion = form.es_agente_de_percepcion
        payload.es_agente_de_percepcion_combustible = form.es_agente_de_percepcion_combustible
        payload.es_buen_contribuyente = form.es_buen_contribuyente
      }
      const created = await contactsService.create(payload)
      toast.success(`${entityLabelCap} registrado`)
      onCreated(created)
      onClose()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al registrar')
    } finally {
      setSaving(false)
    }
  }

  const body = (
    <>
      <h3 className="font-bold text-gray-800 text-lg mb-3">Nuevo {entityLabel}</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de documento</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={docType}
              onChange={(e) =>
                patch({
                  doc_type: e.target.value,
                  doc_number: '',
                  es_agente_de_retencion: false,
                  es_agente_de_percepcion: false,
                  es_agente_de_percepcion_combustible: false,
                  es_buen_contribuyente: false,
                })
              }
            >
              {SUNAT_TIPO_DOC_IDENTIDAD_LIST.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.shortLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">N° Documento</label>
            {showConsulta ? (
              <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[rgb(var(--p600))] focus-within:border-[rgb(var(--p600))]">
                <input
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0"
                  value={form.doc_number}
                  onChange={(e) =>
                    patch({ doc_number: sanitizeContactDocNumber(docType, e.target.value) })
                  }
                  placeholder={contactDocNumberPlaceholder(docType)}
                />
                <button
                  type="button"
                  onClick={handleConsulta}
                  disabled={consultando || !form.doc_number.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 border-l border-gray-200 text-sm text-gray-600 hover:bg-gray-50 bg-gray-50/80 whitespace-nowrap disabled:opacity-50"
                  title="Consultar DNI o RUC"
                >
                  <SearchCheck size={14} className={consultando ? 'animate-pulse' : ''} />
                  {consultando ? '...' : 'Consultar'}
                </button>
              </div>
            ) : (
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.doc_number}
                onChange={(e) =>
                  patch({ doc_number: sanitizeContactDocNumber(docType, e.target.value) })
                }
                placeholder={contactDocNumberPlaceholder(docType)}
              />
            )}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / Razón social *</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Se completa con Consultar o ingrese manualmente"
            value={form.business_name}
            onChange={(e) => patch({ business_name: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Dirección (opcional)</label>
          <input
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
            placeholder="Se completa al consultar RUC"
            value={form.address}
            onChange={(e) => patch({ address: e.target.value })}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Celular (opcional)</label>
            <input
              type="tel"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder="Ej. 999 888 777"
              value={form.phone}
              onChange={(e) => patch({ phone: e.target.value })}
              autoComplete="tel"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Correo (opcional)</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              placeholder={contactType === 'supplier' ? 'proveedor@ejemplo.com' : 'cliente@ejemplo.com'}
              value={form.email}
              onChange={(e) => patch({ email: e.target.value })}
              autoComplete="email"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !form.business_name.trim()}
            className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Guardando...' : `Registrar ${entityLabel}`}
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
