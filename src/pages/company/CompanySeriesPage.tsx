import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, FileText, Lock } from 'lucide-react'
import { companyService, type SeriesDocumentType, type SeriesRow } from '@/services/company.service'
import { Modal } from '@/components/ui/Modal'
import { useBranchCheckoutSeries } from '@/contexts/BranchCheckoutSeriesContext'
import {
  SERIES_FORM_COPY,
  DOCUMENT_CODE_LABEL,
  emptySeriesForm,
  type SeriesFormState,
  resolveSeriesDocumentTypeId,
  isValidNotaCreditoSeries,
  normalizeSeriesRows,
  buildSeriesFilterCategories,
  categoryLabel,
  formatDocumentCode,
  groupSeriesByBranch,
  isInternalDocumentOnlySeries,
} from '@/utils/seriesDocumentForm'

export default function CompanySeriesPage() {
  const { invalidateCheckoutSeries } = useBranchCheckoutSeries()
  const [documentTypes, setDocumentTypes] = useState<SeriesDocumentType[]>([])
  const [categoryLabels, setCategoryLabels] = useState<Record<string, string>>({})
  const [sunatEnabled, setSunatEnabled] = useState(false)
  const [series, setSeries] = useState<SeriesRow[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<SeriesRow | null>(null)
  const [form, setForm] = useState<SeriesFormState>(emptySeriesForm())
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [activeBranchId, setActiveBranchId] = useState(0)

  const grouped = groupSeriesByBranch(series, branches)
  const activeBranchGroup = grouped.find((g) => g.branchId === activeBranchId) ?? grouped[0]
  const editingLocked = editing?.locked ?? false
  const selectedDocType = documentTypes.find((t) => t.id === form.doc_type_id) ?? null
  const legacyDocType = editing && !selectedDocType
  const allFilterCategories = buildSeriesFilterCategories(categoryLabels, series)

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
      companyService.listSeriesDocumentTypes(),
    ])
      .then(([s, b, sunat, docTypesRes]) => {
        const branchList = (b ?? []).map((x) => ({ id: x.id, name: x.name }))
        setBranches(branchList)
        setSeries(normalizeSeriesRows(s ?? [], branchList))
        setSunatEnabled(sunat.sunat_enabled ?? false)
        setDocumentTypes(docTypesRes.types ?? [])
        setCategoryLabels(docTypesRes.categoryLabels ?? {})
      })
      .catch(() => toast.error('Error cargando series'))
      .finally(() => setLoading(false))

  useEffect(() => {
    setLoading(true)
    load()
  }, [filterCategory])

  const openNew = () => {
    const branchId = activeBranchId || branches[0]?.id || 0
    const defaultTypeId = documentTypes[0]?.id ?? 'nota_venta'
    setEditing(null)
    setForm(emptySeriesForm(branchId, defaultTypeId))
    setShow(true)
  }

  const openEdit = (s: SeriesRow) => {
    if (!sunatEnabled && !isInternalDocumentOnlySeries(s)) {
      toast.error('Solo puede editar series de nota de venta sin facturación electrónica')
      return
    }
    setEditing(s)
    setForm({
      branch_id: s.branch_id,
      doc_type_id: resolveSeriesDocumentTypeId(documentTypes, s) ?? '',
      series: s.series,
      current_number: s.current_number ?? 0,
      active: s.active ?? true,
    })
    setShow(true)
  }

  const handleSave = async () => {
    if (!form.series.trim()) {
      toast.error('Serie requerida')
      return
    }
    const docTypeDef = selectedDocType
    if (!docTypeDef && !editing) {
      toast.error('Seleccione un tipo de documento')
      return
    }
    if (docTypeDef?.category === 'nota_credito' && !isValidNotaCreditoSeries(form.series)) {
      toast.error('Serie NC inválida: use FC01–FC99 para facturas o BC01–BC99 para boletas')
      return
    }
    if (!form.branch_id) {
      toast.error('Seleccione una sucursal')
      return
    }
    if (form.current_number < 1) {
      toast.error('El correlativo inicial debe ser al menos 1')
      return
    }
    setSaving(true)
    try {
      const docType = docTypeDef?.doc_type ?? editing?.doc_type ?? ''
      if (editing) {
        await companyService.updateSeries(editing.id, {
          series: form.series,
          active: form.active,
          doc_type: docType,
          correlative: form.current_number,
        })
      } else {
        await companyService.createSeries({
          branch_id: form.branch_id,
          doc_type: docType,
          series: form.series,
          correlative: form.current_number,
        })
      }
      toast.success(editing ? 'Serie actualizada' : 'Serie creada')
      invalidateCheckoutSeries(form.branch_id)
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
      toast.error(s.usage_reason || 'No se puede eliminar: la serie ya está en uso')
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
          {SERIES_FORM_COPY.noSunatBanner}
        </p>
      )}

      <div className="flex gap-2 flex-wrap">
        {allFilterCategories.map((c) => (
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
            {c === '' ? 'Todas' : categoryLabel(categoryLabels, c)}
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
                      {['Categoría', 'Tipo', 'Serie', 'N° actual', 'Cód. doc.', 'Estado', ''].map((h) => (
                        <th key={h || 'actions'} className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(activeBranchGroup?.items ?? []).map((s) => (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-600 text-xs">{categoryLabel(categoryLabels, s.category)}</td>
                        <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{s.doc_type}</td>
                        <td className="px-4 py-2 font-mono font-bold text-[rgb(var(--p700))]">{s.series}</td>
                        <td className="px-4 py-2 tabular-nums text-gray-600">{s.current_number}</td>
                        <td className="px-4 py-2 font-mono text-gray-600">{formatDocumentCode(s)}</td>
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
              {editing?.usage_reason || SERIES_FORM_COPY.lockedFallback}
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
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">{SERIES_FORM_COPY.documentTypeLabel}</label>
            {legacyDocType ? (
              <div className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-gray-50 text-gray-700">
                {editing?.doc_type}
                <p className="text-xs text-gray-500 mt-1 font-mono">
                  {DOCUMENT_CODE_LABEL}: {formatDocumentCode(editing!)}
                </p>
              </div>
            ) : (
              <>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
                  value={form.doc_type_id}
                  onChange={(e) => setForm((f) => ({ ...f, doc_type_id: e.target.value }))}
                  disabled={editingLocked}
                >
                  {documentTypes.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                {selectedDocType && (
                  <p className="text-xs text-gray-500 mt-1">
                    {SERIES_FORM_COPY.documentCodeLabel}: <span className="font-mono">{selectedDocType.document_code}</span>
                    {selectedDocType.series_prefix_hint ? (
                      <> · {SERIES_FORM_COPY.prefixHint}: {selectedDocType.series_prefix_hint}</>
                    ) : null}
                  </p>
                )}
              </>
            )}
          </div>
          {selectedDocType?.category === 'nota_credito' && (
            <p className="text-xs text-violet-800 bg-violet-50 border border-violet-100 rounded-xl px-3 py-2">
              {SERIES_FORM_COPY.ncSeriesHint}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{SERIES_FORM_COPY.seriesLabel} *</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono uppercase disabled:bg-gray-50"
                value={form.series}
                onChange={(e) => setForm((f) => ({ ...f, series: e.target.value.toUpperCase() }))}
                disabled={editingLocked}
                placeholder={selectedDocType?.category === 'nota_credito' ? 'FC01 o BC01' : undefined}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{SERIES_FORM_COPY.correlativeLabel}</label>
              <input
                type="number"
                min={1}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
                value={form.current_number}
                onChange={(e) =>
                  setForm((f) => ({ ...f, current_number: Math.max(1, parseInt(e.target.value, 10) || 1) }))
                }
                disabled={editingLocked}
              />
            </div>
          </div>
          {editing && (
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              />
              {SERIES_FORM_COPY.activeLabel}
            </label>
          )}
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
