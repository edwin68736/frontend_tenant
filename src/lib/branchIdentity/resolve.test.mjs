// Ejecutar: node --test --experimental-strip-types src/lib/branchIdentity/resolve.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveBranchIdentity, branchMissingIdentity, findBranch } from './resolve.ts'

const company = { address: 'Av. Empresa 1', phone: '111', logo_url: '/c.png' }

test('la sucursal con datos propios gana sobre la empresa', () => {
  const id = resolveBranchIdentity(
    { id: 2, name: 'Norte', address: ' Jr. Norte 5 ', phone: '222', logo_url: '/b.png', logo_data_url: 'data:image/png;base64,AA' },
    company,
  )
  assert.equal(id.address, 'Jr. Norte 5')
  assert.equal(id.phone, '222')
  assert.equal(id.ownLogoDataUrl, 'data:image/png;base64,AA')
  assert.ok(id.hasOwnAddress && id.hasOwnLogo && id.hasOwnPhone)
})

test('sin dirección/teléfono propios cae a la empresa y lo marca', () => {
  const id = resolveBranchIdentity({ id: 3, name: 'Sur', address: '  ', phone: '' }, company)
  assert.equal(id.address, 'Av. Empresa 1')
  assert.equal(id.phone, '111')
  assert.equal(id.hasOwnAddress, false)
  assert.equal(id.hasOwnLogo, false)
})

test('logo propio sin embeber conserva su URL (no se confunde con el de la empresa)', () => {
  const id = resolveBranchIdentity({ id: 4, name: 'X', logo_url: '/b4.png', logo_data_url: '' }, company)
  assert.equal(id.hasOwnLogo, true)
  assert.equal(id.ownLogoUrl, '/b4.png')
  assert.equal(id.ownLogoDataUrl, '')
})

test('sucursal inexistente: todo viene de la empresa', () => {
  const id = resolveBranchIdentity(undefined, company)
  assert.equal(id.address, 'Av. Empresa 1')
  assert.equal(id.hasOwnLogo, false)
})

test('branchMissingIdentity', () => {
  assert.deepEqual(branchMissingIdentity({ name: 'A' }), ['dirección', 'logo'])
  assert.deepEqual(branchMissingIdentity({ name: 'A', address: 'x', logo_url: '/l.png' }), [])
  assert.deepEqual(branchMissingIdentity({ name: 'A', address: 'x' }), ['logo'])
})

test('findBranch por id y por nombre', () => {
  const list = [{ id: 1, name: 'Principal' }, { id: 2, name: 'Norte' }]
  assert.equal(findBranch(list, { id: 2 })?.name, 'Norte')
  assert.equal(findBranch(list, { name: ' norte ' })?.id, 2)
  assert.equal(findBranch(list, { id: 9, name: 'Principal' })?.id, 1)
  assert.equal(findBranch(list, {}), undefined)
})
