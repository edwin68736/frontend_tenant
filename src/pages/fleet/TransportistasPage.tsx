import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, SearchCheck, Star, Truck, Search } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { fleetService, type GreCarrier } from '@/services/fleet.service'
import { companyService } from '@/services/company.service'
import { consultaService } from '@/services/consulta.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST } from '@/constants/sunat'

const FORM_INPUT =
  'w-full min-w-0 border border-gray-200 rounded-xl px-3 py-2.5 sm:py-2 text-base sm:text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))] focus:border-[rgb(var(--p400))]'

const MODAL_CLASS =
  'w-full max-w-none sm:max-w-lg max-h-[min(92dvh,720px)] !overflow-hidden flex flex-col gap-0 !p-0'

export default function TransportistasPage() {
  return (
    <RequireModule moduleKey="billing">
      <TransportistasContent />
    </RequireModule>
  )
}

function TransportistasContent() {
  const [list, setList] = useState<GreCarrier[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<GreCarrier | null>(null)
  const [tenantRuc, setTenantRuc] = useState('')
  const [consultando, setConsultando] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    doc_type: '6',
    doc_number: '',
    business_name: '',
    fiscal_address: '',
    mtc_number: '',
    is_default: false,
    active: true,
  })

  const load = () => {
    setLoading(true)
    fleetService
      .listCarriers({ q: q.trim() || undefined })
      .then(setList)
      .catch(() => toast.error('Error al cargar transportistas'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    companyService.getConfig().then((c) => setTenantRuc(c.ruc ?? '')).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(load, 300)
    return () => clearTimeout(t)
  }, [q])

  const openNew = () => {
    setEditing(null)
    setForm({
      doc_type: '6',
      doc_number: '',
      business_name: '',
      fiscal_address: '',
      mtc_number: '',
      is_default: false,
      active: true,
    })
    setShowModal(true)
  }

  const openEdit = (row: GreCarrier) => {
    setEditing(row)
    setForm({
      doc_type: row.doc_type || '6',
      doc_number: row.doc_number,
      business_name: row.business_name,
      fiscal_address: row.fiscal_address ?? '',
      mtc_number: row.mtc_number ?? '',
      is_default: row.is_default,
      active: row.active,
    })
    setShowModal(true)
  }

  const closeModal = () => {
    if (saving) return
    setShowModal(false)
    setEditing(null)
  }

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
    if (tenantRuc.length !== 11) {
      toast.error('Configure el RUC de su empresa primero')
      return
    }
    setConsultando(true)
    try {
      const res = await consultaService.ruc(tenantRuc, num)
      if (!res.success || !res.razon_social) {
        toast.error('No se encontró el RUC en SUNAT')
        return
      }
      setForm((f) => ({
        ...f,
        business_name: res.razon_social ?? f.business_name,
        fiscal_address: res.direccion ?? res.direccion_completa ?? f.fiscal_address,
      }))
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
      if (editing) {
        await fleetService.updateCarrier(editing.id, form)
        toast.success('Transportista actualizado')
      } else {
        await fleetService.createCarrier(form)
        toast.success('Transportista registrado')
      }
      closeModal()
      load()
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (row: GreCarrier) => {
    try {
      await fleetService.toggleCarrier(row.id)
      toast.success(row.active ? 'Transportista desactivado' : 'Transportista activado')
      load()
    } catch {
      toast.error('No se pudo cambiar el estado')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Truck size={20} className="text-[rgb(var(--p600))]" />
            Transportistas GRE
          </h2>
          <p className="text-sm text-gray-500">
            Catálogo para guías de remisión (transporte público).
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-1.5 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Plus size={15} />
          Nuevo transportista
        </button>
      </div>

      <div className="relative flex-1 min-w-52 max-w-md">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-sm"
          placeholder="Buscar por RUC o razón social…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden relative min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 z-10 bg-white/70 flex items-center justify-center" aria-busy="true">
            <div className="w-8 h-8 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
          </div>
        )}
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Documento', 'Nombre', 'MTC', 'Estado', ''].map((h) => (
                  <th
                    key={h || 'actions'}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400 text-sm">
                    {loading
                      ? 'Cargando…'
                      : q.trim()
                        ? 'No hay transportistas que coincidan con la búsqueda'
                        : 'No hay transportistas registrados'}
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr key={row.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!row.active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {row.doc_type}-{row.doc_number}
                      {row.is_default && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-amber-500" title="Predeterminado">
                          <Star size={12} fill="currentColor" />
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-gray-800">{row.business_name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.mtc_number || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggle(row)}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          row.active ? 'bg-green-100 text-green-800 hover:bg-green-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {row.active ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-4 py-3 w-16">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="p-1.5 text-gray-500 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                          aria-label={`Editar ${row.business_name}`}
                        >
                          <Pencil size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showModal} onClose={closeModal} contentClassName={MODAL_CLASS} closeOnBackdropClick={!saving}>
        <div className="shrink-0 px-4 sm:px-6 pt-5 pb-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{editing ? 'Editar transportista' : 'Nuevo transportista'}</h3>
          <p className="text-xs text-gray-500 mt-1">Catálogo reutilizable al armar guías de remisión.</p>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento (cat. 06) *</label>
              <select
                className={FORM_INPUT}
                value={form.doc_type}
                onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
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
                  className={`flex-1 ${FORM_INPUT} font-mono`}
                  value={form.doc_number}
                  onChange={(e) => setForm((f) => ({ ...f, doc_number: e.target.value }))}
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
                    <SearchCheck size={16} className={consultando ? 'animate-pulse' : ''} />
                  </button>
                )}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre / razón social *</label>
            <input
              className={FORM_INPUT}
              value={form.business_name}
              onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && void handleSave()}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección fiscal</label>
            <input
              className={FORM_INPUT}
              value={form.fiscal_address}
              onChange={(e) => setForm((f) => ({ ...f, fiscal_address: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº registro MTC</label>
            <input
              className={`${FORM_INPUT} font-mono`}
              value={form.mtc_number}
              onChange={(e) => setForm((f) => ({ ...f, mtc_number: e.target.value }))}
              placeholder="Registro MTC SUNAT"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            Usar como transportista predeterminado en guías
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Activo
            </label>
          )}
        </div>
        <div className="shrink-0 border-t border-gray-100 px-4 sm:px-6 py-3 bg-white flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            onClick={closeModal}
            disabled={saving}
            className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 font-medium disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Registrar transportista'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
