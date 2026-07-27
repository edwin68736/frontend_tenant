import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { SearchableSelect } from '@/components/SearchableSelect'
import { QuickContactCreateModal } from '@/components/contacts/QuickContactCreateModal'
import { companyService, tenantCanEmitFactura } from '@/services/company.service'
import { contactsService, type Contact } from '@/services/contacts.service'
import { ecommerceService, type EcommerceOrder, type EcommerceOrderConvertTarget } from '@/services/ecommerce.service'
import { useAuth } from '@/contexts/AuthContext'
import { useBranch } from '@/contexts/BranchContext'
import { useBranchCheckoutSeries } from '@/contexts/BranchCheckoutSeriesContext'
import { getTodayPeru } from '@/utils/datesPeru'
import { formatSaleDocumentNumber } from '@/utils/format'
import { getTipoComprobanteLabel, SUNAT_RUC_LENGTH } from '@/constants/sunat'

type SeriesRow = { id: number; series: string; doc_type: string; sunat_code?: string; branch_id: number }

function rucDigits(docNumber: string) {
  return (docNumber || '').replace(/\D/g, '')
}

function contactHasValidRuc(c?: Contact | null) {
  if (!c) return false
  return rucDigits(c.doc_number || '').length === SUNAT_RUC_LENGTH
}

export default function ConvertOrderModal({
  order,
  onClose,
  onConverted,
}: {
  order: EcommerceOrder
  onClose: () => void
  onConverted: () => void
}) {
  const navigate = useNavigate()
  const { hasModule } = useAuth()
  const { allowedBranches, activeBranchId } = useBranch()
  const { sunat } = useBranchCheckoutSeries()
  const canEmit = hasModule('billing')
  const canFactura = tenantCanEmitFactura(sunat)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [target, setTarget] = useState<EcommerceOrderConvertTarget>('nota_venta')
  const [branchId, setBranchId] = useState<number>(activeBranchId || 0)
  const [seriesList, setSeriesList] = useState<SeriesRow[]>([])
  const [seriesId, setSeriesId] = useState('')
  const [issueDate, setIssueDate] = useState(getTodayPeru())
  const [contactId, setContactId] = useState<number | null>(null)
  const [customers, setCustomers] = useState<Contact[]>([])
  const [addClientOpen, setAddClientOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      companyService.listSeries({ branch_id: branchId, category: 'venta' }),
      contactsService.list('', 'customer'),
    ])
      .then(([raw, customerList]) => {
        setSeriesList((raw as SeriesRow[]) ?? [])
        setCustomers(Array.isArray(customerList) ? customerList : [])
      })
      .catch(() => toast.error('No se pudieron cargar las series'))
      .finally(() => setLoading(false))
  }, [branchId])

  const filteredSeries = useMemo(() => {
    const code = target === 'nota_venta' ? '00' : target
    return seriesList.filter((s) => String(s.sunat_code || '').trim() === code)
  }, [seriesList, target])

  useEffect(() => {
    const first = filteredSeries[0]
    setSeriesId((prev) => (prev && filteredSeries.some((s) => String(s.id) === prev) ? prev : first ? String(first.id) : ''))
  }, [filteredSeries])

  const customersWithRuc = useMemo(() => customers.filter(contactHasValidRuc), [customers])
  const customerOptions = target === '01' ? customersWithRuc : customers
  const selectedContact = customers.find((c) => c.id === contactId) ?? null
  const contactOk = target !== '01' || contactHasValidRuc(selectedContact)

  useEffect(() => {
    if (target !== '01') return
    if (contactHasValidRuc(selectedContact)) return
    setContactId(customersWithRuc[0]?.id ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, customersWithRuc])

  const contactSelectOptions = customerOptions.map((c) => ({
    value: c.id,
    label: `${c.business_name || c.trade_name}${c.doc_number ? ` — ${c.doc_type === '6' ? 'RUC' : 'Doc.'} ${c.doc_number}` : ''}`,
  }))

  const handleSubmit = async () => {
    const sid = Number(seriesId)
    if (!sid) {
      toast.error('Seleccione una serie')
      return
    }
    if (!branchId) {
      toast.error('Seleccione una sucursal')
      return
    }
    if (target === '01' && !contactHasValidRuc(selectedContact)) {
      toast.error(`La factura requiere un cliente con RUC de ${SUNAT_RUC_LENGTH} dígitos`)
      return
    }
    setSubmitting(true)
    try {
      const res = await ecommerceService.convertOrder(order.id, {
        target,
        series_id: sid,
        branch_id: branchId,
        issue_date: issueDate.trim() || undefined,
        contact_id: contactId ?? undefined,
      })
      const sale = res.sale
      toast.success(`Venta generada: ${sale?.doc_type ?? ''} ${formatSaleDocumentNumber(sale?.series ?? '', sale?.number ?? '')}`)
      onConverted()
      onClose()
      navigate(target === '01' || target === '03' ? '/billing' : '/sales')
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
      toast.error(msg ?? 'No se pudo convertir el pedido')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Modal open onClose={onClose} contentClassName="max-w-md">
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-gray-900">Convertir pedido en venta</h3>
          <p className="text-sm text-gray-600">Pedido web #{order.id} — se creará la venta con los productos del pedido.</p>
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tipo destino</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={target}
                  onChange={(e) => setTarget(e.target.value as EcommerceOrderConvertTarget)}
                >
                  <option value="nota_venta">Nota de venta (00)</option>
                  {canEmit && <option value="03">Boleta (03)</option>}
                  {canEmit && canFactura && <option value="01">Factura (01)</option>}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={branchId}
                  onChange={(e) => setBranchId(Number(e.target.value))}
                >
                  <option value={0}>Seleccionar...</option>
                  {allowedBranches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Serie</label>
                <select
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm font-mono"
                  value={seriesId}
                  onChange={(e) => setSeriesId(e.target.value)}
                >
                  <option value="">Seleccionar...</option>
                  {filteredSeries.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.series} — {getTipoComprobanteLabel(String(s.sunat_code || ''))}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fecha emisión</label>
                <input
                  type="date"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label className="block text-xs font-medium text-gray-600">
                    Cliente {target === '01' && <span className="text-red-600">(RUC obligatorio)</span>}
                  </label>
                  <button
                    type="button"
                    onClick={() => setAddClientOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--p600))] hover:underline"
                  >
                    <UserPlus size={14} /> Nuevo cliente
                  </button>
                </div>
                <SearchableSelect
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 min-h-[42px]"
                  value={contactId ?? ''}
                  onChange={(v) => setContactId(v == null || String(v) === '' ? null : Number(v))}
                  options={contactSelectOptions}
                  placeholder={target === '01' ? 'Seleccionar cliente con RUC…' : `${order.customer_name || 'Cliente'} (opcional)`}
                  searchable
                  searchPlaceholder="Buscar por nombre o RUC/DNI..."
                  allowClear
                />
                {target === '01' && customersWithRuc.length === 0 && (
                  <p className="text-xs text-amber-700 mt-1">No hay clientes con RUC válido. Registre uno con «Nuevo cliente».</p>
                )}
                {target !== '01' && (
                  <p className="text-xs text-gray-500 mt-1">
                    Sin cliente seleccionado se usa el cliente genérico; el nombre/celular del pedido queda en las notas de la venta.
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm text-gray-600">
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={submitting || !seriesId || !branchId || !contactOk}
                  onClick={() => void handleSubmit()}
                  className="px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium disabled:opacity-50"
                >
                  {submitting ? 'Convirtiendo…' : 'Convertir'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <QuickContactCreateModal
        open={addClientOpen}
        onClose={() => setAddClientOpen(false)}
        defaultDocType={target === '01' ? '6' : '1'}
        stacked
        onCreated={(contact) => {
          setCustomers((prev) => [...prev.filter((c) => c.id !== contact.id), contact])
          setContactId(contact.id)
          setAddClientOpen(false)
          if (target === '01' && !contactHasValidRuc(contact)) {
            toast.error(`Registre un RUC de ${SUNAT_RUC_LENGTH} dígitos para facturar`)
          } else {
            toast.success('Cliente registrado')
          }
        }}
      />
    </>
  )
}
