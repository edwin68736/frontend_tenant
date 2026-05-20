import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { RefreshCw, Search, Truck, Percent, Receipt, RotateCcw, Plus, X } from 'lucide-react'
import { billingService, type SunatDespatch, type SunatRetention, type SunatPerception, type SunatReversion, type CreateDespatchInput, type CreateRetentionInput, type CreatePerceptionInput, type VoidedDetailInput } from '@/services/billing.service'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { Modal } from '@/components/ui/Modal'
import { toISOStringPeru, toDateTimeLocalPeru, fromDateTimeLocalToISOPeru, formatDisplayDatePeru } from '@/utils/datesPeru'

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-600',
  error: 'bg-orange-100 text-orange-700',
}
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  accepted: 'Aceptado',
  rejected: 'Rechazado',
  error: 'Error',
}

type DocSubMode = 'despatches' | 'retentions' | 'perceptions' | 'reversions'

export default function SunatDocsPage() {
  return (
    <RequireModule moduleKey="billing">
      <SunatDocsContent />
    </RequireModule>
  )
}

function SunatDocsContent() {
  const { docType } = useParams<{ docType: string }>()
  const navigate = useNavigate()
  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const subMode: DocSubMode =
    docType === 'despatches' || docType === 'retentions' || docType === 'perceptions' || docType === 'reversions'
      ? docType
      : 'despatches'
  const [despatches, setDespatches] = useState<SunatDespatch[]>([])
  const [retentions, setRetentions] = useState<SunatRetention[]>([])
  const [perceptions, setPerceptions] = useState<SunatPerception[]>([])
  const [reversions, setReversions] = useState<SunatReversion[]>([])
  const [loading, setLoading] = useState(false)
  const [series, setSeries] = useState<{ id: number; series: string; sunat_code: string; category: string }[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [despatchStatusLoading, setDespatchStatusLoading] = useState<number | null>(null)
  const [reversionStatusLoading, setReversionStatusLoading] = useState<number | null>(null)

  const loadSeries = () => {
    companyService.listSeries({}).then((data: any) => {
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      setSeries(list)
    }).catch(() => {})
  }
  const loadBranches = () => {
    companyService.listBranches().then((data: any) => {
      setBranches(Array.isArray(data) ? data : [])
    }).catch(() => {})
  }

  const loadDespatches = () => {
    setLoading(true)
    billingService.listDespatches()
      .then(({ despatches: list }) => setDespatches(list ?? []))
      .catch(() => toast.error('Error al cargar guías'))
      .finally(() => setLoading(false))
  }
  const loadRetentions = () => {
    setLoading(true)
    billingService.listRetentions()
      .then(({ retentions: list }) => setRetentions(list ?? []))
      .catch(() => toast.error('Error al cargar retenciones'))
      .finally(() => setLoading(false))
  }
  const loadPerceptions = () => {
    setLoading(true)
    billingService.listPerceptions()
      .then(({ perceptions: list }) => setPerceptions(list ?? []))
      .catch(() => toast.error('Error al cargar percepciones'))
      .finally(() => setLoading(false))
  }
  const loadReversions = () => {
    setLoading(true)
    billingService.listReversions()
      .then(({ reversions: list }) => setReversions(list ?? []))
      .catch(() => toast.error('Error al cargar reversiones'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    companyService.getSunat().then(d => setSunatEnabled(d.sunat_enabled ?? false)).catch(() => setSunatEnabled(false))
  }, [])
  useEffect(() => { loadSeries(); loadBranches() }, [])

  useEffect(() => {
    if (sunatEnabled !== true) return
    if (subMode === 'despatches') loadDespatches()
    else if (subMode === 'retentions') loadRetentions()
    else if (subMode === 'perceptions') loadPerceptions()
    else if (subMode === 'reversions') loadReversions()
  }, [subMode, sunatEnabled])

  if (sunatEnabled === null) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  if (!sunatEnabled) return <SunatRequiredMessage />

  const guiaSeries = series.filter(s => s.category === 'guia_remision' || s.sunat_code === '09')
  const mainBranchId = branches.find(b => b.name === 'Principal')?.id ?? branches[0]?.id ?? 1

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Guías de remisión, Retención, Percepción y Reversión</h2>
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'despatches' as DocSubMode, label: 'Guías de remisión', icon: Truck },
          { key: 'retentions' as DocSubMode, label: 'Retenciones', icon: Percent },
          { key: 'perceptions' as DocSubMode, label: 'Percepciones', icon: Receipt },
          { key: 'reversions' as DocSubMode, label: 'Reversiones', icon: RotateCcw },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => navigate(`/billing/docs/${key}`)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium ${subMode === key ? 'bg-[rgb(var(--p600))] text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))]'}`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {subMode === 'despatches' && (
        <GuiasSection
          list={despatches}
          loading={loading}
          onRefresh={loadDespatches}
          series={guiaSeries}
          branches={branches}
          mainBranchId={mainBranchId}
          statusLoading={despatchStatusLoading}
          setStatusLoading={setDespatchStatusLoading}
          onCreated={d => setDespatches(prev => [d, ...prev])}
          onStatusUpdated={d => setDespatches(prev => prev.map(x => x.id === d.id ? d : x))}
        />
      )}
      {subMode === 'retentions' && (
        <RetentionsSection list={retentions} loading={loading} onRefresh={loadRetentions} onCreated={r => setRetentions(prev => [r, ...prev])} />
      )}
      {subMode === 'perceptions' && (
        <PerceptionsSection list={perceptions} loading={loading} onRefresh={loadPerceptions} onCreated={p => setPerceptions(prev => [p, ...prev])} />
      )}
      {subMode === 'reversions' && (
        <ReversionsSection
          list={reversions}
          loading={loading}
          onRefresh={loadReversions}
          statusLoading={reversionStatusLoading}
          setStatusLoading={setReversionStatusLoading}
          onCreated={r => setReversions(prev => [r, ...prev])}
          onStatusUpdated={r => setReversions(prev => prev.map(x => x.id === r.id ? r : x))}
        />
      )}
    </div>
  )
}

function GuiasSection({
  list,
  loading,
  onRefresh,
  series,
  branches,
  mainBranchId,
  statusLoading,
  setStatusLoading,
  onCreated,
  onStatusUpdated,
}: {
  list: SunatDespatch[]
  loading: boolean
  onRefresh: () => void
  series: { id: number; series: string }[]
  branches: { id: number; name: string }[]
  mainBranchId: number
  statusLoading: number | null
  setStatusLoading: (id: number | null) => void
  onCreated: (d: SunatDespatch) => void
  onStatusUpdated?: (d: SunatDespatch) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState<Partial<CreateDespatchInput>>({
    branch_id: mainBranchId,
    series_id: series[0]?.id ?? 0,
    destinatario: { tipo_doc: '6', num_doc: '', rzn_social: '', address: '' },
    envio: {
      cod_traslado: '01',
      des_traslado: 'Venta',
      mod_traslado: '01',
      fec_traslado: toISOStringPeru(),
      partida_direccion: '',
      llegada_direccion: '',
      peso_total: 0,
      num_bultos: 1,
    },
    details: [{ codigo: '', descripcion: '', unidad: 'NIU', cantidad: 0 }],
  })

  const handleSubmit = () => {
    if (!form.branch_id || !form.series_id || !form.destinatario?.num_doc || !form.destinatario?.rzn_social || !form.details?.length) {
      toast.error('Complete destinatario y al menos un ítem')
      return
    }
    setSending(true)
    billingService.createDespatch(form as CreateDespatchInput)
      .then(({ despatch }) => { toast.success('Guía enviada'); onCreated(despatch); setModalOpen(false) })
      .catch((e: any) => toast.error(e.response?.data?.error ?? 'Error'))
      .finally(() => setSending(false))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
        <h3 className="font-semibold text-gray-800">Guías de remisión</h3>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={loading} className="p-2 text-gray-500 hover:text-gray-700"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"><Plus size={14} /> Nueva guía</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            {['Fecha', 'Serie-Nro', 'Destinatario', 'Estado', 'Acción'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Cargando...</td></tr> : list.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin guías.</td></tr> : list.map(d => (
            <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
              <td className="px-4 py-3">{formatDisplayDatePeru(d.issue_date)}</td>
              <td className="px-4 py-3 font-mono">{d.series}-{d.correlative}</td>
              <td className="px-4 py-3">{d.destinatario_razon ?? d.destinatario_ruc ?? '—'}</td>
              <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[d.status] ?? ''}`}>{STATUS_LABELS[d.status] ?? d.status}</span></td>
              <td className="px-4 py-3">
                {d.ticket && <button onClick={() => { setStatusLoading(d.id); billingService.getDespatchStatus(d.id).then(updated => { onStatusUpdated?.(updated); setStatusLoading(null) }).catch(() => setStatusLoading(null)) }} disabled={statusLoading === d.id} className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800">Consultar estado</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} contentClassName="max-w-2xl">
        <div className="flex justify-between border-b pb-3 mb-4"><h3 className="font-bold">Nueva guía de remisión</h3><button onClick={() => setModalOpen(false)}><X size={16} /></button></div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <label>Sucursal <select value={form.branch_id} onChange={e => setForm(f => ({ ...f, branch_id: Number(e.target.value) }))} className="w-full border rounded-lg px-2 py-1.5">{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
            <label>Serie <select value={form.series_id} onChange={e => setForm(f => ({ ...f, series_id: Number(e.target.value) }))} className="w-full border rounded-lg px-2 py-1.5">{series.map(s => <option key={s.id} value={s.id}>{s.series}</option>)}</select></label>
          </div>
          <p className="font-medium text-gray-700">Destinatario</p>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="RUC/DNI" value={form.destinatario?.num_doc} onChange={e => setForm(f => ({ ...f, destinatario: { ...f.destinatario!, num_doc: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Razón social" value={form.destinatario?.rzn_social} onChange={e => setForm(f => ({ ...f, destinatario: { ...f.destinatario!, rzn_social: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Dirección" value={form.destinatario?.address} onChange={e => setForm(f => ({ ...f, destinatario: { ...f.destinatario!, address: e.target.value } }))} className="border rounded-lg px-2 py-1.5 col-span-2" />
          </div>
          <p className="font-medium text-gray-700">Traslado</p>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Fecha traslado" type="datetime-local" value={form.envio?.fec_traslado?.slice(0, 16) ?? toDateTimeLocalPeru()} onChange={e => setForm(f => ({ ...f, envio: { ...f.envio!, fec_traslado: fromDateTimeLocalToISOPeru(e.target.value) } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Peso total" type="number" value={form.envio?.peso_total || ''} onChange={e => setForm(f => ({ ...f, envio: { ...f.envio!, peso_total: Number(e.target.value) } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Partida (dirección)" value={form.envio?.partida_direccion} onChange={e => setForm(f => ({ ...f, envio: { ...f.envio!, partida_direccion: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Llegada (dirección)" value={form.envio?.llegada_direccion} onChange={e => setForm(f => ({ ...f, envio: { ...f.envio!, llegada_direccion: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Nº bultos" type="number" value={form.envio?.num_bultos ?? 1} onChange={e => setForm(f => ({ ...f, envio: { ...f.envio!, num_bultos: Number(e.target.value) || 1 } }))} className="border rounded-lg px-2 py-1.5" />
          </div>
          <p className="font-medium text-gray-700">Detalle (ítems)</p>
          {form.details?.map((item, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <input placeholder="Código" value={item.codigo} onChange={e => setForm(f => ({ ...f, details: f.details!.map((d, j) => j === i ? { ...d, codigo: e.target.value } : d) }))} className="col-span-2 border rounded-lg px-2 py-1.5" />
              <input placeholder="Descripción" value={item.descripcion} onChange={e => setForm(f => ({ ...f, details: f.details!.map((d, j) => j === i ? { ...d, descripcion: e.target.value } : d) }))} className="col-span-4 border rounded-lg px-2 py-1.5" />
              <input placeholder="Cantidad" type="number" value={item.cantidad || ''} onChange={e => setForm(f => ({ ...f, details: f.details!.map((d, j) => j === i ? { ...d, cantidad: Number(e.target.value) } : d) }))} className="col-span-2 border rounded-lg px-2 py-1.5" />
            </div>
          ))}
          <button type="button" onClick={() => setForm(f => ({ ...f, details: [...(f.details ?? []), { codigo: '', descripcion: '', unidad: 'NIU', cantidad: 0 }] }))} className="text-[rgb(var(--p600))] text-sm">+ Añadir ítem</button>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={sending} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">Enviar a SUNAT</button>
        </div>
      </Modal>
    </div>
  )
}

function RetentionsSection({ list, loading, onRefresh, onCreated }: { list: SunatRetention[]; loading: boolean; onRefresh: () => void; onCreated: (r: SunatRetention) => void }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState<Partial<CreateRetentionInput>>({
    series: 'R001',
    correlativo: '1',
    fecha_emision: toISOStringPeru(),
    proveedor: { tipo_doc: '6', num_doc: '', rzn_social: '', address: '' },
    regimen: '01',
    tasa: 6,
    imp_retenido: 0,
    imp_pagado: 0,
    details: [{ tipo_doc: '01', num_doc: 'F001-1', fecha_emision: toISOStringPeru(), imp_total: 0, fecha_retencion: toISOStringPeru(), imp_retenido: 0, imp_pagar: 0 }],
  })
  const handleSubmit = () => {
    if (!form.proveedor?.num_doc || !form.proveedor?.rzn_social) { toast.error('Complete proveedor'); return }
    setSending(true)
    billingService.createRetention(form as CreateRetentionInput)
      .then(({ retention }) => { toast.success('Retención enviada'); onCreated(retention); setModalOpen(false) })
      .catch((e: any) => toast.error(e.response?.data?.error ?? 'Error'))
      .finally(() => setSending(false))
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex justify-between">
        <h3 className="font-semibold">Comprobantes de retención</h3>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={loading} className="p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"><Plus size={14} /> Nueva retención</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr>{['Fecha', 'Serie-Nro', 'Proveedor', 'Retenido', 'Estado'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center">Cargando...</td></tr> : list.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin retenciones.</td></tr> : list.map(r => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="px-4 py-3">{formatDisplayDatePeru(r.fecha_emision)}</td>
              <td className="px-4 py-3 font-mono">{r.series}-{r.correlative}</td>
              <td className="px-4 py-3">{r.proveedor_razon ?? r.proveedor_ruc}</td>
              <td className="px-4 py-3">S/ {Number(r.imp_retenido).toFixed(2)}</td>
              <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? ''}`}>{STATUS_LABELS[r.status] ?? r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} contentClassName="max-w-xl">
        <div className="flex justify-between border-b pb-3 mb-4"><h3 className="font-bold">Nueva retención</h3><button onClick={() => setModalOpen(false)}><X size={16} /></button></div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Serie" value={form.series} onChange={e => setForm(f => ({ ...f, series: e.target.value }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Correlativo" value={form.correlativo} onChange={e => setForm(f => ({ ...f, correlativo: e.target.value }))} className="border rounded-lg px-2 py-1.5" />
            <input type="datetime-local" value={form.fecha_emision?.slice(0, 16) ?? toDateTimeLocalPeru()} onChange={e => setForm(f => ({ ...f, fecha_emision: fromDateTimeLocalToISOPeru(e.target.value) }))} className="border rounded-lg px-2 py-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="RUC proveedor" value={form.proveedor?.num_doc} onChange={e => setForm(f => ({ ...f, proveedor: { ...f.proveedor!, num_doc: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Razón social" value={form.proveedor?.rzn_social} onChange={e => setForm(f => ({ ...f, proveedor: { ...f.proveedor!, rzn_social: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Imp. retenido" type="number" value={form.imp_retenido || ''} onChange={e => setForm(f => ({ ...f, imp_retenido: Number(e.target.value) }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Imp. pagado" type="number" value={form.imp_pagado || ''} onChange={e => setForm(f => ({ ...f, imp_pagado: Number(e.target.value) }))} className="border rounded-lg px-2 py-1.5" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={sending} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">Enviar a SUNAT</button>
        </div>
      </Modal>
    </div>
  )
}

function PerceptionsSection({ list, loading, onRefresh, onCreated }: { list: SunatPerception[]; loading: boolean; onRefresh: () => void; onCreated: (p: SunatPerception) => void }) {
  const [modalOpen, setModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [form, setForm] = useState<Partial<CreatePerceptionInput>>({
    series: 'P001',
    correlativo: '1',
    fecha_emision: toISOStringPeru(),
    proveedor: { tipo_doc: '6', num_doc: '', rzn_social: '', address: '' },
    regimen: '01',
    tasa: 2,
    imp_percibido: 0,
    imp_cobrado: 0,
    details: [{ tipo_doc: '01', num_doc: 'F001-1', fecha_emision: toISOStringPeru(), imp_total: 0, fecha_percepcion: toISOStringPeru(), imp_percibido: 0, imp_cobrar: 0 }],
  })
  const handleSubmit = () => {
    if (!form.proveedor?.num_doc || !form.proveedor?.rzn_social) { toast.error('Complete proveedor'); return }
    setSending(true)
    billingService.createPerception(form as CreatePerceptionInput)
      .then(({ perception }) => { toast.success('Percepción enviada'); onCreated(perception); setModalOpen(false) })
      .catch((e: any) => toast.error(e.response?.data?.error ?? 'Error'))
      .finally(() => setSending(false))
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex justify-between">
        <h3 className="font-semibold">Comprobantes de percepción</h3>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={loading} className="p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium"><Plus size={14} /> Nueva percepción</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr>{['Fecha', 'Serie-Nro', 'Proveedor', 'Percibido', 'Estado'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center">Cargando...</td></tr> : list.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin percepciones.</td></tr> : list.map(p => (
            <tr key={p.id} className="border-b border-gray-50">
              <td className="px-4 py-3">{formatDisplayDatePeru(p.fecha_emision)}</td>
              <td className="px-4 py-3 font-mono">{p.series}-{p.correlative}</td>
              <td className="px-4 py-3">{p.proveedor_razon ?? p.proveedor_ruc}</td>
              <td className="px-4 py-3">S/ {Number(p.imp_percibido).toFixed(2)}</td>
              <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status] ?? ''}`}>{STATUS_LABELS[p.status] ?? p.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} contentClassName="max-w-xl">
        <div className="flex justify-between border-b pb-3 mb-4"><h3 className="font-bold">Nueva percepción</h3><button onClick={() => setModalOpen(false)}><X size={16} /></button></div>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="Serie" value={form.series} onChange={e => setForm(f => ({ ...f, series: e.target.value }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Correlativo" value={form.correlativo} onChange={e => setForm(f => ({ ...f, correlativo: e.target.value }))} className="border rounded-lg px-2 py-1.5" />
            <input type="datetime-local" value={form.fecha_emision?.slice(0, 16) ?? toDateTimeLocalPeru()} onChange={e => setForm(f => ({ ...f, fecha_emision: fromDateTimeLocalToISOPeru(e.target.value) }))} className="border rounded-lg px-2 py-1.5" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="RUC proveedor" value={form.proveedor?.num_doc} onChange={e => setForm(f => ({ ...f, proveedor: { ...f.proveedor!, num_doc: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Razón social" value={form.proveedor?.rzn_social} onChange={e => setForm(f => ({ ...f, proveedor: { ...f.proveedor!, rzn_social: e.target.value } }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Imp. percibido" type="number" value={form.imp_percibido || ''} onChange={e => setForm(f => ({ ...f, imp_percibido: Number(e.target.value) }))} className="border rounded-lg px-2 py-1.5" />
            <input placeholder="Imp. cobrado" type="number" value={form.imp_cobrado || ''} onChange={e => setForm(f => ({ ...f, imp_cobrado: Number(e.target.value) }))} className="border rounded-lg px-2 py-1.5" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={sending} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">Enviar a SUNAT</button>
        </div>
      </Modal>
    </div>
  )
}

function ReversionsSection({
  list,
  loading,
  onRefresh,
  statusLoading,
  setStatusLoading,
  onCreated,
  onStatusUpdated,
}: {
  list: SunatReversion[]
  loading: boolean
  onRefresh: () => void
  statusLoading: number | null
  setStatusLoading: (id: number | null) => void
  onCreated: (r: SunatReversion) => void
  onStatusUpdated?: (r: SunatReversion) => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [details, setDetails] = useState<VoidedDetailInput[]>([{ tipo_doc: '40', serie: 'P001', correlativo: '', des_motivo_baja: 'Reversión' }])
  const handleSubmit = () => {
    if (!details.every(d => d.serie && d.correlativo && d.des_motivo_baja)) { toast.error('Complete todos los campos'); return }
    setSending(true)
    billingService.createReversion(details)
      .then(({ reversion }) => { toast.success('Reversión enviada'); onCreated(reversion); setModalOpen(false) })
      .catch((e: any) => toast.error(e.response?.data?.error ?? 'Error'))
      .finally(() => setSending(false))
  }
  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b flex justify-between">
        <h3 className="font-semibold">Comunicaciones de reversión</h3>
        <div className="flex gap-2">
          <button onClick={onRefresh} disabled={loading} className="p-2"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium"><Plus size={14} /> Nueva reversión</button>
        </div>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50"><tr>{['Fecha', 'Correlativo', 'Ticket', 'Estado', 'Acción'].map(h => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="px-4 py-8 text-center">Cargando...</td></tr> : list.length === 0 ? <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">Sin reversiones.</td></tr> : list.map(r => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="px-4 py-3">{new Date(r.fec_comunicacion).toLocaleString()}</td>
              <td className="px-4 py-3 font-mono">{r.correlativo}</td>
              <td className="px-4 py-3 text-xs">{r.ticket ?? '—'}</td>
              <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[r.status] ?? ''}`}>{STATUS_LABELS[r.status] ?? r.status}</span></td>
              <td className="px-4 py-3">
                {r.ticket && <button onClick={() => { setStatusLoading(r.id); billingService.getReversionStatus(r.id).then(updated => { onStatusUpdated?.(updated); setStatusLoading(null) }).catch(() => setStatusLoading(null)) }} disabled={statusLoading === r.id} className="text-xs px-2 py-1 rounded-lg bg-blue-100 text-blue-800">Consultar estado</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} contentClassName="max-w-xl">
        <div className="flex justify-between border-b pb-3 mb-4"><h3 className="font-bold">Nueva reversión</h3><button onClick={() => setModalOpen(false)}><X size={16} /></button></div>
        <p className="text-sm text-gray-600 mb-3">Indique los comprobantes a revertir (ej. percepciones tipo 40).</p>
        <div className="space-y-2">
          {details.map((d, i) => (
            <div key={i} className="grid grid-cols-12 gap-2">
              <select value={d.tipo_doc} onChange={e => setDetails(prev => prev.map((x, j) => j === i ? { ...x, tipo_doc: e.target.value } : x))} className="col-span-2 border rounded-lg px-2 py-1.5 text-sm"><option value="40">40 Percepción</option><option value="20">20 Retención</option></select>
              <input placeholder="Serie" value={d.serie} onChange={e => setDetails(prev => prev.map((x, j) => j === i ? { ...x, serie: e.target.value } : x))} className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" />
              <input placeholder="Correlativo" value={d.correlativo} onChange={e => setDetails(prev => prev.map((x, j) => j === i ? { ...x, correlativo: e.target.value } : x))} className="col-span-2 border rounded-lg px-2 py-1.5 text-sm" />
              <input placeholder="Motivo" value={d.des_motivo_baja} onChange={e => setDetails(prev => prev.map((x, j) => j === i ? { ...x, des_motivo_baja: e.target.value } : x))} className="col-span-5 border rounded-lg px-2 py-1.5 text-sm" />
              <button type="button" onClick={() => setDetails(prev => prev.filter((_, j) => j !== i))} className="text-red-600 text-xs">Quitar</button>
            </div>
          ))}
          <button type="button" onClick={() => setDetails(prev => [...prev, { tipo_doc: '40', serie: 'P001', correlativo: '', des_motivo_baja: '' }])} className="text-sm text-[rgb(var(--p600))]">+ Añadir comprobante</button>
        </div>
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
          <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl border text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={sending} className="px-4 py-2 bg-orange-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">Enviar a SUNAT</button>
        </div>
      </Modal>
    </div>
  )
}
