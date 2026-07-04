import type { PrintBankAccount } from '@/types/printData'

/** Interpreta receipt_bank_account_ids del API (JSON string o array). null = sin filtro (todas). */
export function parseReceiptBankAccountIds(raw: unknown): number[] | null {
  if (raw == null || raw === '') return null
  if (Array.isArray(raw)) {
    const ids = raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    return ids
  }
  if (typeof raw === 'string') {
    const s = raw.trim()
    if (!s) return null
    try {
      const parsed = JSON.parse(s) as unknown
      if (!Array.isArray(parsed)) return null
      return parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    } catch {
      return null
    }
  }
  return null
}

type BankAccountLike = {
  id: number
  name?: string
  bank_name?: string
  account_number?: string
  currency?: string
  active?: boolean
}

/** Cuentas activas a imprimir según preferencia de comprobantes. */
export function buildPrintBankAccounts(
  receiptBankAccountIds: unknown,
  accounts: BankAccountLike[],
): PrintBankAccount[] {
  const active = (accounts ?? []).filter((a) => a.active !== false)
  const parsed = parseReceiptBankAccountIds(receiptBankAccountIds)
  const selected = parsed === null ? active : active.filter((a) => parsed.includes(Number(a.id)))
  const out: PrintBankAccount[] = []
  for (const a of selected) {
    const name = String(a.name ?? '').trim()
    let bankName = String(a.bank_name ?? '').trim()
    const accountNumber = String(a.account_number ?? '').trim()
    // Cuentas seed suelen tener solo nombre (sin banco ni número).
    if (!name && !bankName && !accountNumber) continue
    if (!bankName) bankName = name
    out.push({
      name: name || undefined,
      bank_name: bankName,
      account_number: accountNumber,
      currency: String(a.currency ?? 'PEN').trim() || 'PEN',
    })
  }
  return out
}

/** Etiqueta corta para comprobante: Yape, Plin, BCP, etc. (sin “Soles” ni mayúsculas forzadas). */
export function bankAccountDisplayLabel(b: Pick<PrintBankAccount, 'name' | 'bank_name'>): string {
  const combined = `${b.bank_name ?? ''} ${b.name ?? ''}`.trim()
  const key = combined
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
  if (key.includes('yape')) return 'Yape'
  if (key.includes('plin')) return 'Plin'
  if (key.includes('interbank') || /\bibk\b/.test(key)) return 'Interbank'
  if (key.includes('bcp') || key.includes('credito del peru')) return 'BCP'
  if (key.includes('bbva') || key.includes('continental')) return 'BBVA'
  if (key.includes('scotiabank') || key.includes('scotia')) return 'Scotiabank'

  let label = (b.name || b.bank_name || '').trim()
  label = label
    .replace(/\b(soles|pen|usd|dolares|dólares|billetera|cuenta bancaria|terminal tarjetas)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!label) label = (b.bank_name || b.name || 'Cuenta').trim()
  // Capitalizar primera letra de cada palabra, sin gritar en mayúsculas.
  return label
    .split(/\s+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function accountNumberForDisplay(raw?: string): string {
  const num = String(raw ?? '').trim()
  if (!num) return ''
  const withoutCci = num.replace(/\s*[,;]?\s*CCI[:\s]*\d[\d\s-]*/i, '').trim()
  return withoutCci || num
}

/** Línea lista para PDF: "Yape: 914561918" o solo la etiqueta si no hay número. */
export function formatBankAccountLine(b: PrintBankAccount): string | null {
  const label = bankAccountDisplayLabel(b)
  if (!label) return null
  const num = accountNumberForDisplay(b.account_number)
  return num ? `${label}: ${num}` : label
}

export function formatWalletAccountLine(provider?: string, phone?: string): string | null {
  const p = String(provider ?? '')
    .trim()
    .toLowerCase()
  const n = String(phone ?? '').trim()
  if (!p && !n) return null
  let label = p
  if (p === 'yape') label = 'Yape'
  else if (p === 'plin') label = 'Plin'
  else if (p) label = p.charAt(0).toUpperCase() + p.slice(1)
  else label = 'Billetera'
  return n ? `${label}: ${n}` : label
}

/** Líneas de cuentas para ticket / impresora térmica. */
export function bankAccountPrintLines(data: {
  bank_accounts?: PrintBankAccount[]
  payment_wallet?: { provider?: string; phone?: string } | null
  includeWalletIfNoQrBlock?: boolean
}): string[] {
  const lines: string[] = []
  for (const b of data.bank_accounts ?? []) {
    const line = formatBankAccountLine(b)
    if (line) lines.push(line)
  }
  return lines
}
