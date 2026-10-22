import { useEffect, useState } from 'react'
import { MapPin, Pencil } from 'lucide-react'
import type { BranchRow } from '@/services/company.service'
import { ubigeoToIds } from '@/services/ubigeo.service'
import { UbigeoSelects } from '@/components/UbigeoSelects'
import { emptyPlace, type Place } from './despatchModel'
import { Field, inputCls, useUbigeoLabel } from './ui'

/**
 * Tarjeta de punto de partida o llegada: muestra de dónde sale o a dónde llega la mercadería y
 * deja cambiarlo (otra sucursal propia o una dirección escrita a mano).
 */
export function PlaceCard({
  title,
  caption,
  place,
  onChange,
  branches,
  lockedBranchId,
}: {
  title: string
  /** Texto bajo el título: quién está en ese punto (nombre del cliente, sucursal…). */
  caption?: string
  place: Place
  onChange: (p: Place) => void
  /** Si se pasa, se puede elegir una de mis sucursales como este punto. */
  branches?: BranchRow[]
  lockedBranchId?: number | null
}) {
  const [editing, setEditing] = useState(false)
  const [ubi, setUbi] = useState(() => ubigeoToIds(place.ubigeo))
  const label = useUbigeoLabel(place.ubigeo)
  const missing = !place.address.trim() || !place.ubigeo.trim()

  useEffect(() => {
    setUbi(ubigeoToIds(place.ubigeo))
  }, [place.ubigeo])
  // Sin dirección no hay nada que mostrar: abrir el editor directamente.
  useEffect(() => {
    if (missing) setEditing(true)
  }, [missing])

  const branch = branches?.find((b) => b.id === place.branchId)
  const branchOptions = (branches ?? []).filter((b) => b.active !== false && b.id !== lockedBranchId)

  const pickBranch = (raw: string) => {
    if (raw === 'otra') {
      onChange({ ...emptyPlace() })
      return
    }
    const b = branches?.find((x) => x.id === Number(raw))
    if (!b) return
    onChange({ address: b.address?.trim() ?? '', ubigeo: b.fiscal_domicile_code?.trim() ?? '', branchId: b.id })
  }

  return (
    <div className="rounded-xl border border-gray-200 p-3.5 bg-gray-50/50">
      <div className="flex items-start gap-2">
        <MapPin size={16} className="text-[rgb(var(--p600))] mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{title}</p>
          {caption && <p className="text-sm font-medium text-gray-900 truncate">{caption}</p>}
          {!missing && (
            <p className="text-sm text-gray-700 mt-0.5 break-words">
              {place.address}
              {label && <span className="block text-xs text-gray-500">{label}</span>}
            </p>
          )}
          {missing && <p className="text-xs text-amber-700 mt-0.5">Falta completar la dirección.</p>}
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing(true)} className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1 shrink-0">
            <Pencil size={12} /> Cambiar
          </button>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-3 border-t border-gray-200 pt-3">
          {branches && (
            <Field label="Usar una de mis sucursales">
              <select
                className={inputCls}
                value={branch ? String(branch.id) : 'otra'}
                onChange={(e) => pickBranch(e.target.value)}
              >
                {lockedBranchId != null && branches.find((b) => b.id === lockedBranchId) && place.branchId === lockedBranchId && (
                  <option value={String(lockedBranchId)}>{branches.find((b) => b.id === lockedBranchId)?.name}</option>
                )}
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
                <option value="otra">Otra dirección…</option>
              </select>
            </Field>
          )}
          {!branch && (
            <>
              <Field label="Dirección *">
                <input
                  className={inputCls}
                  value={place.address}
                  onChange={(e) => onChange({ ...place, address: e.target.value, branchId: null })}
                  placeholder="Calle, número, urbanización"
                />
              </Field>
              <div>
                <span className="block text-xs font-medium text-gray-600 mb-1">Distrito *</span>
                <UbigeoSelects
                  regionId={ubi.regionId}
                  provinciaId={ubi.provinciaId}
                  distritoId={ubi.distritoId}
                  onChange={(r, p, d) => {
                    setUbi({ regionId: r, provinciaId: p, distritoId: d })
                    onChange({ ...place, ubigeo: d, branchId: null })
                  }}
                />
              </div>
            </>
          )}
          {!missing && (
            <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-[rgb(var(--p700))] hover:underline">
              Listo
            </button>
          )}
        </div>
      )}
    </div>
  )
}
