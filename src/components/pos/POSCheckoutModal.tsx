import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X, Wallet, Loader2 } from 'lucide-react'
import { clsx } from 'clsx'
import { PortalModal } from '@/components/ui/PortalModal'
import { PaymentMethodIcon } from '@/components/pos/PaymentMethodIcon'
import type { PaymentMethodRecord } from '@/services/cashbank.service'
import type { CheckoutDiscountMode } from '@/utils/checkoutDiscount'
import { calcCheckoutDiscountAmount } from '@/utils/checkoutDiscount'
import type { PosSeriesRow } from '@/utils/posCheckoutSeries'
import { MoneyAmountInput } from '@/components/pos/MoneyAmountInput'
import { formatMoney } from '@/utils/format'
import { formatAmountDisplay, paidCoversTotal, roundDisplay, roundSunat, sumMoney, calcPaymentChange } from '@/utils/money'
import { filterPosCheckoutSeriesForModal } from '@/utils/posCheckoutSeries'
import { BranchSeriesEmptyState } from '@/components/pos/BranchSeriesEmptyState'
import { CheckoutCartBillingFields } from '@/components/pos/CheckoutCartBillingFields'

export type CheckoutPaymentLine = {
  method: string
  amount: number
  reference?: string
}

type MethodOption = {
  code: string
  name: string
}

const LABEL = 'block text-xs font-medium text-stone-600 mb-1'
const INPUT =
  'w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-400'
const FALLBACK_METHODS: MethodOption[] = [
  { code: 'cash', name: 'Efectivo' },
  { code: 'yape', name: 'Yape' },
  { code: 'plin', name: 'Plin' },
  { code: 'tarjeta', name: 'Tarjeta' },
]

function isPrimaryMethod(opt: MethodOption): boolean {
  const s = `${opt.code} ${opt.name}`.toLowerCase()
  return (
    s.includes('efectivo') ||
    s.includes('cash') ||
    s.includes('yape') ||
    s.includes('plin') ||
    s.includes('tarjeta') ||
    s.includes('card')
  )
}

type Props = {
  open: boolean
  onClose: () => void
  loading: boolean
  rawTotal: number
  payableTotal: number
  discountMode: CheckoutDiscountMode
  discountValue: number
  onDiscountModeChange: (mode: CheckoutDiscountMode) => void
  onDiscountValueChange: (value: number) => void
  igvAmount?: number
  series: PosSeriesRow[]
  seriesId: number
  docType: string
  onSeriesChange: (seriesId: number, docType: string) => void
  contactId: number | null
  contacts: { id: number; business_name: string; doc_number?: string; doc_type?: string }[]
  onContactChange: (id: number | null) => void
  onAddContact?: () => void
  onPreferVariosContact?: () => void
  paymentMethods: PaymentMethodRecord[]
  payments: CheckoutPaymentLine[]
  onPaymentsChange: (payments: CheckoutPaymentLine[]) => void
  onConfirm: () => void
  confirmDisabled?: boolean
  title?: string
  confirmLabel?: string
  /** Contenido extra antes de métodos de pago (opcional). */
  extraBeforePayments?: ReactNode
  /** Si false, oculta el campo de descuento. */
  allowDiscount?: boolean
  /** Facturación electrónica habilitada (boleta/factura). */
  sunatEnabled?: boolean
  /** Módulo de facturación activo en el tenant. */
  billingModule?: boolean
  /** ¿El régimen del tenant permite Factura (01)? (Nuevo RUS = false). */
  canFactura?: boolean
}

export function POSCheckoutModal({
  open,
  onClose,
  loading,
  rawTotal,
  payableTotal,
  discountMode,
  discountValue,
  onDiscountModeChange,
  onDiscountValueChange,
  igvAmount = 0,
  series,
  seriesId,
  docType,
  onSeriesChange,
  contactId,
  contacts,
  onContactChange,
  onAddContact,
  onPreferVariosContact,
  paymentMethods,
  payments,
  onPaymentsChange,
  onConfirm,
  confirmDisabled = false,
  title = 'Procesar pago',
  confirmLabel = 'Finalizar venta',
  extraBeforePayments,
  allowDiscount = true,
  sunatEnabled = true,
  billingModule = true,
  canFactura = true,
}: Props) {
  const [showMoreMethods, setShowMoreMethods] = useState(false)
  const [methodPickerIndex, setMethodPickerIndex] = useState<number | null>(null)
  const [isEditingDiscount, setIsEditingDiscount] = useState(false)
  const [discountDraft, setDiscountDraft] = useState('0')
  const discountPrevRef = useRef(0)

  const discountAmount = useMemo(
    () => calcCheckoutDiscountAmount(rawTotal, discountMode, discountValue),
    [rawTotal, discountMode, discountValue],
  )

  useEffect(() => {
    if (!open) return
    setIsEditingDiscount(false)
    setDiscountDraft('0')
    discountPrevRef.current = 0
  }, [open])

  const methodOptions: MethodOption[] = useMemo(() => {
    if (paymentMethods.length > 0) {
      return paymentMethods.map((pm) => ({ code: pm.code, name: pm.name }))
    }
    return FALLBACK_METHODS
  }, [paymentMethods])

  const visibleMethods = useMemo(() => {
    if (showMoreMethods) return methodOptions
    const primary = methodOptions.filter(isPrimaryMethod)
    return primary.length > 0 ? primary.slice(0, 4) : methodOptions.slice(0, 4)
  }, [methodOptions, showMoreMethods])

  const checkoutSeries = useMemo(
    () => filterPosCheckoutSeriesForModal(series, { sunatEnabled, billingModule, canFactura }),
    [series, sunatEnabled, billingModule, canFactura],
  )

  const selectedSeries = useMemo(
    () => checkoutSeries.find((s) => s.id === seriesId),
    [checkoutSeries, seriesId],
  )

  const seriesCodeLabel = useMemo(() => {
    if (!selectedSeries) return '—'
    return String(selectedSeries.series ?? '').trim() || '—'
  }, [selectedSeries])

  const paymentSlotsCount = payments.length
  const isModeSimple = paymentSlotsCount === 1
  const paid = sumMoney(...payments.map((p) => Number(p.amount) || 0))
  const change = calcPaymentChange(paid, payableTotal)
  const exactPayment =
    Math.abs(roundDisplay(paid) - roundDisplay(payableTotal)) < 0.02 && paid > 0
  const canSubmit = paidCoversTotal(paid, payableTotal) && seriesId > 0 && !loading && !confirmDisabled

  const defaultMethodCode = methodOptions[0]?.code ?? 'cash'

  const setSlotCount = (n: number) => {
    const max = Math.max(1, showMoreMethods ? methodOptions.length : Math.max(4, visibleMethods.length))
    const count = Math.min(Math.max(1, n), max)
    const next = [...payments]
    while (next.length < count) {
      next.push({ method: defaultMethodCode, amount: 0, reference: '' })
    }
    while (next.length > count) next.pop()
    if (count === 1 && next[0]) {
      next[0] = { ...next[0], amount: roundSunat(payableTotal) }
    }
    onPaymentsChange(next)
  }

  const updateLine = (index: number, patch: Partial<CheckoutPaymentLine>) => {
    onPaymentsChange(payments.map((p, i) => (i === index ? { ...p, ...patch } : p)))
  }

  const parseDiscountInput = (raw: string) => {
    let cleaned = raw.trim().replace(/[^0-9.,-]+/g, '')
    if (cleaned.includes(',') && !cleaned.includes('.')) cleaned = cleaned.replace(',', '.')
    cleaned = cleaned.replace(/,/g, '')
    const n = Number(cleaned)
    const v = Number.isFinite(n) ? Math.max(0, roundDisplay(n)) : 0
    onDiscountValueChange(
      discountMode === 'percent' ? Math.min(100, v) : roundSunat(v),
    )
  }

  const discountInputDisplay = isEditingDiscount
    ? discountDraft
    : discountMode === 'percent'
      ? String(discountValue ?? 0)
      : formatAmountDisplay(discountValue ?? 0)

  const handleDiscountFocus = () => {
    discountPrevRef.current = discountValue ?? 0
    setIsEditingDiscount(true)
    setDiscountDraft('')
  }

  const handleDiscountBlur = () => {
    if (!isEditingDiscount) return
    const draft = discountDraft.trim()
    if (draft === '') {
      onDiscountValueChange(discountPrevRef.current)
    }
    setIsEditingDiscount(false)
  }

  const slotButtons = useMemo(() => {
    const max = Math.min(4, showMoreMethods ? methodOptions.length : Math.max(4, visibleMethods.length))
    return Array.from({ length: max }, (_, i) => i + 1)
  }, [methodOptions.length, showMoreMethods, visibleMethods.length])

  const getOption = (code: string) => methodOptions.find((m) => m.code === code)

  const methodCardClass = (selected: boolean) =>
    clsx(
      'flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border p-1.5 transition focus:outline-none focus:ring-2 focus:ring-primary-500/40',
      selected
        ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500/50'
        : 'border-stone-200 bg-white hover:border-primary-300 hover:bg-stone-50/80',
    )

  return (
    <>
      <PortalModal
        open={open}
        onClose={loading ? () => {} : onClose}
        className="max-w-lg"
        overlayClassName="items-center p-3 sm:p-4"
      >
        <div className="flex max-h-[min(92dvh,720px)] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-bold text-stone-800">
              <Wallet size={18} className="shrink-0 text-primary-600" aria-hidden />
              {title}
            </h3>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-lg p-1 text-stone-600 hover:bg-stone-100 disabled:opacity-50"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          <div className="scrollbar-checkout min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {checkoutSeries.length === 0 ? (
              <BranchSeriesEmptyState compact />
            ) : (
              <>
            <CheckoutCartBillingFields
              series={series}
              seriesId={seriesId}
              docType={docType}
              onSeriesChange={onSeriesChange}
              contactId={contactId}
              contacts={contacts}
              onContactChange={onContactChange}
              onAddContact={onAddContact}
              onPreferVariosContact={onPreferVariosContact}
              sunatEnabled={sunatEnabled}
              billingModule={billingModule}
              canFactura={canFactura}
            />

            {allowDiscount ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={LABEL}>Serie</label>
                  <div
                    className="flex min-h-[42px] items-center rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-sm font-mono font-semibold text-stone-800"
                    title="Serie del comprobante seleccionado"
                  >
                    {seriesCodeLabel}
                  </div>
                </div>
                <div>
                  <label className={LABEL}>Descuento</label>
                  <div className="flex overflow-hidden rounded-xl border border-stone-200 bg-white">
                    <button
                      type="button"
                      className={clsx(
                        'w-9 shrink-0 border-r border-stone-200 text-xs font-bold text-white',
                        discountMode === 'percent' ? 'bg-primary-600' : 'bg-stone-500',
                      )}
                      onClick={() =>
                        onDiscountModeChange(discountMode === 'percent' ? 'amount' : 'percent')
                      }
                    >
                      {discountMode === 'percent' ? '%' : 'S/'}
                    </button>
                    <input
                      type="text"
                      inputMode="decimal"
                      className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-stone-800 focus:outline-none"
                      value={discountInputDisplay}
                      onFocus={handleDiscountFocus}
                      onChange={(e) => {
                        if (isEditingDiscount) {
                          setDiscountDraft(e.target.value)
                          parseDiscountInput(e.target.value)
                        }
                      }}
                      onBlur={handleDiscountBlur}
                      placeholder={discountMode === 'percent' ? '0' : '0.00'}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <label className={LABEL}>Serie</label>
                <div className="flex min-h-[42px] items-center rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2 text-sm font-mono font-semibold text-stone-800">
                  {seriesCodeLabel}
                </div>
              </div>
            )}

            {extraBeforePayments}

            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className={LABEL.replace(' mb-1', '')}>Métodos de pago</span>
                <label className="inline-flex cursor-pointer select-none items-center gap-1.5 text-[11px] font-medium text-stone-500">
                  <input
                    type="checkbox"
                    checked={showMoreMethods}
                    onChange={(e) => setShowMoreMethods(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-stone-300 text-primary-600 focus:ring-primary-500/40"
                  />
                  Más opciones
                </label>
              </div>

              <div className="flex gap-1.5">
                {slotButtons.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSlotCount(n)}
                    className={clsx(
                      'min-w-[2.25rem] flex-1 rounded-lg border py-1.5 text-xs font-semibold transition-colors',
                      paymentSlotsCount === n
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-stone-200 bg-white text-stone-700 hover:border-primary-300 hover:bg-primary-50/50',
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-stone-400">
                {isModeSimple ? 'Un método' : `${paymentSlotsCount} métodos`}
              </p>

              {isModeSimple ? (
                <>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    {visibleMethods.map((opt) => (
                      <button
                        key={opt.code}
                        type="button"
                        onClick={() => updateLine(0, { method: opt.code })}
                        className={methodCardClass(payments[0]?.method === opt.code)}
                      >
                        <PaymentMethodIcon code={opt.code} name={opt.name} className="h-7 w-7 object-contain" />
                        <span className="text-[11px] font-medium leading-tight text-stone-800">{opt.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <MoneyAmountInput
                      className={clsx(INPUT, 'text-right tabular-nums')}
                      value={payments[0]?.amount ?? 0}
                      onChange={(amount) => updateLine(0, { amount })}
                      placeholder="Monto"
                      emptyWhenZero
                    />
                    <input
                      type="text"
                      className={INPUT}
                      value={payments[0]?.reference ?? ''}
                      onChange={(e) => updateLine(0, { reference: e.target.value })}
                      placeholder="N° Op / Ref."
                    />
                  </div>
                </>
              ) : (
                <div className="mt-2 space-y-2">
                  {payments.map((p, idx) => {
                    const opt = getOption(p.method)
                    return (
                      <div
                        key={idx}
                        className="grid grid-cols-3 gap-2 items-stretch rounded-lg border border-stone-200 bg-stone-50/60 p-2"
                      >
                        <button
                          type="button"
                          onClick={() => setMethodPickerIndex(idx)}
                          className="flex min-h-[40px] min-w-0 items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2 py-1.5 text-left text-xs hover:border-primary-300"
                        >
                          {opt ? (
                            <PaymentMethodIcon code={opt.code} name={opt.name} className="h-5 w-5 shrink-0 object-contain" />
                          ) : (
                            <span className="text-sm shrink-0">💳</span>
                          )}
                          <span className="truncate font-medium text-stone-800">{opt?.name ?? 'Método'}</span>
                        </button>
                        <MoneyAmountInput
                          className={clsx(INPUT, 'min-w-0 text-right py-1.5 tabular-nums')}
                          value={p.amount}
                          onChange={(amount) => updateLine(idx, { amount })}
                          placeholder="Monto"
                          emptyWhenZero
                          clearOnFocus
                        />
                        <input
                          type="text"
                          className={clsx(INPUT, 'min-w-0 py-1.5')}
                          value={p.reference ?? ''}
                          onChange={(e) => updateLine(idx, { reference: e.target.value })}
                          placeholder="N° Op / Ref."
                        />
                      </div>
                    )
                  })}
                </div>
              )}

              <div className="mt-3 space-y-2">
                {change > 0.009 && (
                  <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
                    <span className="text-xs font-bold uppercase tracking-wide">Vuelto</span>
                    <span className="text-base font-bold tabular-nums">{formatMoney(change)}</span>
                  </div>
                )}
                {!change && exactPayment && (
                  <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    Pago exacto
                  </span>
                )}

                <div className="rounded-xl border border-stone-200 bg-stone-50/80 px-3 py-2.5 space-y-1">
                  {discountAmount > 0 && (
                    <>
                      <div className="flex justify-between text-[11px] text-stone-500">
                        <span>Subtotal</span>
                        <span>{formatMoney(rawTotal)}</span>
                      </div>
                      <div className="flex justify-between text-[11px] text-stone-500">
                        <span>Descuento</span>
                        <span>− {formatMoney(discountAmount)}</span>
                      </div>
                    </>
                  )}
                  {igvAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-stone-500">
                      <span>IGV gravado</span>
                      <span>{formatMoney(igvAmount)}</span>
                    </div>
                  )}
                  <div
                    className={clsx(
                      'flex justify-between items-baseline',
                      (discountAmount > 0 || igvAmount > 0) && 'border-t border-stone-200/80 pt-1',
                    )}
                  >
                    <span className="text-xs font-medium text-stone-600">Total a pagar</span>
                    <span className="text-base font-bold text-primary-600">{formatMoney(payableTotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-stone-600">
                    <span>Suma de pagos</span>
                    <span className="font-semibold text-stone-800">{formatMoney(paid)}</span>
                  </div>
                  {!paidCoversTotal(paid, payableTotal) && (
                    <p className="text-[11px] text-red-600 pt-0.5">
                      Falta {formatMoney(Math.max(0, payableTotal - paid))}
                    </p>
                  )}
                </div>
              </div>
            </div>
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-2 border-t border-stone-200 bg-stone-50/50 p-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-xl border border-stone-200 py-2.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canSubmit || checkoutSeries.length === 0}
              className={clsx(
                'flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold text-white transition-colors',
                canSubmit ? 'bg-primary-600 hover:bg-primary-700' : 'cursor-not-allowed bg-stone-300',
              )}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Procesando…
                </>
              ) : (
                confirmLabel
              )}
            </button>
          </div>
        </div>
      </PortalModal>

      <PortalModal
        open={methodPickerIndex !== null}
        onClose={() => setMethodPickerIndex(null)}
        className="max-w-sm"
        overlayClassName="items-center p-3 sm:p-4"
      >
        <div className="w-full rounded-2xl bg-white p-4 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-bold text-stone-800">Seleccionar método</h4>
            <button
              type="button"
              onClick={() => setMethodPickerIndex(null)}
              className="rounded-lg p-1 hover:bg-stone-100"
              aria-label="Cerrar"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(showMoreMethods ? methodOptions : visibleMethods).map((opt) => (
              <button
                key={opt.code}
                type="button"
                onClick={() => {
                  if (methodPickerIndex !== null) {
                    updateLine(methodPickerIndex, { method: opt.code })
                    setMethodPickerIndex(null)
                  }
                }}
                className={methodCardClass(false)}
              >
                <PaymentMethodIcon code={opt.code} name={opt.name} className="h-7 w-7 object-contain" />
                <span className="text-[11px] font-medium text-stone-800">{opt.name}</span>
              </button>
            ))}
          </div>
        </div>
      </PortalModal>
    </>
  )
}
