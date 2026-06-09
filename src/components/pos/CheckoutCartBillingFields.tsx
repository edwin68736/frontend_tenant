import { useMemo } from 'react'
import { SearchableSelect } from '@/components/SearchableSelect'
import type { PosSeriesRow } from '@/utils/posCheckoutSeries'
import { filterPosCheckoutSeriesForModal } from '@/utils/posCheckoutSeries'
import { docTypeShortLabel, normalizeDocTypeKey } from '@/utils/paymentMethodVisual'
import {
  contactOptionLabel,
  filterRucContacts,
  isFacturaDocType,
  rucContactLabel,
} from '@/utils/checkoutContacts'

type ContactOption = { id: number; business_name: string; doc_number?: string; doc_type?: string }

type Props = {
  series: PosSeriesRow[]
  seriesId: number
  docType: string
  onSeriesChange: (seriesId: number, docType: string) => void
  contactId: number | null
  contacts: ContactOption[]
  onContactChange: (id: number | null) => void
  onAddContact?: () => void
  /** Al elegir boleta / nota de venta, sugerir Clientes Varios. */
  onPreferVariosContact?: () => void
  /** Si false, solo notas de venta (series ya filtradas en el padre). */
  sunatEnabled?: boolean
  billingModule?: boolean
}

const LABEL = 'block text-xs font-medium text-stone-600 mb-1'
const SELECT_TRIGGER =
  'w-full border border-stone-200 rounded-xl px-3 py-2 text-sm bg-white text-left flex items-center justify-between gap-2 min-h-[44px]'

/** Orden fijo en modal POS: nota de venta → boleta → factura. */
const POS_DOC_TYPE_BTN_ORDER: Record<string, number> = {
  notadeventa: 0,
  boleta: 1,
  factura: 2,
}

export function CheckoutCartBillingFields({
  series,
  seriesId,
  docType,
  onSeriesChange,
  contactId,
  contacts,
  onContactChange,
  onAddContact,
  onPreferVariosContact,
  sunatEnabled = true,
  billingModule = true,
}: Props) {
  const checkoutSeries = useMemo(
    () => filterPosCheckoutSeriesForModal(series, { sunatEnabled, billingModule }),
    [series, sunatEnabled, billingModule],
  )

  const selectedSeries = checkoutSeries.find((s) => s.id === seriesId)
  const requiresRuc = isFacturaDocType(docType, selectedSeries?.sunat_code)

  const clientOptions = useMemo(() => {
    const list = requiresRuc ? filterRucContacts(contacts) : contacts
    return list.map((c) => ({
      value: c.id,
      label: requiresRuc ? rucContactLabel(c) : contactOptionLabel(c),
    }))
  }, [contacts, requiresRuc])

  const docTypeGroups = useMemo(() => {
    const seen = new Set<string>()
    const groups: { key: string; label: string }[] = []
    for (const s of checkoutSeries) {
      const key = normalizeDocTypeKey(s.doc_type)
      if (seen.has(key)) continue
      seen.add(key)
      groups.push({
        key,
        label: docTypeShortLabel(s.doc_type, s.sunat_code),
      })
    }
    return groups.sort(
      (a, b) =>
        (POS_DOC_TYPE_BTN_ORDER[a.key] ?? 99) - (POS_DOC_TYPE_BTN_ORDER[b.key] ?? 99),
    )
  }, [checkoutSeries])

  const selectedDocKey = normalizeDocTypeKey(docType)
  const seriesForDocType = checkoutSeries.filter((s) => normalizeDocTypeKey(s.doc_type) === selectedDocKey)
  const showSeriesPicker = seriesForDocType.length > 1

  const selectDocType = (key: string) => {
    const first = checkoutSeries.find((s) => normalizeDocTypeKey(s.doc_type) === key)
    if (!first) return
    const nextDocType = String(first.doc_type || '').trim() || 'NOTA DE VENTA'
    onSeriesChange(first.id, nextDocType)
    if (!isFacturaDocType(nextDocType, first.sunat_code)) {
      onPreferVariosContact?.()
    }
  }

  return (
    <>
      {!sunatEnabled && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900">
          Facturación electrónica no habilitada: solo puede emitir <strong>notas de venta</strong>.
        </p>
      )}
      <div>
        <label className={LABEL}>{requiresRuc ? 'Cliente (RUC obligatorio)' : 'Cliente'}</label>
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <SearchableSelect
              value={contactId}
              onChange={(v) => onContactChange(v == null || String(v) === '' ? null : Number(v))}
              options={clientOptions}
              placeholder={
                requiresRuc
                  ? clientOptions.length
                    ? 'Selecciona cliente con RUC'
                    : 'Registre un cliente con RUC'
                  : 'Selecciona cliente'
              }
              searchable
              className={SELECT_TRIGGER}
            />
          </div>
          {onAddContact && (
            <button
              type="button"
              onClick={onAddContact}
              className="shrink-0 rounded-xl border border-primary-500 px-3 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 min-h-[44px]"
            >
              Nuevo
            </button>
          )}
        </div>
        {requiresRuc && clientOptions.length === 0 && (
          <p className="text-[11px] text-amber-700 mt-1">La factura requiere un cliente con RUC registrado.</p>
        )}
      </div>

      {docTypeGroups.length > 0 && (
        <div>
          <span className={LABEL}>Comprobante</span>
          <div className="grid grid-cols-3 gap-1.5">
            {docTypeGroups.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => selectDocType(g.key)}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  selectedDocKey === g.key
                    ? 'border-blue-700 bg-blue-700 text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {showSeriesPicker && (
        <div>
          <label className={LABEL}>Serie</label>
          <SearchableSelect
            value={seriesId || null}
            onChange={(v) => {
              const id = Number(v)
              const s = seriesForDocType.find((x) => x.id === id) ?? checkoutSeries.find((x) => x.id === id)
              if (s) onSeriesChange(id, String(s.doc_type || '').trim() || 'NOTA DE VENTA')
            }}
            options={seriesForDocType.map((s) => ({
              value: s.id,
              label: String(s.series ?? '').trim() || `Serie ${s.id}`,
            }))}
            placeholder="Serie"
            searchable={seriesForDocType.length > 8}
            className={SELECT_TRIGGER}
          />
        </div>
      )}
    </>
  )
}
