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
}

export interface ConsultaDNIResult {
  success: boolean
  nombre_completo?: string
  nombres?: string
  apellido_paterno?: string
  apellido_materno?: string
  doc_number?: string
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
}
