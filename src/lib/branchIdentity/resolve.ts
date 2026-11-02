/**
 * Identidad impresa de una sucursal (nombre, dirección, teléfono, logo) con respaldo a la empresa.
 *
 * Misma regla que el backend (print_data.go de ventas/cotizaciones + pkg/branchlogo): lo propio de
 * la sucursal gana; solo si no lo tiene se usa lo de la empresa. Este archivo es puro (sin red,
 * sin React, sin localStorage) para poder probarse solo.
 */

export interface BranchIdentitySource {
  id?: number
  name?: string
  address?: string
  phone?: string
  logo_url?: string
  logo_data_url?: string
}

export interface CompanyIdentitySource {
  address?: string
  phone?: string
  logo_url?: string
  logo_data_url?: string
}

export interface BranchIdentity {
  branchId: number
  name: string
  address: string
  phone: string
  /** Logo propio embebido (data:) de la sucursal, o '' si no lo tiene / no se pudo embeber. */
  ownLogoDataUrl: string
  /** URL remota del logo propio de la sucursal, o ''. */
  ownLogoUrl: string
  hasOwnAddress: boolean
  hasOwnPhone: boolean
  hasOwnLogo: boolean
}

const t = (v: string | null | undefined): string => String(v ?? '').trim()

export function resolveBranchIdentity(
  branch: BranchIdentitySource | null | undefined,
  company: CompanyIdentitySource | null | undefined,
): BranchIdentity {
  const ownAddress = t(branch?.address)
  const ownPhone = t(branch?.phone)
  const ownLogoUrl = t(branch?.logo_url)
  const ownLogoData = t(branch?.logo_data_url).startsWith('data:') ? t(branch?.logo_data_url) : ''
  return {
    branchId: branch?.id ?? 0,
    name: t(branch?.name),
    address: ownAddress || t(company?.address),
    phone: ownPhone || t(company?.phone),
    ownLogoDataUrl: ownLogoData,
    ownLogoUrl,
    hasOwnAddress: ownAddress !== '',
    hasOwnPhone: ownPhone !== '',
    hasOwnLogo: ownLogoUrl !== '' || ownLogoData !== '',
  }
}

/** Qué le falta a una sucursal (para avisar en la pantalla de sucursales). */
export function branchMissingIdentity(branch: BranchIdentitySource): Array<'dirección' | 'logo'> {
  const id = resolveBranchIdentity(branch, null)
  const out: Array<'dirección' | 'logo'> = []
  if (!id.hasOwnAddress) out.push('dirección')
  if (!id.hasOwnLogo) out.push('logo')
  return out
}

/** Busca una sucursal por id y, si no hay id (p. ej. filas que solo traen el nombre), por nombre. */
export function findBranch<T extends BranchIdentitySource>(
  list: T[],
  ref: { id?: number | null; name?: string | null },
): T | undefined {
  if (ref.id) {
    const byId = list.find((b) => b.id === ref.id)
    if (byId) return byId
  }
  const name = t(ref.name).toLowerCase()
  if (!name) return undefined
  return list.find((b) => t(b.name).toLowerCase() === name)
}
