/** Selección estructurada de presentación o extra (persistida en venta). */
export type CartModifierEntry = {
  group_id: number
  group_name: string
  type: 'variant' | 'modifier'
  option_id: number
  option_name: string
  extra_price: number
}

/** Snapshot histórico en venta (modifiers_json). */
export type StoredModifierEntry = {
  group_id?: number
  group_name?: string
  type?: 'variant' | 'modifier'
  group_type?: 'variant' | 'modifier'
  group_required?: boolean
  option_id?: number
  option_name?: string
  name?: string
  extra_price: number
  snapshot?: boolean
}
