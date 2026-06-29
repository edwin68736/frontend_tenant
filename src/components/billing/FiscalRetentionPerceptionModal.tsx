import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Plus, Trash2, X, Settings, UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { contactsService, type Contact } from '@/services/contacts.service'
import { companyService, type SeriesRow } from '@/services/company.service'
import {
  billingService,
  type CreatePerceptionInput,
  type CreateRetentionInput,
  type SunatPerception,
  type SunatRetention,
} from '@/services/billing.service'
import {
  SUNAT_DOC_RELACIONADO,
  SUNAT_REGIMEN_PERCEPCION,
  SUNAT_REGIMEN_RETENCION,
  tasaForRegimen,
} from '@/constants/sunatRetentionPerception'
import {
  FISCAL_DOC_SERIES_SETTINGS_PATH,
  filterSeriesBySunatCode,
  fiscalSeriesMissingMessage,
  type FiscalDocSunatCode,
} from '@/utils/fiscalDocSeries'
import type { FiscalRetentionPerceptionPrefill } from '@/utils/fiscalRetentionPerceptionPrefill'
import { calcObligationFromPayment, roundMoney, sumDetailPayments } from '@/utils/fiscalRetentionPerceptionCalc'
import { useExchangeRate } from '@/hooks/useExchangeRate'
import { toISOStringPeru, toDateTimeLocalPeru, fromDateTimeLocalToISOPeru } from '@/utils/datesPeru'
import { toTipoDocIdentidadCode } from '@/constants/sunat'

type Mode = 'retention' | 'perception'

type PaymentLine = { moneda: string; importe: number; fecha: string }

type DetailLine = {
  tipo_doc: string
  num_doc: string
  fecha_emision: string
  imp_total: number
  moneda: string
  pagos: PaymentLine[]
  fecha_obligacion: string
  imp_obligacion: number
  imp_neto: number
}

function emptyPayment(fecha: string, moneda = 'PEN'): PaymentLine {
  return { moneda, importe: 0, fecha }
}

function emptyDetail(fecha: string): DetailLine {
  return {
    tipo_doc: '01',
    num_doc: '',
    fecha_emision: fecha,
    imp_total: 0,
    moneda: 'PEN',
    pagos: [emptyPayment(fecha.slice(0, 10))],
    fecha_obligacion: fecha,
    imp_obligacion: 0,
    imp_neto: 0,
  }
}

function recalcDetail(d: DetailLine, tasa: number, mode: Mode): DetailLine {
  const paySum = sumDetailPayments(d.pagos)
  const impTotal = d.imp_total > 0 ? d.imp_total : paySum
  const { obligation, net } = calcObligationFromPayment(paySum, tasa)
  return {
    ...d,
    imp_total: impTotal,
    imp_obligacion: obligation,
    imp_neto: net,
    pagos: d.pagos.map((p) => ({ ...p, moneda: d.moneda })),
  }
}

type Props = {
  mode: Mode
  open: boolean
  onClose: () => void
  onCreated: (doc: SunatRetention | SunatPerception) => void
  prefill?: FiscalRetentionPerceptionPrefill | null
}

export function FiscalRetentionPerceptionModal({ mode, open, onClose, onCreated, prefill }: Props) {
  const sunatCode: FiscalDocSunatCode = mode === 'retention' ? '20' : '40'
  const regimenCatalog = mode === 'retention' ? SUNAT_REGIMEN_RETENCION : SUNAT_REGIMEN_PERCEPCION
  const defaultRegimen = regimenCatalog[0].code

  const [branchId, setBranchId] = useState(0)
  const [seriesId, setSeriesId] = useState(0)
  const [seriesList, setSeriesList] = useState<SeriesRow[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [contactId, setContactId] = useState(0)
  const [contactModal, setContactModal] = useState(false)
  const [fechaEmision, setFechaEmision] = useState(toISOStringPeru())
  const [observacion, setObservacion] = useState('')
  const [regimen, setRegimen] = useState<string>(defaultRegimen)
  const [details, setDetails] = useState<DetailLine[]>(() => [emptyDetail(toISOStringPeru())])
  const [sending, setSending] = useState(false)
  const [sourceLocked, setSourceLocked] = useState(false)
  const [sourceDocLabel, setSourceDocLabel] = useState('')
  const [sourcePurchaseId, setSourcePurchaseId] = useState<number | undefined>()
  const [sourceSaleId, setSourceSaleId] = useState<number | undefined>()

  const tasa = tasaForRegimen(regimen, regimenCatalog)
  const issueDateOnly = fechaEmision.slice(0, 10)
  const hasUsd = details.some((d) => d.moneda === 'USD')
  const { exchangeRate, loading: tcLoading, error: tcError } = useExchangeRate(issueDateOnly, { enabled: open && hasUsd })

  const selectedContact = useMemo(() => contacts.find((c) => c.id === contactId), [contacts, contactId])

  const totals = useMemo(() => {
    const recalced = details.map((d) => recalcDetail(d, tasa, mode))
    const obligation = roundMoney(recalced.reduce((s, d) => s + d.imp_obligacion, 0))
    const net = roundMoney(recalced.reduce((s, d) => s + d.imp_neto, 0))
    return { obligation, net, recalced }
  }, [details, tasa, mode])

  useEffect(() => {
    if (!open) return
    const now = toISOStringPeru()
    setSourceLocked(false)
    setSourceDocLabel('')
    setSourcePurchaseId(undefined)
    setSourceSaleId(undefined)
    setObservacion('')

    const applyPrefillState = (p: FiscalRetentionPerceptionPrefill) => {
      setFechaEmision(p.fecha_emision ?? now)
      setRegimen(p.regimen ?? defaultRegimen)
      setDetails(p.details?.length ? p.details : [emptyDetail(p.fecha_emision ?? now)])
      if (p.contact_id) setContactId(p.contact_id)
      if (p.branch_id) setBranchId(p.branch_id)
      if (p.source_purchase_id) setSourcePurchaseId(p.source_purchase_id)
      if (p.source_sale_id) setSourceSaleId(p.source_sale_id)
      if (p.source_doc_label) setSourceDocLabel(p.source_doc_label)
      if (p.locked) setSourceLocked(true)
    }

    if (prefill) {
      applyPrefillState(prefill)
    } else {
      setFechaEmision(now)
      setRegimen(defaultRegimen)
      setDetails([emptyDetail(now)])
      setContactId(0)
    }

    const branchForSeries = prefill?.branch_id
    companyService.listBranches().then((branches) => {
      const main = branches.find((b) => b.is_main) ?? branches[0]
      const bid = branchForSeries ?? main?.id ?? 0
      if (!prefill?.branch_id) setBranchId(bid)
      return companyService.listSeries({ branch_id: bid || undefined })
    }).then((rows) => {
      setSeriesList(rows ?? [])
      const filtered = filterSeriesBySunatCode(rows ?? [], sunatCode)
      if (filtered.length > 0) setSeriesId(filtered[0].id)
    }).catch(() => toast.error('Error al cargar series'))

    const contactKind = mode === 'retention' ? 'supplier' : ''
    contactsService.list('', contactKind)
      .then(async (list) => {
        let next = Array.isArray(list) ? list : []
        const pid = prefill?.contact_id
        if (pid && !next.some((c) => c.id === pid)) {
          try {
            const c = await contactsService.get(pid)
            next = [c, ...next]
          } catch {
            /* contacto no cargado */
          }
        }
        setContacts(next)
      })
      .catch(() => {})
  }, [open, mode, sunatCode, defaultRegimen, prefill])

  const contactIncomplete = selectedContact && (!selectedContact.address?.trim() || !selectedContact.ubigeo?.trim())

  const handleContactCreated = (c: Contact) => {
    setContacts((prev) => [c, ...prev.filter((x) => x.id !== c.id)])
    setContactId(c.id)
    setContactModal(false)
  }

  const updateDetail = (idx: number, patch: Partial<DetailLine>) => {
    setDetails((prev) => prev.map((d, i) => (i === idx ? recalcDetail({ ...d, ...patch }, tasa, mode) : d)))
  }

  const buildExchange = (moneda: string) => {
    if (moneda !== 'USD') return undefined
    const factor = parseFloat(exchangeRate.replace(',', '.'))
    if (!factor || factor <= 0) return undefined
    return {
      moneda_ref: 'USD',
      moneda_obj: 'PEN',
      factor,
      fecha: issueDateOnly,
    }
  }

  const handleSubmit = () => {
    if (!seriesId) {
      toast.error(fiscalSeriesMissingMessage(sunatCode))
      return
    }
    if (!contactId || !selectedContact) {
      toast.error('Seleccione un contacto')
      return
    }
    if (contactIncomplete) {
      toast.error('Complete dirección y ubigeo del contacto en Contactos')
      return
    }
    if (hasUsd && (!exchangeRate || parseFloat(exchangeRate) <= 0)) {
      toast.error(tcError || 'Tipo de cambio requerido para documentos en USD')
      return
    }
    for (const [i, d] of totals.recalced.entries()) {
      if (!d.num_doc.trim()) {
        toast.error(`Detalle ${i + 1}: número de documento obligatorio`)
        return
      }
      if (d.pagos.some((p) => p.importe <= 0)) {
        toast.error(`Detalle ${i + 1}: importe de pago/cobro obligatorio`)
        return
      }
    }

    setSending(true)
    const proveedor = {
      tipo_doc: toTipoDocIdentidadCode(selectedContact.doc_type ?? '6'),
      num_doc: selectedContact.doc_number ?? '',
      rzn_social: selectedContact.business_name ?? '',
      address: selectedContact.address ?? '',
      ubigeo: selectedContact.ubigeo ?? '',
    }

    if (mode === 'retention') {
      const payload: CreateRetentionInput = {
        branch_id: branchId,
        series_id: seriesId,
        contact_id: contactId,
        source_purchase_id: sourcePurchaseId,
        fecha_emision: fechaEmision,
        observacion: observacion || undefined,
        proveedor,
        regimen,
        tasa,
        imp_retenido: totals.obligation,
        imp_pagado: totals.net,
        details: totals.recalced.map((d) => ({
          tipo_doc: d.tipo_doc,
          num_doc: d.num_doc,
          fecha_emision: d.fecha_emision,
          imp_total: d.imp_total,
          moneda: d.moneda,
          pagos: d.pagos.map((p) => ({ moneda: p.moneda, importe: p.importe, fecha: p.fecha || issueDateOnly })),
          fecha_retencion: d.fecha_obligacion || fechaEmision,
          imp_retenido: d.imp_obligacion,
          imp_pagar: d.imp_neto,
          tipo_cambio: buildExchange(d.moneda),
        })),
      }
      billingService.createRetention(payload)
        .then(({ retention }) => {
          toast.success('Retención encolada para emisión SUNAT')
          onCreated(retention)
          onClose()
        })
        .catch((e: { response?: { data?: { error?: string } } }) => toast.error(e.response?.data?.error ?? 'Error'))
        .finally(() => setSending(false))
      return
    }

    const payload: CreatePerceptionInput = {
      branch_id: branchId,
      series_id: seriesId,
      contact_id: contactId,
      source_sale_id: sourceSaleId,
      fecha_emision: fechaEmision,
      observacion: observacion || undefined,
      proveedor,
      regimen,
      tasa,
      imp_percibido: totals.obligation,
      imp_cobrado: totals.net,
      details: totals.recalced.map((d) => ({
        tipo_doc: d.tipo_doc,
        num_doc: d.num_doc,
        fecha_emision: d.fecha_emision,
        imp_total: d.imp_total,
        moneda: d.moneda,
        cobros: d.pagos.map((p) => ({ moneda: p.moneda, importe: p.importe, fecha: p.fecha || issueDateOnly })),
        fecha_percepcion: d.fecha_obligacion || fechaEmision,
        imp_percibido: d.imp_obligacion,
        imp_cobrar: d.imp_neto,
        tipo_cambio: buildExchange(d.moneda),
      })),
    }
    billingService.createPerception(payload)
      .then(({ perception }) => {
        toast.success('Percepción encolada para emisión SUNAT')
        onCreated(perception)
        onClose()
      })
      .catch((e: { response?: { data?: { error?: string } } }) => toast.error(e.response?.data?.error ?? 'Error'))
      .finally(() => setSending(false))
  }

  const seriesFiltered = filterSeriesBySunatCode(seriesList, sunatCode)
  const title = mode === 'retention'
    ? (sourceLocked ? 'Emitir comprobante de retención (CRE)' : 'Nueva retención (CRE)')
    : (sourceLocked ? 'Emitir comprobante de percepción (CPE)' : 'Nueva percepción (CPE)')
  const obligationLabel = mode === 'retention' ? 'Total retenido' : 'Total percibido'
  const netLabel = mode === 'retention' ? 'Total pagado' : 'Total cobrado'
  const payLabel = mode === 'retention' ? 'Pagos' : 'Cobros'
  const detailLocked = sourceLocked

  return (
    <>
      <Modal open={open} onClose={onClose} contentClassName="max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between border-b pb-3 mb-4 sticky top-0 bg-white z-10">
          <h3 className="font-bold">{title}</h3>
          <button type="button" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="space-y-4 text-sm">
          {sourceLocked && sourceDocLabel && (
            <p className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">
              Documento origen: <span className="font-mono font-semibold">{sourceDocLabel}</span>
              {' '}— datos precargados desde {mode === 'retention' ? 'Compras' : 'Ventas'}.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Serie documental</label>
              {seriesFiltered.length === 0 ? (
                <p className="text-amber-700 text-xs">
                  {fiscalSeriesMissingMessage(sunatCode)}{' '}
                  <Link to={FISCAL_DOC_SERIES_SETTINGS_PATH} className="underline inline-flex items-center gap-0.5">
                    <Settings size={12} /> Configurar
                  </Link>
                </p>
              ) : (
                <select
                  value={seriesId}
                  onChange={(e) => setSeriesId(Number(e.target.value))}
                  className="w-full border rounded-lg px-2 py-1.5"
                >
                  {seriesFiltered.map((s) => (
                    <option key={s.id} value={s.id}>{s.series} (sig. {s.correlative ?? s.current_number})</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Fecha emisión</label>
              <input
                type="datetime-local"
                value={fechaEmision.slice(0, 16) || toDateTimeLocalPeru()}
                onChange={(e) => setFechaEmision(fromDateTimeLocalToISOPeru(e.target.value))}
                className="w-full border rounded-lg px-2 py-1.5"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-gray-500">
                {mode === 'retention' ? 'Proveedor (contacto)' : 'Sujeto percibido (contacto)'}
              </label>
              {!sourceLocked && (
                <button type="button" onClick={() => setContactModal(true)} className="text-xs text-[rgb(var(--p600))] flex items-center gap-1">
                  <UserPlus size={12} /> Nuevo contacto
                </button>
              )}
            </div>
            <select
              value={contactId || ''}
              onChange={(e) => setContactId(Number(e.target.value))}
              disabled={sourceLocked}
              className="w-full border rounded-lg px-2 py-1.5 disabled:bg-gray-50"
            >
              <option value="">— Seleccionar —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.doc_number} — {c.business_name}</option>
              ))}
            </select>
            {contactIncomplete && (
              <p className="text-amber-700 text-xs mt-1">
                Falta dirección o ubigeo.{' '}
                <Link to={`/contacts`} className="underline">Editar contacto</Link>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Régimen SUNAT</label>
              <select
                value={regimen}
                onChange={(e) => setRegimen(e.target.value)}
                className="w-full border rounded-lg px-2 py-1.5"
              >
                {regimenCatalog.map((r) => (
                  <option key={r.code} value={r.code}>{r.code} — {r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Tasa (%)</label>
              <input type="number" readOnly value={tasa} className="w-full border rounded-lg px-2 py-1.5 bg-gray-50" />
            </div>
          </div>

          {hasUsd && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs">
              Tipo de cambio ({issueDateOnly}):{' '}
              {tcLoading ? 'Consultando…' : exchangeRate ? `S/ ${exchangeRate} por USD` : tcError || 'No disponible'}
            </div>
          )}

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="font-medium text-gray-700">Comprobantes relacionados</span>
              {!detailLocked && (
                <button
                  type="button"
                  onClick={() => setDetails((prev) => [...prev, emptyDetail(fechaEmision)])}
                  className="text-xs text-[rgb(var(--p600))] flex items-center gap-1"
                >
                  <Plus size={12} /> Añadir línea
                </button>
              )}
            </div>
            {totals.recalced.map((d, i) => (
              <div key={i} className="border rounded-xl p-3 mb-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs font-semibold text-gray-500">Línea {i + 1}</span>
                  {details.length > 1 && !detailLocked && (
                    <button type="button" onClick={() => setDetails((prev) => prev.filter((_, j) => j !== i))} className="text-red-600">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <select value={d.tipo_doc} disabled={detailLocked} onChange={(e) => updateDetail(i, { tipo_doc: e.target.value })} className="border rounded-lg px-2 py-1.5 disabled:bg-gray-50">
                    {SUNAT_DOC_RELACIONADO.map((t) => <option key={t.code} value={t.code}>{t.code} {t.label}</option>)}
                  </select>
                  <input placeholder="Serie-Nro (F001-123)" value={d.num_doc} readOnly={detailLocked} onChange={(e) => updateDetail(i, { num_doc: e.target.value })} className="col-span-2 border rounded-lg px-2 py-1.5 read-only:bg-gray-50" />
                  <select value={d.moneda} disabled={detailLocked} onChange={(e) => updateDetail(i, { moneda: e.target.value })} className="border rounded-lg px-2 py-1.5 disabled:bg-gray-50">
                    <option value="PEN">PEN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" readOnly={detailLocked} value={d.fecha_emision.slice(0, 10)} onChange={(e) => updateDetail(i, { fecha_emision: e.target.value + 'T00:00:00-05:00' })} className="border rounded-lg px-2 py-1.5 read-only:bg-gray-50" />
                  <input type="number" readOnly={detailLocked} placeholder="Importe total doc." value={d.imp_total || ''} onChange={(e) => updateDetail(i, { imp_total: Number(e.target.value) })} className="border rounded-lg px-2 py-1.5 read-only:bg-gray-50" />
                </div>
                <div className="text-xs text-gray-500">{payLabel}</div>
                {d.pagos.map((p, pi) => (
                  <div key={pi} className="grid grid-cols-3 gap-2">
                    <input type="date" value={p.fecha?.slice(0, 10) || issueDateOnly} onChange={(e) => {
                      const pagos = [...d.pagos]
                      pagos[pi] = { ...pagos[pi], fecha: e.target.value }
                      updateDetail(i, { pagos })
                    }} className="border rounded-lg px-2 py-1.5" />
                    <input type="number" placeholder="Importe pago" value={p.importe || ''} onChange={(e) => {
                      const pagos = [...d.pagos]
                      pagos[pi] = { ...pagos[pi], importe: Number(e.target.value) }
                      updateDetail(i, { pagos })
                    }} className="border rounded-lg px-2 py-1.5" />
                    {d.pagos.length > 1 && (
                      <button type="button" onClick={() => updateDetail(i, { pagos: d.pagos.filter((_, j) => j !== pi) })} className="text-red-600 text-xs">Quitar</button>
                    )}
                  </div>
                ))}
                <button type="button" disabled={detailLocked} onClick={() => updateDetail(i, { pagos: [...d.pagos, emptyPayment(issueDateOnly, d.moneda)] })} className="text-xs text-[rgb(var(--p600))] disabled:opacity-40">
                  + Pago parcial
                </button>
                <div className="text-xs text-gray-600 grid grid-cols-2 gap-2 pt-1 border-t">
                  <span>{obligationLabel}: S/ {d.imp_obligacion.toFixed(2)}</span>
                  <span>{netLabel}: S/ {d.imp_neto.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-500 block mb-1">Observaciones (opcional)</label>
            <input value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={250} className="w-full border rounded-lg px-2 py-1.5" />
          </div>

          <div className="grid grid-cols-2 gap-3 bg-gray-50 rounded-xl p-3 font-medium">
            <div>{obligationLabel}: S/ {totals.obligation.toFixed(2)}</div>
            <div>{netLabel}: S/ {totals.net.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4 pt-4 border-t sticky bottom-0 bg-white">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm">Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={sending || seriesFiltered.length === 0} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium disabled:opacity-50">
            {sending ? 'Enviando…' : 'Encolar emisión SUNAT'}
          </button>
        </div>
      </Modal>

      <QuickContactCreateModal
        open={contactModal}
        onClose={() => setContactModal(false)}
        onCreated={handleContactCreated}
        defaultDocType="6"
        contactType={mode === 'retention' ? 'supplier' : 'customer'}
        stacked
      />
    </>
  )
}
