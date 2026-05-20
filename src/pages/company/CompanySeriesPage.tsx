import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil } from 'lucide-react'
import { companyService } from '@/services/company.service'
import { Modal } from '@/components/ui/Modal'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { useAuth } from '@/contexts/AuthContext'

interface Series {
  id: number; branch_id: number; branch_name?: string; doc_type: string
  series: string; current_number: number; category: string; active?: boolean
  sunat_code?: string
  /** Campo que devuelve la API; se normaliza a current_number */
  correlative?: number
}

/** Normaliza la respuesta de la API (correlative → current_number, añade branch_name). */
function normalizeSeries(
  list: (Series & { correlative?: number })[],
  branches: { id: number; name: string }[]
): Series[] {
  return (list ?? []).map(s => ({
    ...s,
    current_number: s.current_number ?? s.correlative ?? 0,
    branch_name: s.branch_name ?? branches.find(b => b.id === s.branch_id)?.name,
    category: s.category ?? 'venta',
  }))
}

const CATEGORIES = ['venta','compra','nota_credito','nota_debito','guia_remision']
const DOC_TYPES = ['FACTURA','BOLETA','NOTA DE VENTA','NOTA DE CRÉDITO','NOTA DE DÉBITO','GUÍA DE REMISIÓN']
/** Códigos SUNAT por tipo de comprobante. 00 = comprobantes que no se envían a SUNAT (ej. Nota de venta). */
const SUNAT_CODES: { code: string; label: string }[] = [
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

const CATEGORY_COLORS: Record<string,string> = {
  venta: 'bg-green-100 text-green-700', compra: 'bg-blue-100 text-blue-700',
  nota_credito: 'bg-orange-100 text-orange-700', nota_debito: 'bg-yellow-100 text-yellow-700',
  guia_remision: 'bg-purple-100 text-purple-700',
}

const empty = () => ({ branch_id: 0, doc_type: 'FACTURA', series: '', current_number: 0, category: 'venta', sunat_code: '01' })

export default function CompanySeriesPage() {
  const { hasModule } = useAuth()
  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const [series, setSeries] = useState<Series[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [filterCategory, setFilterCategory] = useState('')
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<Series | null>(null)
  const [form, setForm] = useState<ReturnType<typeof empty>>(empty())
  const [saving, setSaving] = useState(false)

  const load = () => Promise.all([
    companyService.listSeries({ category: filterCategory || undefined }),
    companyService.listBranches(),
  ]).then(([s, b]) => {
    const branches = b ?? []
    setSeries(normalizeSeries(s ?? [], branches))
    setBranches(branches)
    setLoading(false)
  }).catch(() => { toast.error('Error'); setLoading(false) })

  useEffect(() => {
    companyService.getSunat().then(d => setSunatEnabled(d.sunat_enabled ?? false)).catch(() => setSunatEnabled(false))
  }, [])
  useEffect(() => { load() }, [filterCategory])

  const sunatCodesForForm = sunatEnabled ? SUNAT_CODES : SUNAT_CODES.filter(o => o.code === '00')

  const openEdit = (s: Series) => {
    if (!sunatEnabled && (s.sunat_code ?? '01') !== '00') {
      toast.error('Solo puede editar series de Nota de venta (00) mientras la facturación electrónica no esté habilitada')
      return
    }
    setEditing(s)
    setForm({ branch_id: s.branch_id, doc_type: s.doc_type, series: s.series, current_number: s.current_number, category: s.category, sunat_code: (s.sunat_code ?? '01') === '00' || !sunatEnabled ? '00' : (s.sunat_code ?? '01') })
    setShow(true)
  }

  const handleSave = async () => {
    if (!form.series) { toast.error('Serie requerida'); return }
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
      setShow(false); load()
    } catch (e: any) { toast.error(e.response?.data?.error ?? 'Error') }
    finally { setSaving(false) }
  }

  if (!hasModule('billing')) return <SunatRequiredMessage />
  if (sunatEnabled === null || loading) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="space-y-4">
      {!sunatEnabled && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <SunatRequiredMessage />
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Series de Documentos</h2>
          <p className="text-sm text-gray-500">Numeración por tipo de comprobante</p>
        </div>
        <button
          onClick={() => { setEditing(null); setForm(sunatEnabled ? empty() : { ...empty(), sunat_code: '00' }); setShow(true) }}
          className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 flex-shrink-0"
        >
          <Plus size={15} /> Nueva serie
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['', ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setFilterCategory(c)}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${filterCategory === c ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'}`}>
            {c === '' ? 'Todas' : c}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>{['Categoría','Doc. Tipo','Cód. SUNAT','Serie','N° Actual','Sucursal',''].map(h => <th key={h} className="text-left px-3 sm:px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
            </thead>
            <tbody>
              {series.map(s => (
                <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-3 sm:px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${CATEGORY_COLORS[s.category] ?? 'bg-gray-100 text-gray-600'}`}>{s.category}</span></td>
                  <td className="px-3 sm:px-4 py-3 text-gray-700 whitespace-nowrap">{s.doc_type}</td>
                  <td className="px-3 sm:px-4 py-3 font-mono text-gray-600">{s.sunat_code ?? '—'}</td>
                  <td className="px-3 sm:px-4 py-3 font-mono font-bold text-[rgb(var(--p700))]">{s.series}</td>
                  <td className="px-3 sm:px-4 py-3 text-gray-600">{String(s.current_number ?? 0).padStart(8,'0')}</td>
                  <td className="px-3 sm:px-4 py-3 text-gray-500">{s.branch_name ?? `Sucursal #${s.branch_id}`}</td>
                  <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"><Pencil size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {series.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">No hay series registradas</div>}
      </div>

      <Modal open={show} onClose={() => setShow(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800 text-base sm:text-lg">{editing ? 'Editar serie' : 'Nueva serie'}</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Categoría</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Tipo doc.</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}>
                {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Código SUNAT</label>
              <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                value={form.sunat_code} onChange={e => setForm(f => ({ ...f, sunat_code: e.target.value }))}>
                {sunatCodesForForm.map(o => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Serie *</label>
              <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono uppercase"
                placeholder="F001" value={form.series} onChange={e => setForm(f => ({ ...f, series: e.target.value.toUpperCase() }))} />
            </div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">N° actual</label>
              <input type="number" min={0} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={form.current_number} onChange={e => setForm(f => ({ ...f, current_number: Number(e.target.value) }))} />
            </div>
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: Number(e.target.value) }))}>
              <option value={0}>Seleccionar...</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <button onClick={() => setShow(false)} className="flex-1 py-2.5 sm:py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-2.5 sm:py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
