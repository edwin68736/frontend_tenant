import type { BankAccount, PaymentMethodRecord } from '@/services/cashbank.service'

type Props = {
  /** Método elegido en esta línea de pago. */
  method: PaymentMethodRecord | undefined
  accounts: BankAccount[]
  /** '' = la cuenta que tiene vinculada el método de pago (comportamiento de siempre). */
  value: string
  onChange: (accountId: string) => void
  className?: string
}

/** Cuentas que pueden recibir un cobro directo: las activas (un cobro en otra moneda se convierte con el TC a la moneda de la cuenta). */
export function eligibleDestinationAccounts(accounts: BankAccount[]): BankAccount[] {
  return (accounts ?? []).filter((a) => a.active !== false)
}

/** ¿Esta línea de pago permite elegir la cuenta de destino? Solo métodos que van a cuenta bancaria y con más de una cuenta posible. */
export function canChooseDestination(method: PaymentMethodRecord | undefined, accounts: BankAccount[]): boolean {
  return !!method && method.destination_type === 'bank_account' && eligibleDestinationAccounts(accounts).length > 1
}

const accLabel = (a: BankAccount) =>
  ([a.bank_name, a.name].map((s) => (s ?? '').trim()).filter(Boolean).join(' · ') || `Cuenta ${a.id}`) +
  (String(a.currency || 'PEN').toUpperCase() === 'USD' ? ' (US$)' : '')

/**
 * Destino del pago: «¿a qué cuenta entró este dinero?». Por defecto usa la cuenta vinculada al método; el cajero puede elegir otra
 * (p. ej. una transferencia que cayó al BBVA en vez del BCP). El efectivo siempre va a la caja y no muestra este selector.
 */
export function PaymentDestinationSelect({ method, accounts, value, onChange, className }: Props) {
  if (!canChooseDestination(method, accounts)) return null
  const eligible = eligibleDestinationAccounts(accounts)
  const def = eligible.find((a) => a.id === method?.bank_account_id)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title="Cuenta que recibe este pago"
      aria-label="Cuenta de destino del pago"
      className={className ?? 'min-w-[9rem] border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white'}
    >
      <option value="">{def ? `Destino: ${accLabel(def)}` : 'Destino: cuenta del método'}</option>
      {eligible
        .filter((a) => a.id !== def?.id)
        .map((a) => (
          <option key={a.id} value={String(a.id)}>
            {accLabel(a)}
          </option>
        ))}
    </select>
  )
}
