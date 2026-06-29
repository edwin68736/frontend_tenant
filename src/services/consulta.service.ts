import api from './api'

export interface ConsultaRUCResult {
  success: boolean
  ruc?: string
  razon_social?: string
  direccion?: string
  direccion_completa?: string
  estado?: string
  condicion?: string
  departamento?: string
  provincia?: string
  distrito?: string
  ubigeo?: string
  es_agente_de_retencion?: boolean
  es_agente_de_percepcion?: boolean
  es_agente_de_percepcion_combustible?: boolean
  es_buen_contribuyente?: boolean
}

export interface ConsultaDNIResult {
  success: boolean
  nombre_completo?: string
  nombres?: string
  apellido_paterno?: string
  apellido_materno?: string
  doc_number?: string
}

export interface TipoCambioResult {
  success: boolean
  fecha?: string
  fecha_efectiva?: string
  moneda?: string
  venta?: number
  compra?: number
  fuente?: string
  status?: 'confirmed' | 'fallback' | 'pending' | 'unavailable' | string
  es_fallback?: boolean
  proximo_reintento?: string
  mensaje?: string
  error_message?: string
  /** Metadatos cache local (opcional). */
  cached_at?: string
  expires_at?: string
}

/**
 * Consulta DNI/RUC vía backend central (apiperu.dev).
 * Endpoint público: requiere enviar tenant_ruc (RUC de la empresa) para validar que esté registrada en la central.
 */
export const consultaService = {
  dni: (tenantRuc: string, dni: string): Promise<ConsultaDNIResult> =>
    api.post<ConsultaDNIResult>('/api/consulta/dni', { dni: dni.trim(), tenant_ruc: tenantRuc.trim() }).then((r) => r.data),

  ruc: (tenantRuc: string, ruc: string): Promise<ConsultaRUCResult> =>
    api.post<ConsultaRUCResult>('/api/consulta/ruc', { ruc: ruc.trim(), tenant_ruc: tenantRuc.trim() }).then((r) => r.data),

  tipoCambio: (fecha: string): Promise<TipoCambioResult> =>
    api.get<TipoCambioResult>('/api/consulta/tipo-cambio', { params: { fecha } }).then((r) => r.data),
}
