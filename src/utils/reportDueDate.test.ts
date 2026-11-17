import { describe, expect, it } from 'vitest'
import { reportDueDateISO } from './reportDueDate'

describe('reportDueDateISO', () => {
  it('a crédito: usa su vencimiento', () => {
    expect(reportDueDateISO({ due_date: '2026-12-15', issue_date: '2026-11-15', doc_type: 'FACTURA' })).toBe('2026-12-15')
  })
  it('al contado (sin vencimiento): la fecha de emisión', () => {
    expect(reportDueDateISO({ due_date: null, issue_date: '2026-11-15T10:00:00Z', doc_type: 'BOLETA' })).toBe('2026-11-15T10:00:00Z')
    expect(reportDueDateISO({ issue_date: '2026-11-15', doc_type: 'NOTA_VENTA' })).toBe('2026-11-15')
  })
  it('retenciones y percepciones tampoco', () => {
    expect(reportDueDateISO({ issue_date: '2026-11-15', doc_type: 'RETENCION' })).toBe('')
    expect(reportDueDateISO({ issue_date: '2026-11-15', doc_type: 'PERCEPCION' })).toBe('')
  })
  it('notas de crédito y débito no tienen vencimiento', () => {
    expect(reportDueDateISO({ issue_date: '2026-11-15', doc_type: 'NOTA_CREDITO' })).toBe('')
    expect(reportDueDateISO({ due_date: '', issue_date: '2026-11-15', doc_type: 'NOTA_DEBITO' })).toBe('')
  })
})
