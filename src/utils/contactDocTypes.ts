/** Tipos de documento de identidad (códigos SUNAT) para contactos / clientes. */
export const CONTACT_DOC_TYPES = [
  { code: '0', label: 'Sin RUC' },
  { code: '1', label: 'DNI' },
  { code: '6', label: 'RUC' },
  { code: '4', label: 'Carnet extranjería' },
  { code: '7', label: 'Pasaporte' },
] as const

export function toContactDocCode(v: string): string {
  const s = (v || '').trim().toLowerCase()
  if (s === 'dni' || s === '1') return '1'
  if (s === 'ruc' || s === '6') return '6'
  if (s === '0' || s === 'sin ruc') return '0'
  if (s === '4') return '4'
  if (s === '7') return '7'
  return v || '6'
}

export function contactDocSelectOptions() {
  return CONTACT_DOC_TYPES.map((d) => ({ value: d.code, label: d.label }))
}

export function contactDocSupportsConsulta(code: string): boolean {
  const c = toContactDocCode(code)
  return c === '1' || c === '6'
}

export function contactDocNumberPlaceholder(code: string): string {
  const c = toContactDocCode(code)
  if (c === '6') return 'RUC 11 dígitos'
  if (c === '1') return 'DNI 8 dígitos'
  if (c === '0') return 'Sin documento'
  if (c === '4') return 'N° carnet'
  if (c === '7') return 'N° pasaporte'
  return 'Número de documento'
}

export function sanitizeContactDocNumber(code: string, raw: string): string {
  const c = toContactDocCode(code)
  if (c === '6') return raw.replace(/\D/g, '').slice(0, 11)
  if (c === '1') return raw.replace(/\D/g, '').slice(0, 8)
  return raw.trim().slice(0, 20)
}
