import axios from 'axios'
import { useEffect, useState } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import type { PrepaymentModuleConfig } from '@/services/prepayment.service'
import { prepaymentService } from '@/services/prepayment.service'
import {
  prepaymentTotalFromBaseCapped,
  resolvePrepaymentDeductionAmount,
  saleDeductibleBaseForGroup,
  validatePrepaymentItems,
  type PrepaymentAffectationGroup,
  type PrepaymentDeductionRow,
  type PrepaymentOpenVoucher,
  type SaleAfectacionTotals,
} from '@/utils/fiscalPrepayment'

type SaleItemLike = { igv_affectation_type?: string }

export type PrepaymentDeductionSectionProps = {
  enabled: boolean
  deduct: boolean
  onDeductChange: (value: boolean) => void
  affectationGroup: PrepaymentAffectationGroup
  onAffectationGroupChange: (value: PrepaymentAffectationGroup) => void
  rows: PrepaymentDeductionRow[]
  onRowsChange: (rows: PrepaymentDeductionRow[]) => void
  config: PrepaymentModuleConfig
  contactId: number | null
  items: SaleItemLike[]
  saleAfectacionTotals: SaleAfectacionTotals
  taxRate: number
  disabled?: boolean
  formatMoney: (n: number) => string
}

let rowSeq = 0
function newRow(): PrepaymentDeductionRow {
  rowSeq += 1
  return {
    id: `prepay-ded-${rowSeq}`,
    source_sale_id: null,
    document_number: '',
    amount: 0,
    total: 0,
    max_amount: 0,
    max_total: 0,
  }
}

export function PrepaymentDeductionSection({
  enabled,
  deduct,
  onDeductChange,
  affectationGroup,
  onAffectationGroupChange,
  rows,
  onRowsChange,
  config,
  contactId,
  items,
  saleAfectacionTotals,
  taxRate,
  disabled,
  formatMoney,
}: PrepaymentDeductionSectionProps) {
  const [vouchers, setVouchers] = useState<PrepaymentOpenVoucher[]>([])
  const [loadingVouchers, setLoadingVouchers] = useState(false)
  const [voucherError, setVoucherError] = useState('')

  const affectationGroups = config.affectation_groups ?? []
  const validationError = deduct ? validatePrepaymentItems(affectationGroup, items) : null
  const saleDeductibleBase = saleDeductibleBaseForGroup(affectationGroup, saleAfectacionTotals)

  const resolveRowAmount = (
    rowId: string,
    requestedBase: number,
    voucher: PrepaymentOpenVoucher,
  ): Pick<PrepaymentDeductionRow, 'amount' | 'total' | 'max_amount' | 'max_total'> => {
    const otherRowsBaseSum = rows
      .filter((r) => r.id !== rowId && r.amount > 0)
      .reduce((s, r) => s + r.amount, 0)
    const resolved = resolvePrepaymentDeductionAmount({
      requestedBase,
      group: affectationGroup,
      taxRate,
      voucherMaxBase: voucher.amount,
      voucherBalanceTotal: voucher.balance_amount,
      saleDeductibleBase,
      otherRowsBaseSum,
    })
    const remainingSaleBase = Math.max(0, saleDeductibleBase - otherRowsBaseSum)
    return {
      amount: resolved.amount,
      total: resolved.total,
      max_amount: round2(Math.min(voucher.amount, remainingSaleBase)),
      max_total: prepaymentTotalFromBaseCapped(
        Math.min(voucher.amount, remainingSaleBase),
        affectationGroup,
        taxRate,
        voucher.balance_amount,
      ),
    }
  }

  function round2(n: number) {
    return Math.round(n * 100) / 100
  }

  useEffect(() => {
    if (!deduct) {
      setVouchers([])
      return
    }
    let cancelled = false
    setLoadingVouchers(true)
    prepaymentService
      .listOpenVouchers({ contact_id: contactId, affectation_group: affectationGroup, tax_rate: taxRate })
      .then((data) => {
        if (!cancelled) {
          setVouchers(data)
          setVoucherError('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setVouchers([])
          const msg =
            axios.isAxiosError(err) && typeof err.response?.data?.error === 'string'
              ? err.response.data.error
              : 'No se pudieron cargar los anticipos. Verifique su conexión e intente de nuevo.'
          setVoucherError(msg)
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVouchers(false)
      })
    return () => {
      cancelled = true
    }
  }, [deduct, contactId, affectationGroup, taxRate])

  useEffect(() => {
    if (!deduct || rows.length === 0) return
    let changed = false
    const nextRows = rows.map((row) => {
      if (!row.source_sale_id) return row
      const v = vouchers.find((x) => x.source_sale_id === row.source_sale_id)
      if (!v) return row
      const resolved = resolveRowAmount(row.id, row.amount, v)
      if (
        resolved.amount !== row.amount ||
        resolved.total !== row.total ||
        resolved.max_amount !== row.max_amount ||
        resolved.max_total !== row.max_total
      ) {
        changed = true
        return { ...row, ...resolved }
      }
      return row
    })
    if (changed) onRowsChange(nextRows)
  }, [saleDeductibleBase, affectationGroup, taxRate, vouchers, deduct, rows, onRowsChange])

  const visibleVouchers = vouchers

  if (!enabled) return null

  const patchRow = (id: string, partial: Partial<PrepaymentDeductionRow>) => {
    onRowsChange(rows.map((r) => (r.id === id ? { ...r, ...partial } : r)))
  }

  const selectVoucher = (rowId: string, sourceSaleId: number) => {
    const v = visibleVouchers.find((x) => x.source_sale_id === sourceSaleId)
    if (!v) return
    const otherRowsBaseSum = rows
      .filter((r) => r.id !== rowId && r.amount > 0)
      .reduce((s, r) => s + r.amount, 0)
    const remainingSaleBase = Math.max(0, saleDeductibleBase - otherRowsBaseSum)
    const suggestedBase = Math.min(v.amount, remainingSaleBase)
    patchRow(rowId, {
      source_sale_id: v.source_sale_id,
      document_number: v.document_number,
      ...resolveRowAmount(rowId, suggestedBase, v),
    })
  }

  const changeAmount = (rowId: string, raw: string) => {
    const row = rows.find((r) => r.id === rowId)
    if (!row || !row.source_sale_id) return
    const v = visibleVouchers.find((x) => x.source_sale_id === row.source_sale_id)
    if (!v) return
    const amount = Math.max(0, Number(raw) || 0)
    patchRow(rowId, resolveRowAmount(rowId, amount, v))
  }

  return (
    <div className="pt-2 border-t border-gray-100 space-y-3">
      <label className="flex items-center justify-between gap-3 cursor-pointer select-none">
        <span className="text-sm text-gray-700">Deducción de los pagos anticipados</span>
        <input
          type="checkbox"
          className="rounded border-gray-300 text-[rgb(var(--p600))] focus:ring-[rgb(var(--p600))] h-4 w-4"
          checked={deduct}
          disabled={disabled}
          onChange={(e) => {
            const checked = e.target.checked
            onDeductChange(checked)
            if (checked && rows.length === 0) onRowsChange([newRow()])
            if (!checked) onRowsChange([])
          }}
        />
      </label>

      {deduct && (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Afectación IGV del anticipo</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
              value={affectationGroup}
              disabled={disabled}
              onChange={(e) => {
                onAffectationGroupChange(e.target.value as PrepaymentAffectationGroup)
                onRowsChange([])
              }}
            >
              {affectationGroups.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {!contactId && (
            <p className="text-xs text-amber-700">
              Seleccione el mismo cliente del comprobante de anticipo antes de registrar la venta.
            </p>
          )}

          {loadingVouchers && (
            <p className="text-xs text-gray-500 inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Cargando anticipos…
            </p>
          )}

          {voucherError && <p className="text-xs text-amber-700">{voucherError}</p>}

          {contactId &&
            visibleVouchers.some((v) => v.contact_id && v.contact_id !== contactId) &&
            !loadingVouchers && (
            <p className="text-xs text-amber-700 leading-relaxed">
              Algunos anticipos son de otro cliente. Seleccione el mismo cliente de la venta (p. ej. TOTOCAYO) antes de
              registrar.
            </p>
          )}

          {!loadingVouchers && visibleVouchers.length === 0 && !voucherError && (
            <p className="text-xs text-gray-500 leading-relaxed">
              No hay anticipos disponibles con afectación{' '}
              <strong>{affectationGroups.find((g) => g.value === affectationGroup)?.label ?? affectationGroup}</strong>.
              El comprobante debe haberse emitido marcando «¿Es un pago anticipado?», estar aceptado por SUNAT y tener saldo
              pendiente.
            </p>
          )}

          {deduct && saleDeductibleBase <= 0 && items.length > 0 && !validationError && (
            <p className="text-xs text-amber-700">
              El total de la venta no tiene base deducible para la afectación seleccionada.
            </p>
          )}

          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.id} className="rounded-xl border border-gray-100 bg-gray-50/60 p-2 space-y-2">
                <select
                  className="w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
                  value={row.source_sale_id ?? ''}
                  disabled={disabled || visibleVouchers.length === 0}
                  onChange={(e) => selectVoucher(row.id, Number(e.target.value))}
                >
                  <option value="">Seleccionar anticipo…</option>
                  {visibleVouchers.map((v) => (
                    <option key={v.source_sale_id} value={v.source_sale_id}>
                      {v.description} — saldo {formatMoney(v.total)}
                    </option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    className="flex-1 border border-gray-200 rounded-lg px-2.5 py-2 text-sm"
                    placeholder="Monto base"
                    value={row.amount || ''}
                    disabled={disabled || !row.source_sale_id}
                    onChange={(e) => changeAmount(row.id, e.target.value)}
                  />
                  <span className="text-xs text-gray-500 tabular-nums shrink-0">
                    Total {formatMoney(row.total)}
                  </span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRowsChange(rows.filter((r) => r.id !== row.id))}
                    className="shrink-0 flex items-center justify-center w-8 h-8 rounded-md bg-red-500 text-white hover:bg-red-600 disabled:opacity-40"
                    aria-label="Quitar fila"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onRowsChange([...rows, newRow()])}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--p600))] hover:opacity-80 disabled:opacity-40"
          >
            <Plus size={14} />
            Agregar anticipo
          </button>

          {validationError && <p className="text-xs text-red-700">{validationError}</p>}
        </>
      )}
    </div>
  )
}
