export type ModifierOptionDraft = { name: string; extra_price: number }

export function createEmptyOptionDraft(): ModifierOptionDraft {
  return { name: '', extra_price: 0 }
}

export function draftsFromApiOptions(
  options: { name: string; extra_price?: number }[] | undefined,
): ModifierOptionDraft[] {
  const list = (options ?? []).map((o) => ({
    name: o.name ?? '',
    extra_price: Number(o.extra_price) || 0,
  }))
  return list.length > 0 ? list : [createEmptyOptionDraft()]
}

export function validateOptionDrafts(drafts: ModifierOptionDraft[]): string | null {
  const filled = drafts.filter((d) => d.name.trim())
  if (filled.length === 0) return 'Agrega al menos una opción con nombre'
  for (const d of filled) {
    const price = Number(d.extra_price)
    if (Number.isNaN(price) || price < 0) return 'El precio adicional no puede ser negativo'
  }
  return null
}

export function optionDraftsToPayload(drafts: ModifierOptionDraft[]): { name: string; extra_price: number }[] {
  return drafts
    .map((d) => ({
      name: d.name.trim(),
      extra_price: Math.round((Number(d.extra_price) || 0) * 100) / 100,
    }))
    .filter((d) => d.name.length > 0)
}
