import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, FileText, Lock } from 'lucide-react'
import { companyService, type SeriesRow } from '@/services/company.service'
import { Modal } from '@/components/ui/Modal'

const CATEGORIES = ['venta', 'compra', 'nota_credito', 'nota_debito', 'guia_remision'] as const
const DOC_TYPES = ['FACTURA', 'BOLETA', 'NOTA DE VENTA', 'NOTA DE CRÉDITO', 'NOTA DE DÉBITO', 'GUÍA DE REMISIÓN']
const SUNAT_CODES = [
  { code: '00', label: '00 - Nota de venta (no SUNAT)' },
  { code: '01', label: '01 - Factura' },
  { code: '03', label: '03 - Boleta' },
  { code: '07', label: '07 - Nota de Crédito' },
  { code: '08', label: '08 - Nota de Débito' },
  { code: '09', label: '09 - Guía de Remisión' },
  { code: '02', label: '02 - Recibo por Honorarios' },
  { code: '04', label: '04 - Liquidación de Compra' },
  { code: '20', label: '20 - Comprobante de Retención' },
]

const CATEGORY_LABELS: Record<string, string> = {
  venta: 'Venta',
  compra: 'Compra',
  nota_credito: 'Nota crédito',
  nota_debito: 'Nota débito',
  guia_remision: 'Guía',
}

type FormState = {
  branch_id: number
  doc_type: string
  series: string
  current_number: number
  category: string
  sunat_code: string
}

const emptyForm = (branchId = 0): FormState => ({
  branch_id: branchId,
  doc_type: 'NOTA DE VENTA',
  series: '',
  current_number: 0,
  category: 'venta',
  sunat_code: '00',
})

function normalizeSeries(list: SeriesRow[], branches: { id: number; name: string }[]): SeriesRow[] {
  return (list ?? []).map((s) => ({
    ...s,
    current_number: s.current_number ?? s.correlative ?? 0,
    branch_name: s.branch_name ?? branches.find((b) => b.id === s.branch_id)?.name,
    category: s.category ?? 'venta',
    locked: s.locked ?? (Number(s.correlative ?? s.current_number ?? 0) > 1 || Number(s.sales_count ?? 0) > 0),
    can_delete: s.can_delete ?? !(Number(s.correlative ?? s.current_number ?? 0) > 1 || Number(s.sales_count ?? 0) > 0),
  }))
}

function groupSeriesByBranch(series: SeriesRow[], branches: { id: number; name: string }[]) {
  return branches.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    items: series.filter((s) => s.branch_id === b.id),
  }))
}

export default function CompanySeriesPage() {
  const [sunatEnabled, setSunatEnabled] = useState(false)
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<SeriesRow | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [activeBranchId, setActiveBranchId] = useState(0)

  const grouped = groupSeriesByBranch(series, branches)
  const activeBranchGroup = grouped.find((g) => g.branchId === activeBranchId) ?? grouped[0]
  const editingLocked = editing?.locked ?? false

  useEffect(() => {
    if (branches.length === 0) return
    if (!branches.some((b) => b.id === activeBranchId)) {
      setActiveBranchId(branches[0].id)
    }
  }, [branches, activeBranchId])

  const load = () =>
    Promise.all([
      companyService.listSeries({ category: filterCategory || undefined }),
      companyService.listBranches(),
      companyService.getSunat(),
    ])
      .then(([s, b, sunat]) => {
        const branchList = (b ?? []).map((x) => ({ id: x.id, name: x.name }))
        setBranches(branchList)
        setSeries(normalizeSeries(s ?? [], branchList))
        setSunatEnabled(sunat.sunat_enabled ?? false)
      })
      .catch(() => toast.error('Error cargando series'))
      .finally(() => setLoading(false))

  useEffect(() => {
    setLoading(true)
    load()
  }, [filterCategory])

  const sunatOptions = sunatEnabled ? SUNAT_CODES : SUNAT_CODES.filter((o) => o.code === '00')

  const openNew = () => {
    const branchId = activeBranchId || branches[0]?.id || 0
    setEditing(null)
    setForm(sunatEnabled ? emptyForm(branchId) : { ...emptyForm(branchId), sunat_code: '00' })
    setShow(true)
  }

  const openEdit = (s: SeriesRow) => {
    if (!sunatEnabled && (s.sunat_code ?? '01') !== '00') {
      toast.error('Solo puede editar series de nota de venta (00) sin facturación electrónica')
      return
    }
    setEditing(s)
    setForm({
      branch_id: s.branch_id,
      doc_type: s.doc_type,
      series: s.series,
      current_number: s.current_number ?? 0,
      category: s.category,
      sunat_code: (s.sunat_code ?? '01') === '00' || !sunatEnabled ? '00' : (s.sunat_code ?? '01'),
    })
    setShow(true)
  }

  const handleSave = async () => {
    if (!form.series.trim()) {
      toast.error('Serie requerida')
      return
    }
    if (!form.branch_id) {
      toast.error('Seleccione una sucursal')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await companyService.updateSeries(editing.id, {
          series: form.series,
          active: editing.active ?? true,
          doc_type: form.doc_type,
          sunat_code: form.sunat_code || '01',
          category: form.category,
          correlative: form.current_number,
        })
      } else {
        await companyService.createSeries({
          branch_id: form.branch_id,
          doc_type: form.doc_type,
          series: form.series,
          category: form.category,
          sunat_code: form.sunat_code || '01',
        })
      }
      toast.success(editing ? 'Serie actualizada' : 'Serie creada')
      setShow(false)
      setLoading(true)
      load()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (s: SeriesRow) => {
    if (!s.can_delete) {
      toast.error('No se puede eliminar: la serie ya tiene documentos emitidos')
      return
    }
    if (!confirm(`¿Eliminar la serie ${s.series}? Esta acción no se puede deshacer.`)) return
    setDeletingId(s.id)
    try {
      await companyService.deleteSeries(s.id)
      toast.success('Serie eliminada')
      setLoading(true)
      load()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al eliminar')
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[rgb(var(--p50))] text-[rgb(var(--p700))] flex items-center justify-center">
            <FileText size={18} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-800">Series y numeración</h2>
            <p className="text-sm text-gray-500">Comprobantes por sucursal y tipo de documento.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={openNew}
          disabled={branches.length === 0}
          className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={15} /> Nueva serie
        </button>
      </div>

      {!sunatEnabled && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Sin facturación electrónica: solo series con código SUNAT 00 (nota de venta).
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {['', ...CATEGORIES].map((c) => (
          <button
            key={c || 'all'}
            type="button"
            onClick={() => setFilterCategory(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              filterCategory === c
                ? 'bg-[rgb(var(--p600))] text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'
            }`}
          >
            {c === '' ? 'Todas' : CATEGORY_LABELS[c] ?? c}
          </button>
        ))}
      </div>

      {branches.length === 0 ? (
        <p className="text-center py-10 text-gray-400 text-sm bg-white rounded-2xl shadow-sm">
          Registre sucursales antes de configurar series
        </p>
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {grouped.map((group) => {
              const active = group.branchId === activeBranchGroup?.branchId
              return (
                <button
                  key={group.branchId}
                  type="button"
                  onClick={() => setActiveBranchId(group.branchId)}
                  className={`shrink-0 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[rgb(var(--p600))] text-white border-[rgb(var(--p600))]'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {group.branchName}
                  <span className={`ml-1.5 text-xs tabular-nums ${active ? 'opacity-80' : 'text-gray-400'}`}>
                    ({group.items.length})
                  </span>
                </button>
              )
            })}
          </div>

          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{activeBranchGroup?.branchName}</h3>
                <p className="text-xs text-gray-500">{activeBranchGroup?.items.length ?? 0} serie(s)</p>
              </div>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-[rgb(var(--p600))] text-white rounded-lg text-xs font-medium hover:opacity-90"
              >
                <Plus size={14} />
                Nueva serie
              </button>
            </div>
            {activeBranchGroup && activeBranchGroup.items.length === 0 ? (
              <p className="text-center py-10 text-gray-400 text-sm">
                {filterCategory ? 'No hay series con este filtro en esta sucursal' : 'Sin series en esta sucursal'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Categoría', 'Tipo', 'Serie', 'N° actual', 'SUNAT', 'Estado', ''].map((h) => (
                        <th key={h || 'actions'} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeBranchGroup?.items ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600 text-xs">{CATEGORY_LABELS[s.category] ?? s.category}</td>
                        <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{s.doc_type}</td>
                        <td className="px-4 py-2 font-mono font-bold text-[rgb(var(--p700))]">{s.series}</td>
                        <td className="px-4 py-2 tabular-nums text-gray-600">{s.current_number}</td>
                        <td className="px-4 py-2 font-mono text-gray-600">{s.sunat_code ?? '—'}</td>
                        <td className="px-4 py-2">
                          {s.locked ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-100">
                              <Lock size={11} />
                              En uso
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">Sin uso</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(s)}
                              className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                              title="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                            {s.can_delete && (
                              <button
                                type="button"
                                disabled={deletingId === s.id}
                                onClick={() => void handleDelete(s)}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-40"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      <Modal open={show} onClose={() => setShow(false)} contentClassName="max-w-lg w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800">{editing ? 'Editar serie' : 'Nueva serie'}</h3>
        <div className="space-y-3 mt-3 max-h-[70vh] overflow-y-auto pr-1">
          {editingLocked && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              Esta serie ya tiene documentos emitidos. No puede cambiar serie, tipo, correlativo ni código SUNAT.
            </p>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.branch_id}
              onChange={(e) => setForm((f) => ({ ...f, branch_id: Number(e.target.value) }))}
              disabled={!!editing}
            >
              <option value={0}>Seleccionar...</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                disabled={editingLocked}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código SUNAT</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono disabled:bg-gray-50"
                value={form.sunat_code}
                onChange={(e) => setForm((f) => ({ ...f, sunat_code: e.target.value }))}
                disabled={editingLocked}
              >
                {sunatOptions.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Tipo documento</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
              value={form.doc_type}
              onChange={(e) => setForm((f) => ({ ...f, doc_type: e.target.value }))}
              disabled={editingLocked}
            >
              {DOC_TYPES.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Serie *</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono uppercase disabled:bg-gray-50"
                value={form.series}
                onChange={(e) => setForm((f) => ({ ...f, series: e.target.value.toUpperCase() }))}
                disabled={editingLocked}
              />
            </div>
            {editing && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Correlativo actual</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
                  value={form.current_number}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, current_number: Math.max(0, parseInt(e.target.value, 10) || 0) }))
                  }
                  disabled={editingLocked}
                />
              </div>
            )}
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={() => setShow(false)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
