import { describe, expect, it } from 'vitest'
import { EMPTY_EXPORT_FORM, buildExportPayload, exportFormError, exportPrintLines, guestFromContact, stayDays, type ExportFormState } from './exportService'

const huesped = { doc_type: '7', doc_number: 'X1234567', business_name: '  John   Smith ' }

const hospedaje: ExportFormState = {
  ...EMPTY_EXPORT_FORM,
  passport_country: 'US',
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

  it('0201 y 0208 no piden nada: el país donde se usa el servicio es opcional, pero no puede ser el Perú', () => {
    expect(exportFormError('0201', EMPTY_EXPORT_FORM)).toBeNull()
    expect(exportFormError('0208', { ...EMPTY_EXPORT_FORM, country_use: 'PE' })).toMatch(/fuera del Perú/)
    expect(exportFormError('0201', { ...EMPTY_EXPORT_FORM, country_use: 'US' })).toBeNull()
    expect(buildExportPayload('0201', EMPTY_EXPORT_FORM)).toEqual({})
    expect(buildExportPayload('0201', { ...EMPTY_EXPORT_FORM, country_use: 'US' })).toEqual({ country_use: 'US' })
  })

  it('el huésped sale del cliente: pasaporte o carné; RUC, DNI o «Clientes varios» no sirven', () => {
    expect(guestFromContact(huesped)).toEqual({ name: 'John Smith', docType: '7', docNumber: 'X1234567' })
    expect(guestFromContact({ doc_type: '4', doc_number: 'CE998877', business_name: 'Ana Pérez' })?.docType).toBe('4')
    expect(guestFromContact({ doc_type: '6', doc_number: '20123456789', business_name: 'ACME SAC' })).toBeNull()
    expect(guestFromContact({ doc_type: '0', doc_number: '99999999', business_name: 'CLIENTES VARIOS' })).toBeNull()
    expect(guestFromContact(null)).toBeNull()
  })

  it('0202: completo es válido; sin cliente huésped, más de 60 días o residente en el Perú no', () => {
    expect(exportFormError('0202', hospedaje, huesped)).toBeNull()
    expect(exportFormError('0202', hospedaje, { doc_type: '0', doc_number: '99999999', business_name: 'CLIENTES VARIOS' })).toMatch(/pasaporte o carné/)
    expect(exportFormError('0202', hospedaje, null)).toMatch(/Elija como cliente al huésped/)
    expect(exportFormError('0202', { ...hospedaje, passport_country: '' }, huesped)).toMatch(/país del pasaporte/)
    expect(exportFormError('0202', { ...hospedaje, passport_country: 'PE' }, huesped)).toMatch(/reside en el Perú/)
    expect(exportFormError('0202', { ...hospedaje, residence_country: 'PE' }, huesped)).toMatch(/reside en el Perú/)
    expect(exportFormError('0202', { ...hospedaje, check_out: '2026-12-01' }, huesped)).toMatch(/60 días/)
    expect(exportFormError('0202', { ...hospedaje, check_in: '2026-09-30' }, huesped)).toMatch(/anterior al ingreso al país/)
    expect(exportFormError('0202', { ...hospedaje, entry_date: '' }, huesped)).toMatch(/ingreso al país/)
  })

  it('0202: el cuerpo no repite al huésped (lo toma el servidor del cliente) y la residencia solo va si es distinta', () => {
    expect(buildExportPayload('0202', hospedaje)).toEqual({ passport_country: 'US', entry_date: '2026-10-01', check_in: '2026-10-01', check_out: '2026-10-04' })
    expect(buildExportPayload('0202', { ...hospedaje, residence_country: 'CA' })).toMatchObject({ residence_country: 'CA' })
  })

  it('0202: la vista previa lleva la leyenda del DL 919 y los datos del cliente-huésped', () => {
    const lines = exportPrintLines('0202', hospedaje, huesped)
    expect(lines[0]).toBe('EXPORTACIÓN DE SERVICIOS - DECRETO LEGISLATIVO Nº 919')
    expect(lines[1]).toContain('John Smith')
    expect(lines[1]).toContain('X1234567')
    expect(lines[2]).toContain('(3 día(s))')
  })
})
