import type { ModifierGroup, Product, ProductPresentation } from '@/services/products.service'
import type { CartModifierEntry, StoredModifierEntry } from '@/types/productModifiers'
import { formatAmountDisplay } from '@/utils/money'

export function productNeedsConfiguration(product: Product): boolean {
  return !!(product.has_modifiers || product.has_variants)
}

/** POS / ventas: incluye series obligatorias. */
export function productNeedsSaleConfiguration(product: Product): boolean {
  return !!(product.has_modifiers || product.has_variants || product.manage_series)
}

/** Etiqueta corta para catálogo / picker (presentaciones, extras, serie). */
export function productConfigurationBadge(product: Product): string | null {
  const parts: string[] = []
  if (product.has_variants) parts.push('Presentaciones')
  if (product.has_modifiers) parts.push('Extras')
  if (product.manage_series) parts.push('Serie')
  return parts.length > 0 ? parts.join(' · ') : null
}

export function getProductExtraGroups(
  modifierGroupIds: number[],
  allGroups: ModifierGroup[],
  product: Product,
): ModifierGroup[] {
  if (!product.has_modifiers) return []
  return allGroups.filter((g) => modifierGroupIds.includes(g.id))
}

export function getModifierSetupIssue(
  product: Product,
  modifierGroupIds: number[],
  allGroups: ModifierGroup[],
  presentations: ProductPresentation[],
): string | null {
  if (!productNeedsConfiguration(product)) return null

  const extras = getProductExtraGroups(modifierGroupIds, allGroups, product)
  const pres = product.has_variants ? presentations.filter((p) => p.name.trim()) : []

  if (product.has_variants && pres.length === 0 && !product.has_modifiers) {
    return 'Agrega al menos una presentación al editar el producto.'
  }
  if (product.has_modifiers && modifierGroupIds.length === 0) {
    return 'Vincula grupos de extras al producto o desactiva «Extras».'
  }
  if (product.has_modifiers && extras.length === 0) {
    return 'Los grupos de extras vinculados no existen. Revisa grupos y producto.'
  }
  if (product.has_modifiers && !extras.some((g) => (g.options?.length ?? 0) > 0)) {
    return 'Los grupos de extras no tienen opciones.'
  }
  return null
}

export function calcUnitPriceWithModifiers(
  basePrice: number,
  modifiers: CartModifierEntry[],
): number {
  const presentation = modifiers.find((m) => m.type === 'variant')
  const extras = modifiers.filter((m) => m.type === 'modifier')

  let unit = basePrice
  if (presentation) {
    const p = Number(presentation.extra_price) || 0
    if (p > 0) unit = p
  }

  const extrasSum = extras.reduce((s, m) => s + (Number(m.extra_price) || 0), 0)
  return roundMoney(unit + extrasSum)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export function normalizeItemNote(note: string): string {
  return note.trim().replace(/\s+/g, ' ')
}

export function buildConfigureKey(modifiers: CartModifierEntry[], itemNote: string): string {
  const modPart = modifiers
    .map((m) => `${m.type}:${m.option_id}`)
    .sort()
    .join('|')
  return `p-${modPart}-n-${normalizeItemNote(itemNote)}`
}

export function buildCatalogConfigureKey(
  modifiers: CartModifierEntry[],
  itemNote: string,
  unitPrice: number,
  serials?: string[],
): string {
  const serialPart = serials?.length ? `@s${[...serials].sort().join(',')}` : ''
  return `${buildConfigureKey(modifiers, itemNote)}@u${roundMoney(unitPrice).toFixed(2)}${serialPart}`
}

export function hasConfigurableModifierUI(
  product: Product,
  modifierGroupIds: number[],
  allGroups: ModifierGroup[],
  presentations: ProductPresentation[],
): boolean {
  const pres = product.has_variants && presentations.some((p) => p.name.trim())
  const extras = getProductExtraGroups(modifierGroupIds, allGroups, product)
  const withOptions = extras.some((g) => (g.options?.length ?? 0) > 0)
  return pres || withOptions
}

export function validateModifierSelection(
  presentations: ProductPresentation[],
  extraGroups: ModifierGroup[],
  selected: CartModifierEntry[],
  product: Product,
): string | null {
  const activePres = presentations.filter((p) => p.name.trim())
  if (product.has_variants && activePres.length > 0) {
    const picked = selected.filter((s) => s.type === 'variant')
    if (picked.length !== 1) {
      return 'Elige una presentación del producto'
    }
  }
  for (const g of extraGroups) {
    const picked = selected.filter((s) => s.type === 'modifier' && s.group_id === g.id)
    if (g.required && picked.length === 0) {
      return `Elige al menos un extra en «${g.name}»`
    }
    if (!g.multi_select && picked.length > 1) {
      return `Solo una opción en «${g.name}»`
    }
  }
  return null
}

export function selectionFromProductPresentation(p: ProductPresentation): CartModifierEntry {
  return {
    group_id: 0,
    group_name: 'Presentación',
    type: 'variant',
    option_id: p.id ?? 0,
    option_name: p.name.trim(),
    extra_price: Number(p.sale_price) || 0,
  }
}

export function toggleExtraSelection(
  selected: CartModifierEntry[],
  group: ModifierGroup,
  optionId: number,
): CartModifierEntry[] {
  const opt = group.options?.find((o) => o.id === optionId)
  if (!opt) return selected
  const entry: CartModifierEntry = {
    group_id: group.id,
    group_name: group.name,
    type: 'modifier',
    option_id: opt.id,
    option_name: opt.name,
    extra_price: Number(opt.extra_price) || 0,
  }
  const exists = selected.some((s) => s.type === 'modifier' && s.option_id === opt.id)
  if (exists) {
    return selected.filter((s) => !(s.type === 'modifier' && s.option_id === opt.id))
  }
  if (!group.multi_select) {
    return [...selected.filter((s) => !(s.type === 'modifier' && s.group_id === group.id)), entry]
  }
  return [...selected, entry]
}

function normalizeStoredType(x: StoredModifierEntry & { type?: string; group_type?: string }): 'variant' | 'modifier' {
  const t = x.type ?? x.group_type
  return t === 'variant' ? 'variant' : 'modifier'
}

export function parseStoredModifiers(raw: string | null | undefined): StoredModifierEntry[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    const out: StoredModifierEntry[] = []
    for (const row of parsed) {
      if (row == null || typeof row !== 'object') continue
      const x = row as StoredModifierEntry & { name?: string }
      const option_name = String(x.option_name ?? x.name ?? '').trim()
      const option_id = Number(x.option_id) || 0
      if (!option_name && option_id <= 0) continue
      const type = normalizeStoredType(x)
      out.push({
        group_id: Number(x.group_id) || 0,
        group_name: String(x.group_name ?? ''),
        type,
        group_type: type,
        group_required: !!x.group_required,
        option_id,
        option_name,
        extra_price: Number(x.extra_price) || 0,
        snapshot: x.snapshot !== false,
      })
    }
    return out
  } catch {
    return []
  }
}

export function storedToCartModifiers(entries: StoredModifierEntry[]): CartModifierEntry[] {
  return entries
    .filter((e) => (e.option_name ?? '').trim() !== '' || (Number(e.option_id) || 0) > 0)
    .map((e) => ({
      group_id: Number(e.group_id) || 0,
      group_name: String(e.group_name ?? ''),
      type: e.type === 'variant' ? 'variant' : 'modifier',
      option_id: Number(e.option_id) || 0,
      option_name: String(e.option_name ?? '').trim() || 'Opción',
      extra_price: Number(e.extra_price) || 0,
    }))
}

export function modifiersToJson(modifiers: CartModifierEntry[]): string {
  if (modifiers.length === 0) return ''
  const payload: StoredModifierEntry[] = modifiers.map((m) => ({
    group_id: m.group_id,
    group_name: m.group_name,
    type: m.type,
    group_type: m.type,
    option_id: m.option_id,
    option_name: m.option_name,
    extra_price: m.extra_price,
    snapshot: true,
  }))
  return JSON.stringify(payload)
}

export function formatModifierLines(modifiers: StoredModifierEntry[] | CartModifierEntry[]): string[] {
  const lines: string[] = []
  for (const m of modifiers) {
    const label = String(m.option_name ?? (m as StoredModifierEntry).name ?? '').trim()
    if (!label) continue
    if (m.type === 'variant') {
      const price = Number(m.extra_price) || 0
      lines.push(price > 0 ? `${label} (S/ ${formatAmountDisplay(price)})` : label)
    } else {
      const price = Number(m.extra_price) || 0
      lines.push(price > 0 ? `+ ${label} (+S/ ${formatAmountDisplay(price)})` : `+ ${label}`)
    }
  }
  return lines
}

export function formatModifierSummary(modifiers: CartModifierEntry[] | StoredModifierEntry[]): string {
  return formatModifierLines(modifiers).join(' · ')
}
