import { useEffect, useState } from 'react'
import {
  ubigeoService,
  type UbiRegion,
  type UbiProvincia,
  type UbiDistrito,
} from '@/services/ubigeo.service'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export interface UbigeoSelectsProps {
  regionId: string
  provinciaId: string
  distritoId: string
  onChange: (regionId: string, provinciaId: string, distritoId: string) => void
  selectClassName?: string
  disabled?: boolean
}

export function UbigeoSelects({
  regionId,
  provinciaId,
  distritoId,
  onChange,
  selectClassName = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[rgb(var(--p400))] bg-white',
  disabled = false,
}: UbigeoSelectsProps) {
  const [regiones, setRegiones] = useState<UbiRegion[]>([])
  const [provincias, setProvincias] = useState<UbiProvincia[]>([])
  const [distritos, setDistritos] = useState<UbiDistrito[]>([])
  const [loadingRegiones, setLoadingRegiones] = useState(true)
  const [loadingProvincias, setLoadingProvincias] = useState(false)
  const [loadingDistritos, setLoadingDistritos] = useState(false)
  const { hasPermission } = useAuth()
  const canAddDistrito = hasPermission('company.edit')
  const [addOpen, setAddOpen] = useState(false)
  const [addId, setAddId] = useState('')
  const [addNombre, setAddNombre] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    ubigeoService.getRegiones().then((list) => {
      setRegiones(list)
      setLoadingRegiones(false)
    })
  }, [])

  useEffect(() => {
    if (!regionId) {
      setProvincias([])
      setDistritos([])
      return
    }
    setLoadingProvincias(true)
    ubigeoService.getProvincias(regionId).then((list) => {
      setProvincias(list)
      setDistritos([])
      setLoadingProvincias(false)
    })
  }, [regionId])

  useEffect(() => {
    if (!provinciaId) {
      setDistritos([])
      return
    }
    setLoadingDistritos(true)
    ubigeoService.getDistritos(provinciaId).then((list) => {
      setDistritos(list)
      setLoadingDistritos(false)
    })
  }, [provinciaId])

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Departamento</label>
        <SearchSelect
          options={regiones.map((r) => ({ value: r.id, label: r.nombre }))}
          value={regionId}
          onChange={(v) => onChange(v, '', '')}
          placeholder="Seleccione"
          disabled={disabled || loadingRegiones}
          showSearchOnlyWhenMany={true}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Provincia</label>
        <SearchSelect
          options={provincias.map((p) => ({ value: p.id, label: p.nombre }))}
          value={provinciaId}
          onChange={(v) => onChange(regionId, v, '')}
          placeholder="Seleccione"
          disabled={disabled || !regionId || loadingProvincias}
          showSearchOnlyWhenMany={true}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Distrito</label>
        <SearchSelect
          options={distritos.map((d) => ({ value: d.id, label: d.nombre }))}
          value={distritoId}
          onChange={(v) => onChange(regionId, provinciaId, v)}
          placeholder="Seleccione"
          disabled={disabled || !provinciaId || loadingDistritos}
          showSearchOnlyWhenMany={true}
        />
        {canAddDistrito && !disabled && provinciaId && !addOpen && (
          <button
            type="button"
            onClick={() => {
              setAddId(provinciaId.slice(0, 4))
              setAddNombre('')
              setAddOpen(true)
            }}
            className="mt-1 text-xs text-[rgb(var(--p600))] hover:underline"
          >
            ¿No aparece su distrito? Agregarlo
          </button>
        )}
      </div>
      {addOpen && (
        <div className="sm:col-span-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
          <p className="text-xs text-amber-900">
            Use esto solo si su distrito fue creado hace poco y no figura en la lista. Ingrese el código de ubigeo de 6 dígitos (INEI) que aparece en
            su ficha RUC de SUNAT y el nombre del distrito.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr_auto_auto] gap-2 items-end">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Código (6 dígitos)</label>
              <input
                value={addId}
                onChange={(e) => setAddId(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                placeholder="180107"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del distrito</label>
              <input
                value={addNombre}
                onChange={(e) => setAddNombre(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                placeholder="Ej. San Antonio"
              />
            </div>
            <button
              type="button"
              disabled={adding || addId.length !== 6 || addNombre.trim().length < 3}
              onClick={async () => {
                setAdding(true)
                try {
                  const d = await ubigeoService.addDistrito(addId, addNombre.trim())
                  const list = await ubigeoService.getDistritos(d.provincia_id)
                  setDistritos(list)
                  onChange(d.region_id, d.provincia_id, d.id)
                  toast.success(`Distrito «${d.nombre}» disponible`)
                  setAddOpen(false)
                } catch (e: unknown) {
                  toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'No se pudo agregar el distrito')
                } finally {
                  setAdding(false)
                }
              }}
              className="px-3 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium disabled:opacity-50"
            >
              {adding ? '...' : 'Agregar'}
            </button>
            <button type="button" onClick={() => setAddOpen(false)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
