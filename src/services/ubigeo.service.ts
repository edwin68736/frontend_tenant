import api from './api'

export interface UbiRegion {
  id: string
  nombre: string
}

export interface UbiProvincia {
  id: string
  nombre: string
  region_id: string
}

export interface UbiDistrito {
  id: string
  nombre: string
  provincia_id: string
  region_id: string
}

export const ubigeoService = {
  getRegiones: () => api.get<{ data: UbiRegion[] }>('/api/ubigeo/regiones').then((r) => r.data.data ?? []),
  getProvincias: (regionId: string) =>
    api.get<{ data: UbiProvincia[] }>('/api/ubigeo/provincias', { params: { region_id: regionId } }).then((r) => r.data.data ?? []),
  getDistritos: (provinciaId: string) =>
    api.get<{ data: UbiDistrito[] }>('/api/ubigeo/distritos', { params: { provincia_id: provinciaId } }).then((r) => r.data.data ?? []),
}

/** Parsea ubigeo (6 dígitos) en region_id, provincia_id y distrito_id para preseleccionar selects. */
export function ubigeoToIds(ubigeo: string): { regionId: string; provinciaId: string; distritoId: string } {
  if (!ubigeo || ubigeo.length < 6) return { regionId: '', provinciaId: '', distritoId: ubigeo || '' }
  return {
    regionId: ubigeo.slice(0, 2) + '0000',
    provinciaId: ubigeo.slice(0, 4) + '00',
    distritoId: ubigeo,
  }
}
