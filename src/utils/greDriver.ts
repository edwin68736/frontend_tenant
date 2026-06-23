export function normalizeGreLicencia(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, '')
}

export function isValidGreLicencia(value: string): boolean {
  const lic = normalizeGreLicencia(value)
  return /^[A-Z0-9]{9,10}$/.test(lic)
}

export function validateGreDriverFields(doc: string, lic: string, required: boolean): string | null {
  const docTrim = doc.trim()
  const licNorm = normalizeGreLicencia(lic)
  if (!required && !docTrim && !licNorm) return null
  if (!docTrim) return 'Ingrese el documento del conductor'
  if (!licNorm) return 'Ingrese la licencia de conducir (9-10 caracteres, no use el DNI)'
  if (!isValidGreLicencia(licNorm)) {
    return 'Licencia inválida: SUNAT exige 9 a 10 caracteres alfanuméricos (error 2573 si envía el DNI)'
  }
  if (docTrim === licNorm) return 'La licencia no puede ser igual al documento del conductor'
  return null
}
