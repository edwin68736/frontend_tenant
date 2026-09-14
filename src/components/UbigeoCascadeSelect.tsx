import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'
import {
  ubigeoService,
  type UbiRegion,
  type UbiProvincia,
  type UbiDistrito,
} from '@/services/ubigeo.service'
import { DROPDOWN_Z_INDEX } from '@/utils/uiLayers'

/**
 * Selector de ubigeo en un solo campo, con menú en cascada de 3 columnas
 * (Departamento → Provincia → Distrito) que se abren juntas dentro del mismo panel —
 * igual que el selector de "Ubigeo origen/destino" del sistema anterior (facturador-tukifac),
 * a diferencia de 3 selects apilados (ver UbigeoSelects.tsx, usado en guías de remisión).
 *
 * Solo se pide el distrito final: `onChange` entrega su id y el label ya armado
 * ("Distrito / Provincia / Departamento", desde UbiDistrito.info_busqueda) para que quien
 * lo use no tenga que resolver el árbol completo de nuevo.
 */
export function UbigeoCascadeSelect({
  value,
  label,
  onChange,
  placeholder = 'Seleccionar',
  className,
  disabled,
}: {
  value: string
  /** Label ya resuelto de la selección actual (lo guarda quien use el componente al elegir). */
  label: string
  onChange: (distritoId: string, label: string) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [regiones, setRegiones] = useState<UbiRegion[]>([])
  const [provincias, setProvincias] = useState<UbiProvincia[]>([])
  const [distritos, setDistritos] = useState<UbiDistrito[]>([])
  const [activeRegionId, setActiveRegionId] = useState('')
  const [activeProvinciaId, setActiveProvinciaId] = useState('')
  const [loadingRegiones, setLoadingRegiones] = useState(false)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingDistritos, setLoadingDistritos] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open || regiones.length > 0 || loadingRegiones) return
    setLoadingRegiones(true)
    ubigeoService
      .getRegiones()
      .then(setRegiones)
      .finally(() => setLoadingRegiones(false))
  }, [open, regiones.length, loadingRegiones])

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  function pickRegion(r: UbiRegion) {
    setActiveRegionId(r.id)
    setActiveProvinciaId('')
    setProvincias([])
    setDistritos([])
    setLoadingProvincias(true)
    ubigeoService
      .getProvincias(r.id)
      .then(setProvincias)
      .finally(() => setLoadingProvincias(false))
  }

  function pickProvincia(p: UbiProvincia) {
    setActiveProvinciaId(p.id)
    setDistritos([])
    setLoadingDistritos(true)
    ubigeoService
      .getDistritos(p.id)
      .then(setDistritos)
      .finally(() => setLoadingDistritos(false))
  }

  function pickDistrito(d: UbiDistrito) {
    onChange(d.id, d.info_busqueda || d.nombre)
    setOpen(false)
  }

  const colBase = 'min-w-[150px] max-h-64 overflow-y-auto py-1'
  const rowBase = 'w-full flex items-center justify-between gap-2 text-left px-3 py-1.5 text-sm hover:bg-gray-50'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          className,
          'disabled:opacity-60 disabled:cursor-not-allowed',
          !value && 'text-gray-400',
        )}
      >
        <span className="truncate">{value ? label : placeholder}</span>
        <ChevronDown size={16} className={clsx('shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 flex divide-x divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden"
          style={{ zIndex: DROPDOWN_Z_INDEX }}
        >
          <div className={colBase}>
            {loadingRegiones && <p className="px-3 py-2 text-xs text-gray-400">Cargando...</p>}
            {regiones.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => pickRegion(r)}
                className={clsx(
                  rowBase,
                  activeRegionId === r.id && 'bg-primary-50 text-primary-700 font-semibold',
                )}
              >
                <span className="truncate">{r.nombre}</span>
                <ChevronRight size={14} className="shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
          {activeRegionId && (
            <div className={colBase}>
              {loadingProvincias && <p className="px-3 py-2 text-xs text-gray-400">Cargando...</p>}
              {!loadingProvincias && provincias.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Sin provincias</p>
              )}
              {provincias.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickProvincia(p)}
                  className={clsx(
                    rowBase,
                    activeProvinciaId === p.id && 'bg-primary-50 text-primary-700 font-semibold',
                  )}
                >
                  <span className="truncate">{p.nombre}</span>
                  <ChevronRight size={14} className="shrink-0 text-gray-400" />
                </button>
              ))}
            </div>
          )}
          {activeProvinciaId && (
            <div className={colBase}>
              {loadingDistritos && <p className="px-3 py-2 text-xs text-gray-400">Cargando...</p>}
              {!loadingDistritos && distritos.length === 0 && (
                <p className="px-3 py-2 text-xs text-gray-400">Sin distritos</p>
              )}
              {distritos.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => pickDistrito(d)}
                  className={clsx(rowBase, value === d.id && 'bg-primary-50 text-primary-700 font-semibold')}
                >
                  <span className="truncate">{d.nombre}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
