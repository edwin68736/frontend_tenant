import { Plus, Trash2 } from 'lucide-react'
import type { PaymentMethod, PaymentMethodType } from '@/services/ecommerce.service'
import { PAYMENT_TYPE_OPTIONS, defaultPaymentLabel } from './paymentMethods'

const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm'
const MAX_METHODS = 10

function emptyMethod(type: PaymentMethodType): PaymentMethod {
  return { type, label: '', enabled: true, holder: '', account: '', cci: '', bank: '', note: '' }
}

export default function PaymentMethodsEditor({
  value,
  onChange,
}: {
  value: PaymentMethod[]
  onChange: (next: PaymentMethod[]) => void
}) {
  const patch = (i: number, p: Partial<PaymentMethod>) => onChange(value.map((m, k) => (k === i ? { ...m, ...p } : m)))

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-gray-800">Medios de pago</p>
        <p className="text-xs text-gray-500">
          Se muestran al cliente al hacer el pedido, para que pague por su cuenta (Yape, Plin, transferencia…) y luego
          te envíe la captura por WhatsApp. No se valida ningún pago desde el sistema.
        </p>
      </div>

      {value.map((m, i) => (
        <div key={i} className="border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2">
            <select
              className={`${inputCls} flex-1`}
              value={m.type}
              onChange={(e) => patch(i, { type: e.target.value as PaymentMethodType })}
              aria-label="Tipo de medio de pago"
            >
              {PAYMENT_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 shrink-0">
              <input type="checkbox" checked={m.enabled} onChange={(e) => patch(i, { enabled: e.target.checked })} />
              Mostrar
            </label>
            <button
              type="button"
              onClick={() => onChange(value.filter((_, k) => k !== i))}
              title="Quitar"
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            >
              <Trash2 size={15} />
            </button>
          </div>

          <input
            className={inputCls}
            value={m.label}
            maxLength={60}
            onChange={(e) => patch(i, { label: e.target.value })}
            placeholder={`Nombre visible (opcional) — ${defaultPaymentLabel(m.type)}`}
          />

          {m.type === 'bank' && (
            <input className={inputCls} value={m.bank} maxLength={60} onChange={(e) => patch(i, { bank: e.target.value })} placeholder="Banco (Ej: BCP, Interbank)" />
          )}
          {m.type !== 'cash' && (
            <input
              className={inputCls}
              value={m.account}
              maxLength={60}
              onChange={(e) => patch(i, { account: e.target.value })}
              placeholder={m.type === 'bank' ? 'N° de cuenta' : m.type === 'other' ? 'Número o dato de pago' : 'Número de celular'}
            />
          )}
          {m.type === 'bank' && (
            <input className={inputCls} value={m.cci} maxLength={40} onChange={(e) => patch(i, { cci: e.target.value })} placeholder="CCI (opcional)" />
          )}
          {m.type !== 'cash' && (
            <input className={inputCls} value={m.holder} maxLength={120} onChange={(e) => patch(i, { holder: e.target.value })} placeholder="Titular (opcional)" />
          )}
          <input className={inputCls} value={m.note} maxLength={200} onChange={(e) => patch(i, { note: e.target.value })} placeholder="Nota para el cliente (opcional)" />
        </div>
      ))}

      {value.length < MAX_METHODS && (
        <button
          type="button"
          onClick={() => onChange([...value, emptyMethod(value.some((m) => m.type === 'yape') ? 'bank' : 'yape')])}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          <Plus size={14} /> Agregar medio de pago
        </button>
      )}
    </div>
  )
}
