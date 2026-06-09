import { normalizeDocTypeKey } from '@/utils/paymentMethodVisual'

/** Cliente genérico SUNAT (Clientes Varios) para boleta y nota de venta. */
export const VARIOS_CONTACT_DOC = { doc_type: '0', doc_number: '99999999' } as const

export function isVariosContact(contact: { doc_type?: string | number | null; doc_number?: string | null }): boolean {
  return (
    String(contact.doc_type ?? '').trim() === VARIOS_CONTACT_DOC.doc_type &&
    String(contact.doc_number ?? '').trim() === VARIOS_CONTACT_DOC.doc_number
  )
}

export function isRucContact(contact: { doc_type?: string | number | null }): boolean {
  const dt = String(contact.doc_type ?? '').trim()
  return dt === '6' || dt.toLowerCase() === 'ruc'
}

export function filterRucContacts<T extends { doc_type?: string | number | null }>(list: T[]): T[] {
  return list.filter(isRucContact)
}

export function isFacturaDocType(docType: string, sunatCode?: string): boolean {
  const code = String(sunatCode ?? '').trim()
  if (code === '01') return true
  const key = normalizeDocTypeKey(docType)
  return key === 'factura' || key.includes('factura')
}

export function pickVariosContactId(
  contacts: { id: number; doc_type?: string | number | null; doc_number?: string | null }[],
): number | null {
  const match = contacts.find(isVariosContact)
  return match?.id ?? null
}

export function contactOptionLabel(contact: { business_name?: string; doc_number?: string; doc_type?: string }): string {
  const name = String(contact.business_name ?? '').trim()
  const doc = String(contact.doc_number ?? '').trim()
  if (isVariosContact(contact)) return name || 'Clientes Varios'
  if (name && doc) return `${name} · ${doc}`
  return name || doc || 'Cliente'
}

export function rucContactLabel(contact: { business_name?: string; doc_number?: string }): string {
  const name = String(contact.business_name ?? '').trim()
  const doc = String(contact.doc_number ?? '').trim()
  if (name && doc) return `${name} · RUC ${doc}`
  return name || (doc ? `RUC ${doc}` : 'Cliente')
}

export function checkoutContactIsValid(
  contact: { doc_type?: string | number | null; doc_number?: string } | null | undefined,
  docType: string,
  sunatCode?: string,
): boolean {
  if (!contact) return false
  if (isFacturaDocType(docType, sunatCode)) return isRucContact(contact)
  return true
}
