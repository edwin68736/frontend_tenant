import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight, SearchCheck, Eye, Users } from 'lucide-react'
import {
  contactsService,
  type Contact,
  type ContactPersonInput,
  type CreateContactInput,
} from '@/services/contacts.service'
import {
  ContactFormExtras,
  type ContactPersonDraft,
  newContactPersonRow,
} from '@/components/contacts/ContactFormExtras'
import { ContactDetailModal, ContactPersonsModal } from '@/components/contacts/ContactViewModals'
import type { ContactPerson } from '@/services/contacts.service'
import { consultaService } from '@/services/consulta.service'
import { companyService } from '@/services/company.service'
import { UbigeoSelects } from '@/components/UbigeoSelects'
import { ubigeoToIds } from '@/services/ubigeo.service'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import {
  SUNAT_TIPO_DOC_IDENTIDAD_LIST,
  formatTipoDocIdentidadDisplay,
  toTipoDocIdentidadCode,
} from '@/constants/sunat'
import { DEFAULT_CONTACT_ADDRESS, DEFAULT_CONTACT_UBIGEO_DISTRITO } from '@/constants/contactDefaults'

const TABS = [
  { key: 'customer' as const, label: 'Clientes' },
  { key: 'supplier' as const, label: 'Proveedores' },
]

type ContactTab = (typeof TABS)[number]['key']

const empty = (): CreateContactInput => ({
  type: 'customer',
  doc_type: '6',
  doc_number: '',
  business_name: '',
  trade_name: '',
  address: DEFAULT_CONTACT_ADDRESS,
  ubigeo: '',
  phone: '',
  email: '',
  es_agente_de_retencion: false,
  es_agente_de_percepcion: false,
  es_agente_de_percepcion_combustible: false,
  es_buen_contribuyente: false,
})

export default function ContactsPage() {
  return <RequireModule moduleKey="contacts"><ContactsContent /></RequireModule>
}

function ContactsContent() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [tab, setTab] = useState<ContactTab>('customer')
  const [showInactiveOnly, setShowInactiveOnly] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [personsModal, setPersonsModal] = useState<{ contact: Contact; persons: ContactPerson[] } | null>(null)
  const [personsModalLoading, setPersonsModalLoading] = useState(false)
  const [detailContact, setDetailContact] = useState<Contact | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [form, setForm] = useState<CreateContactInput>(empty())
  const [ubigeo, setUbigeo] = useState({ regionId: '', provinciaId: '', distritoId: '' })
  const [saving, setSaving] = useState(false)
  const [consultando, setConsultando] = useState(false)
  const [tenantRuc, setTenantRuc] = useState<string>('')
  const [modalTab, setModalTab] = useState<'general' | 'extra'>('general')
  const [contactPersons, setContactPersons] = useState<ContactPersonDraft[]>([])
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState('')
  const photoBlobRef = useRef<string | null>(null)

  const showExtraTab = form.type === 'customer' || form.type === 'supplier'
  const entityLabel = tab === 'supplier' ? 'proveedor' : 'cliente'
  const entityLabelCap = tab === 'supplier' ? 'Proveedor' : 'Cliente'
  const countContactPersons = (c: Contact) => (c.contact_persons ?? []).length

  const resetExtras = () => {
    setModalTab('general')
    setContactPersons([])
    setPhotoFile(null)
    if (photoBlobRef.current) {
      URL.revokeObjectURL(photoBlobRef.current)
      photoBlobRef.current = null
    }
    setPhotoPreview('')
  }

  const handlePhotoChange = (file: File | null) => {
    setPhotoFile(file)
    if (photoBlobRef.current) {
      URL.revokeObjectURL(photoBlobRef.current)
      photoBlobRef.current = null
    }
    if (file) {
      const url = URL.createObjectURL(file)
      photoBlobRef.current = url
      setPhotoPreview(url)
    }
  }

  const buildContactPersonsPayload = (): ContactPersonInput[] =>
    contactPersons
      .filter(p => p.name.trim() || p.phone.trim() || p.email.trim() || p.relationship.trim())
      .map(p => ({
        name: p.name.trim(),
        phone: p.phone.trim() || undefined,
        email: p.email.trim() || undefined,
        relationship: p.relationship.trim() || undefined,
      }))

  const validateContactPersons = (): boolean => {
    for (const p of contactPersons) {
      const hasOther = p.phone.trim() || p.email.trim() || p.relationship.trim()
      if (hasOther && !p.name.trim()) {
        toast.error('Cada contacto adicional debe tener nombre')
        setModalTab('extra')
        return false
      }
    }
    for (const p of buildContactPersonsPayload()) {
      if (!p.name) {
        toast.error('El nombre del contacto es obligatorio')
        setModalTab('extra')
        return false
      }
    }
    return true
  }

  const load = () => {
    setLoading(true)
    return contactsService.list(q, tab, showInactiveOnly ? 'inactive' : 'active')
      .then(d => setContacts(d ?? []))
      .catch(() => toast.error('Error cargando contactos'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [q, tab, showInactiveOnly])

  // RUC de la empresa (tenant) para las consultas públicas DNI/RUC
  useEffect(() => {
    companyService.getConfig().then((c) => setTenantRuc(c?.ruc ?? '')).catch(() => setTenantRuc(''))
  }, [])

  const openNew = () => {
    const typeFromTab = tab === 'supplier' ? 'supplier' : 'customer'
    setEditing(null)
    resetExtras()
    setForm({ ...empty(), type: typeFromTab })
    setUbigeo(ubigeoToIds(DEFAULT_CONTACT_UBIGEO_DISTRITO))
    setShowForm(true)
  }

  const openPersonsModal = async (c: Contact) => {
    const cached = c.contact_persons ?? []
    if (cached.length > 0) {
      setPersonsModal({ contact: c, persons: cached })
      return
    }
    setPersonsModal({ contact: c, persons: [] })
    setPersonsModalLoading(true)
    try {
      const full = await contactsService.get(c.id)
      setPersonsModal({ contact: c, persons: full.contact_persons ?? [] })
    } catch {
      toast.error('No se pudieron cargar los contactos')
      setPersonsModal(null)
    } finally {
      setPersonsModalLoading(false)
    }
  }

  const openDetail = async (c: Contact) => {
    setDetailContact(c)
    setDetailLoading(true)
    try {
      const full = await contactsService.get(c.id)
      setDetailContact(full)
    } catch {
      toast.error('No se pudieron cargar los datos')
      setDetailContact(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const openEdit = (c: Contact) => {
    setEditing(c)
    resetExtras()
    const rawUbi = (c.ubigeo ?? '').trim()
    const ubi = rawUbi || DEFAULT_CONTACT_UBIGEO_DISTRITO
    const ids = ubigeoToIds(ubi)
    const rawAddr = (c.address ?? '').trim()
    setForm({
      type: c.type,
      doc_type: toTipoDocIdentidadCode(c.doc_type),
      doc_number: c.doc_number,
      business_name: c.business_name,
      trade_name: c.trade_name,
      address: rawAddr || DEFAULT_CONTACT_ADDRESS,
      ubigeo: ubi,
      phone: c.phone,
      email: c.email,
      es_agente_de_retencion: c.es_agente_de_retencion ?? false,
      es_agente_de_percepcion: c.es_agente_de_percepcion ?? false,
      es_agente_de_percepcion_combustible: c.es_agente_de_percepcion_combustible ?? false,
      es_buen_contribuyente: c.es_buen_contribuyente ?? false,
    })
    setUbigeo({ regionId: ids.regionId, provinciaId: ids.provinciaId, distritoId: ids.distritoId })
    setShowForm(true)
    contactsService.get(c.id).then(full => {
      setContactPersons(
        (full.contact_persons ?? []).map(p => ({
          key: p.id ? String(p.id) : newContactPersonRow().key,
          name: p.name ?? '',
          phone: p.phone ?? '',
          email: p.email ?? '',
          relationship: p.relationship ?? '',
        })),
      )
      setPhotoPreview(full.photo_url ?? '')
    }).catch(() => toast.error('No se pudieron cargar foto y contactos adicionales'))
  }

  const closeFormModal = () => {
    resetExtras()
    setShowForm(false)
  }

  const setF = (k: keyof CreateContactInput, v: string | boolean) => setForm(f => ({ ...f, [k]: v }))

  const resetFiscalFlags = () =>
    setForm(f => ({
      ...f,
      es_agente_de_retencion: false,
      es_agente_de_percepcion: false,
      es_agente_de_percepcion_combustible: false,
      es_buen_contribuyente: false,
    }))

  const handleSave = async () => {
    if (!form.business_name || !form.doc_number) { toast.error('Nombre y documento son requeridos'); return }
    if (showExtraTab && !validateContactPersons()) return
    setSaving(true)
    try {
      const payload: CreateContactInput = {
        ...form,
        address: form.address ?? '',
        ubigeo: ubigeo.distritoId || undefined,
      }
      const docType = toTipoDocIdentidadCode(form.doc_type)
      if (docType !== '6') {
        delete payload.es_agente_de_retencion
        delete payload.es_agente_de_percepcion
        delete payload.es_agente_de_percepcion_combustible
        delete payload.es_buen_contribuyente
      }
      if (showExtraTab) {
        payload.contact_persons = buildContactPersonsPayload()
      }
      let saved: Contact
      if (editing) saved = await contactsService.update(editing.id, payload)
      else saved = await contactsService.create(payload)
      const contactId = editing?.id ?? saved.id
      if (photoFile && contactId) {
        try {
          await contactsService.uploadPhoto(contactId, photoFile)
        } catch (e: any) {
          toast.error(e.response?.data?.error ?? 'Contacto guardado, pero falló la subida de la foto')
        }
      }
      toast.success(editing ? 'Contacto actualizado' : 'Contacto creado')
      closeFormModal()
      load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este contacto?')) return
    try { await contactsService.delete(id); toast.success('Eliminado'); load() }
    catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
  }

  const handleToggle = async (c: Contact) => {
    try {
      await contactsService.toggle(c.id)
      toast.success(c.active ? `${entityLabelCap} desactivado` : `${entityLabelCap} reactivado`)
      load()
    } catch { toast.error('Error al cambiar el estado') }
  }

  /** Consulta DNI o RUC según tipo de documento y rellena nombre, dirección y ubigeo. */
  const handleConsulta = async () => {
    const docType = toTipoDocIdentidadCode(form.doc_type)
    const num = (form.doc_number ?? '').trim().replace(/-/g, '')
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
    if (!isRUC && !isDNI) {
      toast.error('La consulta automática solo está disponible para DNI (cód. 1) o RUC (cód. 6)')
      return
    }
    if (!tenantRuc || tenantRuc.length !== 11) {
      toast.error('No se pudo obtener el RUC de la empresa. Verifique la configuración de la empresa.')
      return
    }
    setConsultando(true)
    try {
      if (isRUC) {
        const res = await consultaService.ruc(tenantRuc, num)
        if (!res.success || !res.razon_social) {
          toast.error('No se encontró el RUC o el servicio no está disponible')
          return
        }
        setF('business_name', res.razon_social)
        setF('address', res.direccion ?? '')
        setF('es_agente_de_retencion', res.es_agente_de_retencion ?? false)
        setF('es_agente_de_percepcion', res.es_agente_de_percepcion ?? false)
        setF('es_agente_de_percepcion_combustible', res.es_agente_de_percepcion_combustible ?? false)
        setF('es_buen_contribuyente', res.es_buen_contribuyente ?? false)
        if (res.ubigeo && res.ubigeo.length >= 6) {
          setUbigeo({
            regionId: res.ubigeo.slice(0, 2),
            provinciaId: res.ubigeo.slice(0, 4),
            distritoId: res.ubigeo,
          })
        }
      } else {
        const res = await consultaService.dni(tenantRuc, num)
        if (!res.success || !res.nombre_completo) {
          toast.error('No se encontró el DNI o el servicio no está disponible')
          return
        }
        setF('business_name', res.nombre_completo)
      }
      toast.success('Datos obtenidos correctamente')
    } catch (e: any) {
      toast.error(e.response?.data?.error ?? 'Error al consultar')
    } finally {
      setConsultando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Clientes</h2>
          <p className="text-sm text-gray-500">{tab === 'supplier' ? 'Proveedores' : 'Clientes'}</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90">
          <Plus size={15} /> Nuevo {entityLabel}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-white border border-gray-200 rounded-xl overflow-hidden">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-[rgb(var(--p600))] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-52">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
            placeholder="Buscar..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <label className="inline-flex items-center gap-2 shrink-0 cursor-pointer select-none text-sm text-gray-600">
          <span>Solo inactivos</span>
          <button
            type="button"
            role="switch"
            aria-checked={showInactiveOnly}
            onClick={() => setShowInactiveOnly(v => !v)}
            className={`relative w-10 h-5 rounded-full transition-colors ${
              showInactiveOnly ? 'bg-[rgb(var(--p600))]' : 'bg-gray-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                showInactiveOnly ? 'translate-x-5' : ''
              }`}
            />
          </button>
        </label>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative min-h-[220px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-[1px]">
            <div className="w-7 h-7 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        )}
        <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Doc.', 'Nombre / Razón Social', 'Teléfono', 'Email', 'Contacto', 'Estado'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
              ))}
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => {
              const personsCount = countContactPersons(c)
              return (
              <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                  {formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number) || '—'}
                </td>
                <td className="px-4 py-3"><p className="font-medium text-gray-800">{c.business_name}</p>{c.trade_name && <p className="text-xs text-gray-400">{c.trade_name}</p>}</td>
                <td className="px-4 py-3 text-gray-500">{c.phone || '-'}</td>
                <td className="px-4 py-3 text-gray-500">{c.email || '-'}</td>
                <td className="px-4 py-3">
                  {personsCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => openPersonsModal(c)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--p600))] hover:underline"
                    >
                      <Users size={13} />
                      Ver ({personsCount})
                    </button>
                  ) : (
                    <span className="text-gray-400 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{c.active ? 'Activo' : 'Inactivo'}</span></td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => openDetail(c)}
                      className="p-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200"
                      title={`Ver ${entityLabel}`}
                    >
                      <Eye size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggle(c)}
                      className={`p-1.5 rounded-lg ${
                        c.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                      }`}
                      title={c.active ? 'Desactivar' : 'Reactivar'}
                    >
                      {c.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="p-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        </div>
        {!loading && contacts.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">
            {showInactiveOnly
              ? `No hay ${tab === 'supplier' ? 'proveedores' : 'clientes'} inactivos`
              : `No se encontraron ${tab === 'supplier' ? 'proveedores' : 'clientes'}`}
          </div>
        )}
      </div>

      <ContactPersonsModal
        open={!!personsModal}
        onClose={() => setPersonsModal(null)}
        contact={personsModal?.contact ?? null}
        persons={personsModal?.persons ?? []}
        loading={personsModalLoading}
        entityLabel={entityLabel}
      />

      <ContactDetailModal
        open={!!detailContact}
        onClose={() => setDetailContact(null)}
        contact={detailContact}
        loading={detailLoading}
        entityLabel={entityLabel}
      />

      <Modal open={showForm} onClose={closeFormModal} contentClassName="max-w-2xl max-h-[90vh] overflow-y-auto">
        <h3 className="font-bold text-gray-800 text-lg mb-3">
          {editing ? `Editar ${entityLabel}` : `Nuevo ${entityLabel}`}
        </h3>

        {showExtraTab && (
          <div className="flex border-b border-gray-200 mb-4">
            <button
              type="button"
              onClick={() => setModalTab('general')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                modalTab === 'general'
                  ? 'border-[rgb(var(--p600))] text-[rgb(var(--p600))]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Datos generales
            </button>
            <button
              type="button"
              onClick={() => setModalTab('extra')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                modalTab === 'extra'
                  ? 'border-[rgb(var(--p600))] text-[rgb(var(--p600))]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Más datos
            </button>
          </div>
        )}

        {(modalTab === 'general' || !showExtraTab) && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo de documento</label>
                <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={toTipoDocIdentidadCode(form.doc_type)} onChange={e => {
                    const next = e.target.value
                    setF('doc_type', next)
                    if (next !== '6') resetFiscalFlags()
                  }}>
                  {SUNAT_TIPO_DOC_IDENTIDAD_LIST.map(d => <option key={d.code} value={d.code}>{d.shortLabel}</option>)}
                </select>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">N° Documento *</label>
                {(() => {
                  const docType = toTipoDocIdentidadCode(form.doc_type)
                  const showConsulta = docType === '1' || docType === '6'
                  return showConsulta ? (
                    <div className="flex border border-gray-200 rounded-xl overflow-hidden bg-white focus-within:ring-2 focus-within:ring-[rgb(var(--p600))] focus-within:border-[rgb(var(--p600))]">
                      <input
                        className="flex-1 min-w-0 px-3 py-2 border-0 text-sm focus:outline-none focus:ring-0"
                        value={form.doc_number} onChange={e => setF('doc_number', e.target.value)}
                        placeholder={docType === '6' ? 'RUC 11 dígitos' : 'DNI 8 dígitos'}
                      />
                      <button
                        type="button"
                        onClick={handleConsulta}
                        disabled={consultando || !form.doc_number}
                        className="flex items-center gap-1.5 px-3 py-2 border-l border-gray-200 text-sm text-gray-600 hover:bg-gray-50 bg-gray-50/80 whitespace-nowrap disabled:opacity-50"
                        title="Consultar DNI o RUC en SUNAT"
                      >
                        <SearchCheck size={14} className={consultando ? 'animate-pulse' : ''} />
                        {consultando ? '...' : 'Consultar'}
                      </button>
                    </div>
                  ) : (
                    <input
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--p600))]"
                      value={form.doc_number} onChange={e => setF('doc_number', e.target.value)}
                      placeholder="Número de documento"
                    />
                  )
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Razón Social / Nombre *</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.business_name} onChange={e => setF('business_name', e.target.value)} />
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Nombre Comercial</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.trade_name ?? ''} onChange={e => setF('trade_name', e.target.value)} />
              </div>
            </div>
            <p className="text-xs font-medium text-gray-600 mt-2">Ubicación (para comprobantes electrónicos)</p>
            <UbigeoSelects
              regionId={ubigeo.regionId}
              provinciaId={ubigeo.provinciaId}
              distritoId={ubigeo.distritoId}
              onChange={(regionId, provinciaId, distritoId) => setUbigeo({ regionId, provinciaId, distritoId })}
            />
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Dirección</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.address ?? ''} onChange={e => setF('address', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Teléfono</label>
                <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.phone ?? ''} onChange={e => setF('phone', e.target.value)} />
              </div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                <input type="email" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={form.email ?? ''} onChange={e => setF('email', e.target.value)} />
              </div>
            </div>
            {toTipoDocIdentidadCode(form.doc_type) === '6' && (
              <label className="inline-flex items-center gap-2 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-[rgb(var(--p600))] focus:ring-[rgb(var(--p600))]"
                  checked={form.es_agente_de_retencion ?? false}
                  onChange={e => setF('es_agente_de_retencion', e.target.checked)}
                />
                <span className="text-sm text-gray-700">Agente de retención</span>
              </label>
            )}
          </div>
        )}

        {showExtraTab && modalTab === 'extra' && (
          <ContactFormExtras
            contactType={form.type}
            photoPreview={photoPreview}
            onPhotoChange={handlePhotoChange}
            persons={contactPersons}
            onPersonsChange={setContactPersons}
          />
        )}

        <div className="flex gap-2 pt-4 mt-2 border-t border-gray-100">
          <button
            onClick={closeFormModal}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
