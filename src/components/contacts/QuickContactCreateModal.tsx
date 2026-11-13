import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { PortalModal } from '@/components/ui/PortalModal'
import {
  contactsService,
  type Contact,
  type CreateContactInput,
} from '@/services/contacts.service'
import { ConsultaButton, ManualNameToggle, nameInputClass } from '@/components/contacts/ContactLookupControls'
import { ContactCountryField, contactDocNeedsCountry } from '@/components/contacts/ContactCountryField'
import { consultaService } from '@/services/consulta.service'
import { companyService } from '@/services/company.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST, toTipoDocIdentidadCode } from '@/constants/sunat'
import {
  contactDocNumberPlaceholder,
  contactDocSupportsConsulta,
  sanitizeContactDocNumber,
} from '@/utils/contactDocTypes'

/**
 * Orden del <select> de este modal: RUC primero (el más común al registrar un cliente desde
 * ventas/compras), luego DNI, luego el resto tal cual están en SUNAT_TIPO_DOC_IDENTIDAD_LIST.
 * Es un reorden local — no se toca la lista compartida porque otras pantallas (Conductores,
 * Transportistas) sí prefieren DNI primero por ser personas naturales.
 */
const DOC_TYPE_OPTIONS_ORDERED = (() => {
  const byCode = (code: string) => SUNAT_TIPO_DOC_IDENTIDAD_LIST.find(d => d.code === code)
  const first = ['6', '1'].map(byCode).filter((d): d is NonNullable<typeof d> => !!d)
  const rest = SUNAT_TIPO_DOC_IDENTIDAD_LIST.filter(d => d.code !== '6' && d.code !== '1')
  return [...first, ...rest]
})()

type QuickContactForm = {
  doc_type: string
  doc_number: string
  business_name: string
  address: string
  phone: string
  email: string
  ubigeo: string
  country: string
  es_agente_de_retencion: boolean
  es_agente_de_percepcion: boolean
  es_agente_de_percepcion_combustible: boolean
  es_buen_contribuyente: boolean
}

const emptyForm = (defaultDocType = '6'): QuickContactForm => ({
  doc_type: defaultDocType,
  doc_number: '',
  business_name: '',
  address: '',
  phone: '',
  email: '',
  ubigeo: '',
  country: '',
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
  /**
   * Precarga el número de documento — p. ej. cuando el usuario ya lo escribió en un buscador
   * de cliente que no encontró resultados y abrió este modal desde ahí ("+ Agregar"), para no
   * hacerlo escribirlo de nuevo. Se limpia junto con el resto del formulario en cada apertura.
   */
  defaultDocNumber?: string
  /** Igual que `defaultDocNumber`, pero cuando lo escrito no parece un RUC/DNI (búsqueda por nombre). */
  defaultBusinessName?: string
}

export function QuickContactCreateModal({
  open,
  onClose,
  onCreated,
  defaultDocType = '6',
  contactType = 'customer',
  stacked = false,
  defaultDocNumber,
  defaultBusinessName,
}: Props) {
  const [form, setForm] = useState<QuickContactForm>(() => emptyForm(defaultDocType))
  const [tenantRuc, setTenantRuc] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Con RUC/DNI la razón social viene de la consulta (bloqueada); este interruptor permite escribirla a mano. */
  const [manualName, setManualName] = useState(false)
  /** Evita reconsultar en cada render mientras el modal sigue abierto; se resetea al cerrar. */
  const autoConsultedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      autoConsultedRef.current = false
      return
    }
    setForm({
      ...emptyForm(defaultDocType),
      doc_number: defaultDocNumber?.trim() || '',
      business_name: defaultBusinessName?.trim() || '',
    })
    // Si llega un nombre escrito en el buscador (sin documento), se deja editable.
    setManualName(Boolean(defaultBusinessName?.trim()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDocType, defaultDocNumber, defaultBusinessName])

  useEffect(() => {
    companyService.getConfig().then((c) => setTenantRuc(c?.ruc ?? '')).catch(() => setTenantRuc(''))
  }, [])

  const docType = toTipoDocIdentidadCode(form.doc_type)
  const showConsulta = contactDocSupportsConsulta(docType)
  const entityLabel = contactType === 'supplier' ? 'proveedor' : 'cliente'
  const entityLabelCap = contactType === 'supplier' ? 'Proveedor' : 'Cliente'

  const nameLocked = showConsulta && !manualName

  const patch = (patch: Partial<QuickContactForm>) => setForm((f) => ({ ...f, ...patch }))

  const runConsulta = async (targetDocType: string, rawNum: string) => {
    const num = rawNum.trim().replace(/-/g, '')
    const isRUC = targetDocType === '6'
    const isDNI = targetDocType === '1'
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

  const handleConsulta = () => runConsulta(docType, form.doc_number)

  /**
   * Auto-consulta cuando el modal se abre con un documento precargado (ej. desde
   * "+ Agregar «lo que se tecleó en el buscador»") y ya cumple el largo esperado para su
   * tipo (11 RUC / 8 DNI) — evita el clic extra en "Consultar" para el caso feliz. Depende de
   * `tenantRuc` porque puede no haber cargado todavía cuando se abre el modal (efecto aparte,
   * en el montaje); en ese caso este efecto no hace nada y se reintenta solo cuando llegue.
   */
  useEffect(() => {
    if (!open || autoConsultedRef.current) return
    const type = toTipoDocIdentidadCode(defaultDocType)
    const num = (defaultDocNumber ?? '').trim()
    const isRUC = type === '6' && num.length === 11
    const isDNI = type === '1' && num.length === 8
    if (!isRUC && !isDNI) return
    if (!tenantRuc || tenantRuc.length !== 11) return
    autoConsultedRef.current = true
    void runConsulta(type, num)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDocType, defaultDocNumber, tenantRuc])

  const handleSave = async () => {
    const num = sanitizeContactDocNumber(docType, form.doc_number)
    if (!num && docType !== '0') {
      toast.error('Ingrese número de documento')
      return
    }
    if (!form.business_name.trim()) {
      toast.error(nameLocked ? 'Consulte el documento para traer la razón social, o active «Escribir manualmente»' : 'Ingrese nombre o razón social')
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
        country: contactDocNeedsCountry(docType) ? form.country || undefined : undefined,
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
              onChange={(e) => {
                setManualName(false)
                patch({
                  doc_type: e.target.value,
                  doc_number: '',
                  business_name: showConsulta ? '' : form.business_name,
                  es_agente_de_retencion: false,
                  es_agente_de_percepcion: false,
                  es_agente_de_percepcion_combustible: false,
                  es_buen_contribuyente: false,
                })
              }}
            >
              {DOC_TYPE_OPTIONS_ORDERED.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.shortLabel}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">N° Documento</label>
            {showConsulta ? (
              <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white">
                <input
                  className="flex-1 min-w-0 px-3 py-2 border-0 text-sm"
                  value={form.doc_number}
                  onChange={(e) =>
                    // Cambiar el número invalida el nombre traído antes: se vuelve a consultar (salvo escritura manual).
                    patch({
                      doc_number: sanitizeContactDocNumber(docType, e.target.value),
                      ...(nameLocked ? { business_name: '' } : {}),
                    })
                  }
                  placeholder={contactDocNumberPlaceholder(docType)}
                />
                <ConsultaButton onClick={handleConsulta} disabled={consultando || !form.doc_number.trim()} loading={consultando} title="Consultar DNI o RUC" />
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
          <div className="mb-1 flex items-center justify-between gap-2">
            <label className="block text-xs font-medium text-gray-600">Nombre / Razón social *</label>
            {showConsulta && <ManualNameToggle checked={manualName} onChange={setManualName} />}
          </div>
          <input
            className={nameInputClass(nameLocked)}
            placeholder={nameLocked ? 'Se completa al consultar el documento' : 'Ingrese el nombre o razón social'}
            value={form.business_name}
            readOnly={nameLocked}
            onChange={(e) => patch({ business_name: e.target.value })}
          />
        </div>
        {contactDocNeedsCountry(docType) && <ContactCountryField value={form.country} onChange={(v) => patch({ country: v })} />}
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
