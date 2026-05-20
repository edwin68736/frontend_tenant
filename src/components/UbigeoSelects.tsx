import { useEffect, useState } from 'react'
import {
  ubigeoService,
  type UbiRegion,
  type UbiProvincia,
  type UbiDistrito,
} from '@/services/ubigeo.service'
import { SearchSelect } from '@/components/ui/SearchSelect'

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
      </div>
    </div>
  )
}
