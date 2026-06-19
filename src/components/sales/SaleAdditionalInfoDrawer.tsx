import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Plus, Trash2, X } from 'lucide-react'
import type { TenantUser } from '@/services/users.service'
import {
  FISCAL_DRAWER_OVERLAY_Z,
  FISCAL_DRAWER_TAB_Z,
} from '@/utils/uiLayers'
import {
  autoSuggestIgvRetention,
  previewIgvRetention,
  type FiscalGuiaKind,
  type FiscalGuiaRow,
  type RetentionContact,
} from '@/utils/fiscalRetention'

export type { FiscalGuiaKind, FiscalGuiaRow } from '@/utils/fiscalRetention'

export type SaleFiscalFormState = {
  has_igv_retention: boolean
  igv_retention_manual_override: boolean
  show_terms_conditions: boolean
  fiscal_observations: string
  purchase_order_number: string
  seller_user_id: number | null
  guias: FiscalGuiaRow[]
}

const GUIA_KIND_OPTIONS: { value: FiscalGuiaKind; label: string }[] = [
  { value: 'guia_remitente', label: 'Guía remisión remitente' },
  { value: 'guia_transportista', label: 'Guía remisión transportista' },
]

let guiaRowSeq = 0

function createGuiaRow(kind: FiscalGuiaKind): FiscalGuiaRow {
  guiaRowSeq += 1
  return {
    id: `guia-${guiaRowSeq}-${Date.now()}`,
    reference_kind: kind,
    document_number: '',
  }
}

export function createEmptyGuiaRow(kind: FiscalGuiaKind = 'guia_remitente'): FiscalGuiaRow {
  return createGuiaRow(kind)
}

/** Dos filas por defecto: remitente + transportista (referencia de diseño). */
export function defaultGuiaRows(): FiscalGuiaRow[] {
  return [createGuiaRow('guia_remitente'), createGuiaRow('guia_transportista')]
}

export const emptySaleFiscalForm = (defaultSellerUserId: number | null = null): SaleFiscalFormState => ({
  has_igv_retention: false,
  igv_retention_manual_override: false,
  show_terms_conditions: false,
  fiscal_observations: '',
  purchase_order_number: '',
  seller_user_id: defaultSellerUserId,
  guias: defaultGuiaRows(),
})

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: SaleFiscalFormState
  onChange: (next: SaleFiscalFormState) => void
  sunatCode: string
  saleTotal: number
  currency?: string
  exchangeRate?: number | null
  contact: RetentionContact | null | undefined
  users: TenantUser[]
  disabled?: boolean
}

const TAB_WIDTH = '2.5rem' // w-10 — texto vertical un poco más legible
const DRAWER_WIDTH = '26rem'

export function SaleAdditionalInfoDrawer({
  open,
  onOpenChange,
  value,
  onChange,
  sunatCode,
  saleTotal,
  currency = 'PEN',
  exchangeRate = null,
  contact,
  users,
  disabled = false,
}: Props) {
  const preview = previewIgvRetention(
    value.has_igv_retention,
    sunatCode,
    contact,
    saleTotal,
    value.igv_retention_manual_override,
    currency,
    exchangeRate,
  )

  useEffect(() => {
    if (value.igv_retention_manual_override) return
    const suggested = autoSuggestIgvRetention(sunatCode, contact, saleTotal, currency, exchangeRate)
    if (suggested !== value.has_igv_retention) {
      onChange({ ...value, has_igv_retention: suggested })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo inputs externos
  }, [sunatCode, saleTotal, currency, exchangeRate, contact?.doc_type, contact?.doc_number, contact?.es_agente_de_retencion, contact?.es_agente_de_percepcion])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const patch = (partial: Partial<SaleFiscalFormState>) => onChange({ ...value, ...partial })

  const handleRetentionToggle = (checked: boolean) => {
    const auto = autoSuggestIgvRetention(sunatCode, contact, saleTotal, currency, exchangeRate)
    patch({
      has_igv_retention: checked,
      igv_retention_manual_override: checked !== auto,
    })
  }

  const updateGuia = (id: string, partial: Partial<FiscalGuiaRow>) => {
    patch({
      guias: value.guias.map((g) => (g.id === id ? { ...g, ...partial } : g)),
    })
  }

  const removeGuia = (id: string) => {
    patch({ guias: value.guias.filter((g) => g.id !== id) })
  }

  const addGuia = () => {
    patch({ guias: [...value.guias, createEmptyGuiaRow()] })
  }

  const tabLabel = open ? 'Cerrar información adicional' : 'Abrir información adicional'

  if (typeof document === 'undefined') return null

  return createPortal(
    <>
      {open && (
        <button
          type="button"
          className={`fixed inset-0 ${FISCAL_DRAWER_OVERLAY_Z} bg-black/40 backdrop-blur-[1px] transition-opacity`}
          aria-label="Cerrar panel de información adicional"
          onClick={() => onOpenChange(false)}
        />
      )}

      {/* Pestaña + panel se deslizan juntos: cerrado solo asoma la pestaña; abierto la pestaña queda a la izquierda del panel */}
      <div
        className={`fixed inset-y-0 right-0 ${FISCAL_DRAWER_TAB_Z} flex max-w-full transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : 'translate-x-[calc(100%-2.5rem)]'
        }`}
      >
        <button
          type="button"
          disabled={disabled}
          onClick={() => onOpenChange(!open)}
          className="relative z-10 flex shrink-0 flex-col items-center justify-center self-center min-h-[10rem] max-h-[min(70vh,15rem)] rounded-l-xl bg-green-500 text-white shadow-[-4px_0_12px_rgba(0,0,0,0.12)] hover:bg-green-700 disabled:opacity-50 transition-colors my-auto"
          style={{ width: TAB_WIDTH }}
          aria-expanded={open}
          aria-controls="sale-additional-info-drawer"
        >
          <span className="flex flex-col items-center justify-center gap-2 py-3 px-0.5">
            <ChevronRight
              size={14}
              className={`shrink-0 opacity-90 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
            <span
              className="text-xs font-semibold leading-snug tracking-wide select-none"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
              }}
            >
              {tabLabel}
            </span>
          </span>
        </button>

        <div
          id="sale-additional-info-drawer"
          className={`flex shrink-0 flex-col bg-white shadow-2xl ${
            open ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
          style={{ width: DRAWER_WIDTH, maxWidth: `calc(100vw - ${TAB_WIDTH})` }}
          aria-hidden={!open}
          role="dialog"
          aria-modal={open}
          aria-label="Información adicional del comprobante"
        >
          <div className="flex h-full min-h-0 flex-col">
            <div className="shrink-0 flex items-center justify-between gap-2 border-b border-gray-100 px-5 py-4">
              <h3 className="text-sm font-bold text-gray-800">Información adicional</h3>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-sm text-gray-700">¿Tiene retención de IGV?</span>
              <input
                type="checkbox"
                className="rounded border-gray-300 text-[rgb(var(--p600))] focus:ring-[rgb(var(--p600))] h-4 w-4"
                checked={value.has_igv_retention}
                onChange={(e) => handleRetentionToggle(e.target.checked)}
                disabled={disabled}
              />
            </label>
            {value.has_igv_retention && (
              <p className={`text-xs ${preview.applicable ? 'text-emerald-700' : 'text-amber-700'}`}>
                {preview.reason}
                {preview.applicable && (
                  <>
                    {' '}
                    — Retención: S/ {preview.retentionAmount.toFixed(2)} · Neto: S/{' '}
                    {preview.netCollectible.toFixed(2)}
                  </>
                )}
              </p>
            )}

            <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
              <span className="text-sm text-gray-700">Mostrar términos y condiciones</span>
              <input
                type="checkbox"
                className="rounded border-gray-300 text-[rgb(var(--p600))] focus:ring-[rgb(var(--p600))] h-4 w-4"
                checked={value.show_terms_conditions}
                onChange={(e) => patch({ show_terms_conditions: e.target.checked })}
                disabled={disabled}
              />
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Orden de compra</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={value.purchase_order_number}
                onChange={(e) => patch({ purchase_order_number: e.target.value })}
                disabled={disabled}
                placeholder="Opcional"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
              <textarea
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm min-h-[4.5rem] resize-y"
                value={value.fiscal_observations}
                onChange={(e) => patch({ fiscal_observations: e.target.value })}
                disabled={disabled}
                placeholder="Texto adicional del comprobante"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Vendedor</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={value.seller_user_id ?? ''}
                onChange={(e) =>
                  patch({ seller_user_id: e.target.value ? Number(e.target.value) : null })
                }
                disabled={disabled}
              >
                <option value="">— Sin asignar —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.email}
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 border-t border-gray-100 space-y-3 pb-2">
              <p className="text-xs font-semibold text-gray-600">Guías (referencia)</p>

              <div className="space-y-2">
                {value.guias.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-2"
                  >
                    <select
                      className="w-[9.5rem] shrink-0 border border-gray-200 rounded-lg px-2 py-2 text-xs bg-white"
                      value={row.reference_kind}
                      onChange={(e) =>
                        updateGuia(row.id, { reference_kind: e.target.value as FiscalGuiaKind })
                      }
                      disabled={disabled}
                    >
                      {GUIA_KIND_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="min-w-0 flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-mono bg-white"
                      placeholder="T001-00000001"
                      value={row.document_number}
                      onChange={(e) => updateGuia(row.id, { document_number: e.target.value })}
                      disabled={disabled}
                    />
                    <button
                      type="button"
                      onClick={() => removeGuia(row.id)}
                      disabled={disabled}
                      className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-40 transition-colors"
                      aria-label="Eliminar guía"
                    >
                      <Trash2 size={15} strokeWidth={2.25} />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addGuia}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--p600))] hover:opacity-80 disabled:opacity-40"
              >
                <Plus size={14} />
                Agregar guía
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>,
    document.body,
  )
}
