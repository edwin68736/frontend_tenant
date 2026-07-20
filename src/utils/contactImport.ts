import { downloadXlsxBytes } from '@/utils/downloadXlsx'
import { readXlsx, validateWithSchema, writeXlsx, type CellValue, type SchemaDefinition } from 'hucre'
import { contactsService } from '@/services/contacts.service'

export const CONTACT_IMPORT_COLUMNS = [
  'tipo',
  'tipo_documento',
  'numero_documento',
  'nombre',
  'nombre_comercial',
  'direccion',
  'ubigeo',
  'telefono',
  'email',
  'persona_contacto',
  'notas',
] as const

const CONTACT_IMPORT_SCHEMA: SchemaDefinition = {
  tipo: { column: 'tipo', type: 'string', max: 20 },
  tipo_documento: { column: 'tipo_documento', type: 'string', max: 30 },
  numero_documento: { column: 'numero_documento', type: 'string', required: true, min: 1, max: 20 },
  nombre: { column: 'nombre', type: 'string', required: true, min: 1, max: 255 },
  nombre_comercial: { column: 'nombre_comercial', type: 'string', max: 255 },
  direccion: { column: 'direccion', type: 'string', max: 255 },
  ubigeo: { column: 'ubigeo', type: 'string', max: 6 },
  telefono: { column: 'telefono', type: 'string', max: 50 },
  email: { column: 'email', type: 'string', max: 255 },
  persona_contacto: { column: 'persona_contacto', type: 'string', max: 255 },
  notas: { column: 'notas', type: 'string', max: 500 },
}

export type ParsedContactRow = {
  row_number: number
  type: string
  doc_type: string
  doc_number: string
  business_name: string
  trade_name: string
  address: string
  ubigeo: string
  phone: string
  email: string
  contact_person: string
  notes: string
}

export type ContactImportIssue = {
  row: number
  column: string | number
  field: string
  message: string
  value: unknown
}

export type ContactImportValidation = {
  rows: ParsedContactRow[]
  errors: ContactImportIssue[]
  totalRows: number
}

function normalizeHeader(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, '_')
}

/**
 * Los documentos son texto, no números: Excel convierte un RUC en notación científica o le
 * come los ceros a la izquierda de un DNI si la celda quedó como número.
 */
function cellToDocString(value: CellValue): string {
  if (value == null) return ''
  if (typeof value === 'number') {
    // Sin decimales ni notación científica.
    return Number.isInteger(value) ? value.toFixed(0) : String(value)
  }
  return String(value).trim()
}

export async function downloadContactTemplate(): Promise<void> {
  const headerRow: CellValue[] = [...CONTACT_IMPORT_COLUMNS]
  const ejemplos: CellValue[][] = [
    ['cliente', 'RUC', '20123456789', 'Distribuidora Demo SAC', 'Demo', 'Av. Siempre Viva 123', '150101', '987654321', 'ventas@demo.com', 'Ana Torres', ''],
    ['cliente', 'DNI', '45678912', 'Juan Pérez', '', 'Jr. Lima 456', '', '999888777', '', '', ''],
    ['proveedor', 'RUC', '20987654321', 'Proveedora Demo EIRL', '', '', '', '', '', '', ''],
  ]
  const bytes = await writeXlsx({ sheets: [{ name: 'Clientes', rows: [headerRow, ...ejemplos] }] })
  await downloadXlsxBytes(bytes, 'plantilla-clientes.xlsx')
}

export async function validateContactExcel(file: File): Promise<ContactImportValidation> {
  const buf = await file.arrayBuffer()
  const wb = await readXlsx(new Uint8Array(buf))
  const sheet = wb.sheets[0]
  if (!sheet?.rows?.length) {
    return {
      rows: [],
      errors: [{ row: 0, column: '', field: '', message: 'El archivo está vacío', value: null }],
      totalRows: 0,
    }
  }

  const rawRows = sheet.rows as CellValue[][]
  const headers = (rawRows[0] ?? []).map((c) => normalizeHeader(String(c ?? '')))
  const faltantes = ['nombre', 'numero_documento'].filter((c) => !headers.includes(c))
  if (faltantes.length > 0) {
    return {
      rows: [],
      errors: [{
        row: 1,
        column: 'encabezados',
        field: 'encabezados',
        message: `Faltan columnas obligatorias: ${faltantes.join(', ')}`,
        value: headers.join(', '),
      }],
      totalRows: 0,
    }
  }

  // El documento se fuerza a texto antes de validar, por lo de la notación científica.
  const docIdx = headers.indexOf('numero_documento')
  const ubigeoIdx = headers.indexOf('ubigeo')
  const normalized: CellValue[][] = rawRows.map((row, i) => {
    if (i === 0) return row
    const copy = [...row]
    if (docIdx >= 0) copy[docIdx] = cellToDocString(copy[docIdx])
    if (ubigeoIdx >= 0) copy[ubigeoIdx] = cellToDocString(copy[ubigeoIdx])
    return copy
  })

  const { data, errors: schemaErrors } = validateWithSchema<Record<string, unknown>>(
    normalized,
    CONTACT_IMPORT_SCHEMA,
    { headerRow: 1, skipEmptyRows: true, errorMode: 'collect' },
  )

  const errors: ContactImportIssue[] = (schemaErrors as ContactImportIssue[]).map((e) => ({
    row: e.row,
    column: e.column,
    field: e.field,
    message: e.message,
    value: e.value,
  }))

  const str = (v: unknown) => String(v ?? '').trim()
  const rows: ParsedContactRow[] = data.map((r, i) => ({
    row_number: i + 2,
    type: str(r.tipo),
    doc_type: str(r.tipo_documento),
    doc_number: str(r.numero_documento),
    business_name: str(r.nombre),
    trade_name: str(r.nombre_comercial),
    address: str(r.direccion),
    ubigeo: str(r.ubigeo),
    phone: str(r.telefono),
    email: str(r.email),
    contact_person: str(r.persona_contacto),
    notes: str(r.notas),
  }))

  return { rows, errors, totalRows: rawRows.length - 1 }
}

export async function importContacts(rows: ParsedContactRow[]) {
  return contactsService.bulkImport(rows)
}
