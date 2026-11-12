import { describe, expect, it } from 'vitest'
import { EMPTY_EXPORT_FORM, buildExportPayload, exportFormError, exportPrintLines, stayDays, type ExportFormState } from './exportService'

const hospedaje: ExportFormState = {
  ...EMPTY_EXPORT_FORM,
  guest_name: 'John Smith',
  guest_doc_number: 'X1234567',
  passport_country: 'US',
  residence_country: 'US',
  entry_date: '2026-10-01',
  check_in: '2026-10-01',
  check_out: '2026-10-04',
}

describe('exportService', () => {
  it('stayDays: mínimo 1 y null si faltan fechas o están al revés', () => {
    expect(stayDays('2026-10-01', '2026-10-04')).toBe(3)
    expect(stayDays('2026-10-01', '2026-10-01')).toBe(1)
    expect(stayDays('2026-10-05', '2026-10-01')).toBeNull()
    expect(stayDays('', '2026-10-01')).toBeNull()
  })

  it('una operación que no es exportación no valida nada ni envía datos', () => {
    expect(exportFormError('0101', EMPTY_EXPORT_FORM)).toBeNull()
    expect(buildExportPayload('0101', EMPTY_EXPORT_FORM)).toBeUndefined()
    expect(exportPrintLines('0101', EMPTY_EXPORT_FORM)).toEqual([])
  })

  it('0201 y 0208 piden solo el país donde se usa el servicio, y no el Perú', () => {
    expect(exportFormError('0201', EMPTY_EXPORT_FORM)).toMatch(/país/i)
    expect(exportFormError('0208', { ...EMPTY_EXPORT_FORM, country_use: 'PE' })).toMatch(/fuera del Perú/)
    expect(exportFormError('0201', { ...EMPTY_EXPORT_FORM, country_use: 'US' })).toBeNull()
    expect(buildExportPayload('0201', { ...EMPTY_EXPORT_FORM, country_use: 'US' })).toEqual({ country_use: 'US' })
  })

  it('0202: completo es válido; más de 60 días o residente en el Perú no', () => {
    expect(exportFormError('0202', hospedaje)).toBeNull()
    expect(exportFormError('0202', { ...hospedaje, guest_name: '' })).toMatch(/nombre/)
    expect(exportFormError('0202', { ...hospedaje, residence_country: 'PE' })).toMatch(/reside en el Perú/)
    expect(exportFormError('0202', { ...hospedaje, check_out: '2026-12-01' })).toMatch(/60 días/)
    expect(exportFormError('0202', { ...hospedaje, check_in: '2026-09-30' })).toMatch(/anterior al ingreso al país/)
    expect(exportFormError('0202', { ...hospedaje, entry_date: '' })).toMatch(/ingreso al país/)
  })

  it('0202: el cuerpo trae los datos del huésped y las líneas llevan la leyenda del DL 919', () => {
    const body = buildExportPayload('0202', hospedaje)
    expect(body).toMatchObject({ guest_name: 'John Smith', guest_doc_type: '7', passport_country: 'US', check_out: '2026-10-04' })
    const lines = exportPrintLines('0202', hospedaje)
    expect(lines[0]).toBe('EXPORTACIÓN DE SERVICIOS - DECRETO LEGISLATIVO Nº 919')
    expect(lines[2]).toContain('(3 día(s))')
  })
})
