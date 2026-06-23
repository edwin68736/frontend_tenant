import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Search, Star, Truck } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { Modal } from '@/components/ui/Modal'
import { fleetService, type GreCarrier } from '@/services/fleet.service'
import { companyService } from '@/services/company.service'
import { consultaService } from '@/services/consulta.service'
import { SUNAT_TIPO_DOC_IDENTIDAD_LIST } from '@/constants/sunat'

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
      setShowModal(false)
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
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Truck size={22} className="text-[rgb(var(--p600))]" />
            Transportistas GRE
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Catálogo para guías de remisión (SUNAT CarrierParty). Tipo doc. catálogo 06.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-xl bg-[rgb(var(--p600))] text-white px-4 py-2 text-sm font-medium hover:opacity-90"
        >
          <Plus size={16} />
          Nuevo transportista
        </button>
      </div>

      <input
        type="search"
        placeholder="Buscar por RUC o razón social..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="w-full max-w-md border border-gray-200 rounded-xl px-3 py-2 text-sm"
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">No hay transportistas registrados.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-600 uppercase">
              <tr>
                <th className="px-4 py-3">Documento</th>
                <th className="px-4 py-3">Nombre</th>
                <th className="px-4 py-3">MTC</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {list.map((row) => (
                <tr key={row.id} className={!row.active ? 'opacity-60' : ''}>
                  <td className="px-4 py-3 font-mono text-xs">
                    {row.doc_type}-{row.doc_number}
                    {row.is_default && (
                      <span className="ml-2 inline-flex items-center gap-0.5 text-amber-600" title="Predeterminado">
                        <Star size={12} fill="currentColor" />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{row.business_name}</td>
                  <td className="px-4 py-3 font-mono text-xs">{row.mtc_number || '—'}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleToggle(row)}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        row.active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {row.active ? 'Activo' : 'Inactivo'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openEdit(row)} className="p-1.5 hover:bg-gray-100 rounded-lg" title="Editar">
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={showModal} onClose={() => setShowModal(false)} contentClassName="max-w-lg">
        <h3 className="font-bold text-gray-900 mb-4">{editing ? 'Editar transportista' : 'Nuevo transportista'}</h3>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento (cat. 06) *</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2"
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
                  className="flex-1 border border-gray-200 rounded-xl px-3 py-2 font-mono"
                  value={form.doc_number}
                  onChange={(e) => setForm((f) => ({ ...f, doc_number: e.target.value }))}
                  placeholder={form.doc_type === '6' ? '20123456789' : 'Documento'}
                />
                {form.doc_type === '6' && (
                  <button
                    type="button"
                    onClick={handleConsultaRuc}
                    disabled={consultando}
                    className="shrink-0 px-3 rounded-xl border border-[rgb(var(--p400))] text-[rgb(var(--p700))] hover:bg-[rgb(var(--p50))]"
                    title="Consultar RUC en SUNAT"
                  >
                    <Search size={16} />
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
              onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dirección fiscal</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2"
              value={form.fiscal_address}
              onChange={(e) => setForm((f) => ({ ...f, fiscal_address: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nº registro MTC</label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2 font-mono"
              value={form.mtc_number}
              onChange={(e) => setForm((f) => ({ ...f, mtc_number: e.target.value }))}
              placeholder="Registro MTC SUNAT"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            />
            Usar como transportista predeterminado en guías
          </label>
          {editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              Activo
            </label>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border text-sm">
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
