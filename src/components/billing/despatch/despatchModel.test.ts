import { describe, expect, it } from 'vitest'
import { emptyDraft, validateDraft, type DespatchDraft, type ValidationContext } from './despatchModel'

const RUC = '20999999999'
const ctx: ValidationContext = { companyRuc: RUC, fleet: { carriers: [], drivers: [], vehicles: [] }, hasSeries: true }
const party = (num_doc: string) => ({ tipo_doc: '6', num_doc, rzn_social: 'Empresa', address: 'Av. Uno 100', ubigeo: '150101' })

const partyErrors = (patch: Partial<DespatchDraft>, kind: '09' | '31' = '31') =>
  validateDraft({ ...emptyDraft(kind, 1), ...patch }, ctx).party ?? []

describe('guía transportista con la propia empresa', () => {
  it.each([
    ['remitente', RUC, '20555555555'],
    ['destinatario', '20555555555', RUC],
    ['ambos', RUC, RUC],
  ])('admite la propia empresa como %s', (_, remitente, destinatario) => {
    expect(partyErrors({ party: party(remitente), receiver: party(destinatario) })).toEqual([])
  })

  it('sigue exigiendo remitente y destinatario', () => {
    expect(partyErrors({})).toHaveLength(3) // remitente, su dirección y destinatario
  })

})

describe('guía remitente con la propia empresa', () => {
  const errs = (motivo: DespatchDraft['motivo']) => partyErrors({ motivo, party: party(RUC) }, '09').join(' ')

  it('«Otros» lo admite', () => {
    expect(errs('otros')).toBe('')
  })

  it.each(['venta', 'devolucion'] as const)('%s sigue sin admitirlo', (motivo) => {
    expect(errs(motivo)).toContain('tu propia empresa')
  })
})
