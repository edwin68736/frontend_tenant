/**
 * Categorías por sucursal (V192): branch_id null/ausente = todas las sucursales; con valor, solo esa sucursal.
 * Espejo de pkg/categorybranch del backend.
 */
import type { Category } from '@/services/products.service'

type BranchLike = { id: number; name: string }

/** Nombre de la sucursal de la categoría, o null si es de todas. */
export function categoryBranchName(c: Pick<Category, 'branch_id'>, branches: BranchLike[]): string | null {
  if (c.branch_id == null) return null
  return branches.find((b) => b.id === c.branch_id)?.name ?? `Sucursal ${c.branch_id}`
}

/**
 * Texto para selectores: «Bebidas» o «Bebidas · Surco» (así dos «Bebidas» de sucursales distintas no se confunden).
 * Con una sola sucursal no se agrega nada: no hay nada que distinguir.
 */
export function categoryLabel(c: Pick<Category, 'name' | 'branch_id'>, branches: BranchLike[]): string {
  if (branches.length <= 1) return c.name
  const where = categoryBranchName(c, branches)
  return where ? `${c.name} · ${where}` : c.name
}

/**
 * Categorías que admite un producto según las sucursales donde se vende: las de todas, y las de una sucursal solo si el
 * producto se vende ÚNICAMENTE allí (branchIds = esa sola sucursal; vacío = todas las sucursales). `keepId` conserva la
 * categoría ya elegida aunque ya no sea compatible, para que el usuario la vea y el aviso explique qué corregir.
 */
export function categoriesForProduct<T extends Pick<Category, 'id' | 'branch_id'>>(
  categories: T[],
  branchIds: number[],
  keepId?: number | null,
): T[] {
  return categories.filter(
    (c) =>
      c.branch_id == null ||
      (branchIds.length === 1 && branchIds[0] === c.branch_id) ||
      (keepId != null && c.id === keepId),
  )
}

/** Mensaje cuando la categoría elegida es de una sucursal y el producto no se vende solo allí; null si es compatible. */
export function categoryProductConflict(
  category: Pick<Category, 'name' | 'branch_id'> | undefined,
  branchIds: number[],
  branches: BranchLike[],
): string | null {
  if (!category || category.branch_id == null) return null
  if (branchIds.length === 1 && branchIds[0] === category.branch_id) return null
  const where = categoryBranchName(category, branches)
  return `«${category.name}» es solo de ${where}: en «Disponible en» deja únicamente esa sucursal, o elige una categoría de todas las sucursales.`
}
