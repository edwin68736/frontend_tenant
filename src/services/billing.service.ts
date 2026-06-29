import api from './api'

export type ManualBillingStatus =
  | 'accepted'
  | 'rejected'
  | 'error'
  | 'processing'
  | 'already_accepted'
  | 'queued'

export interface BillingResult {
  status?: ManualBillingStatus
  success: boolean
  async?: boolean
  safe_to_print?: boolean
  billing_status?: string
  sunat_message?: string
  status_detail?: BillingStatusResponse
  invoice?: unknown
  message: string
  job_status?: string
  xml_url?: string
  pdf_url?: string
  cdr_url?: string
}

/** Estado verificable (GET /api/billing/status/:saleId). */
export interface BillingStatusResponse {
  status: string
  sunat_code: string
  cdr_received: boolean
  sunat_message: string
  xml_signed: boolean
  safe_to_print: boolean
  last_attempt_at: string
  retry_count: number
  job_status: string
  billing_status: string
  pipeline_status: string
  async_in_progress: boolean
}

export interface InvoiceInfo {
  id: number
  sale_id: number
  xml_url: string
  pdf_url: string
  cdr_url: string
  sunat_response?: string
  sunat_message?: string
  sunat_status: string
  /** Código SUNAT del CDR (0 = aceptado, 3205 etc. = rechazo). Según RESPUESTA-SUNAT-BACKEND.md */
  sunat_cdr_code?: string
  /** Notas del CDR (JSON array de strings) para mostrar detalle de rechazo */
  sunat_cdr_notes?: string
  pipeline_status?: string
  /** Hash de la firma del XML (Lycet); para generar QR en el PDF */
  sunat_hash?: string
  created_at?: string
}

/** Envío manual síncrono: el backend puede esperar hasta ~90s la respuesta SUNAT. */
const MANUAL_BILLING_TIMEOUT_MS = 120_000

export const billingService = {
  send: (saleId: number): Promise<BillingResult> =>
    api.post(`/api/billing/send/${saleId}`, undefined, { timeout: MANUAL_BILLING_TIMEOUT_MS }).then(r => r.data),

  getStatus: (saleId: number): Promise<BillingStatusResponse> =>
    api.get(`/api/billing/status/${saleId}`).then(r => r.data),

  getJobStatus: (saleId: number): Promise<{ invoice: InvoiceInfo }> =>
    api.get(`/api/billing/job/${saleId}`).then(r => r.data),

  /** Reenviar el mismo comprobante (solo cuando falló el envío, no si fue rechazado por SUNAT). */
  resend: (saleId: number): Promise<BillingResult & { invoice?: unknown }> =>
    api.post(`/api/billing/resend/${saleId}`, undefined, { timeout: MANUAL_BILLING_TIMEOUT_MS }).then(r => r.data),

  /** Anular la venta generando y enviando una nota de crédito a SUNAT; luego se anula la venta original. */
  voidWithCreditNote: (saleId: number, reason: string): Promise<{ success: boolean; message?: string; nc_sale?: unknown; invoice?: unknown }> =>
    api.post(`/api/billing/void-with-credit-note/${saleId}`, { reason }).then(r => r.data),

  getInvoice: (saleId: number): Promise<InvoiceInfo> =>
    api.get(`/api/billing/invoice/${saleId}`).then(r => r.data),

  /** Descarga documento: xml = enviado a SUNAT, xml-generated = generado/firmado sin envío (Lycet), cdr, pdf. Usa el nombre del header Content-Disposition si viene (formato SUNAT ej. 03-B001-26.pdf). */
  downloadDocument: async (saleId: number, kind: 'xml' | 'xml-generated' | 'cdr' | 'pdf'): Promise<void> => {
    try {
      const res = await api.get(`/api/billing/invoice/${saleId}/document/${kind}`, { responseType: 'blob' })
      const contentDisp = res.headers?.['content-disposition'] as string | undefined
      let name = 'comprobante'
      if (kind === 'cdr') name = 'comprobante.cdr.zip'
      else if (kind === 'pdf') name = 'comprobante.pdf'
      else if (kind === 'xml-generated') name = 'comprobante-generado.xml'
      else name = 'comprobante-enviado.xml'
      if (contentDisp) {
        const match = contentDisp.match(/filename\*?=(?:UTF-8'')?"?([^";\n]+)"?/i)
        if (match?.[1]) name = match[1].trim().replace(/^"|"$/g, '')
      }
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      if (e.response?.status === 404) throw new Error('Documento no disponible')
      throw e
    }
  },

  /** Abre el PDF del comprobante en una nueva pestaña (con auth vía blob). */
  viewPdf: async (saleId: number): Promise<void> => {
    try {
      const res = await api.get(`/api/billing/invoice/${saleId}/document/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (e: any) {
      if (e.response?.status === 404) throw new Error('PDF no disponible')
      throw e
    }
  },

  /** Obtiene el PDF como blob y devuelve un object URL para usarlo en iframe. El llamador debe revocar la URL (URL.revokeObjectURL) cuando ya no la use. */
  getPdfObjectUrl: async (saleId: number): Promise<string> => {
    const res = await api.get(`/api/billing/invoice/${saleId}/document/pdf`, { responseType: 'blob' })
    if (!(res.data instanceof Blob) || res.data.size === 0) throw new Error('PDF no disponible')
    return URL.createObjectURL(res.data)
  },

  // --- Resúmenes diarios y comunicaciones de baja ---

  listSummaries: (): Promise<{ summaries: SunatSummary[] }> =>
    api.get('/api/billing/summaries').then(r => r.data),

  createSummary: (fecResumen: string): Promise<{ success: boolean; summary: SunatSummary }> =>
    api.post('/api/billing/summaries', { fec_resumen: fecResumen }).then(r => r.data),

  getSummaryStatus: (id: number): Promise<SunatSummary> =>
    api.get(`/api/billing/summaries/${id}/status`).then(r => r.data),

  listVoided: (): Promise<{ voided: SunatVoided[] }> =>
    api.get('/api/billing/voided').then(r => r.data),

  createVoided: (details: VoidedDetailInput[]): Promise<{ success: boolean; voided: SunatVoided }> =>
    api.post('/api/billing/voided', { details }).then(r => r.data),

  getVoidedStatus: (id: number): Promise<SunatVoided> =>
    api.get(`/api/billing/voided/${id}/status`).then(r => r.data),

  consultInvoiceStatus: (tipo: string, serie: string, numero: string): Promise<InvoiceStatusResult> =>
    api.get('/api/billing/invoice-status', { params: { tipo, serie, numero } }).then(r => r.data),

  getNotificationCounts: (): Promise<{ pending: number; error: number; rejected: number }> =>
    api.get('/api/billing/notification-counts').then(r => r.data),

  // --- Guías de remisión ---
  listDespatches: (): Promise<{ despatches: SunatDespatch[] }> =>
    api.get('/api/billing/despatches').then(r => r.data),
  createDespatch: (payload: CreateDespatchInput): Promise<{ success: boolean; async?: boolean; message?: string; despatch: SunatDespatch }> =>
    api.post('/api/billing/despatches', payload).then(r => r.data),
  getDespatchStatus: (id: number): Promise<SunatDespatch> =>
    api.get(`/api/billing/despatches/${id}/status`).then(r => r.data),

  // --- Retención ---
  listRetentions: (params?: FiscalAuxListParams): Promise<{ retentions: SunatRetention[] }> =>
    api.get('/api/billing/retentions', { params: cleanFiscalAuxParams(params) }).then(r => r.data),
  createRetention: (payload: CreateRetentionInput): Promise<{ success: boolean; async?: boolean; message?: string; retention: SunatRetention }> =>
    api.post('/api/billing/retentions', payload).then(r => r.data),
  getRetentionStatus: (id: number): Promise<SunatRetention> =>
    api.get(`/api/billing/retentions/${id}/status`).then(r => r.data),

  // --- Percepción ---
  listPerceptions: (params?: FiscalAuxListParams): Promise<{ perceptions: SunatPerception[] }> =>
    api.get('/api/billing/perceptions', { params: cleanFiscalAuxParams(params) }).then(r => r.data),
  createPerception: (payload: CreatePerceptionInput): Promise<{ success: boolean; async?: boolean; message?: string; perception: SunatPerception }> =>
    api.post('/api/billing/perceptions', payload).then(r => r.data),
  getPerceptionStatus: (id: number): Promise<SunatPerception> =>
    api.get(`/api/billing/perceptions/${id}/status`).then(r => r.data),

  // --- Reversión ---
  listReversions: (params?: FiscalAuxListParams): Promise<{ reversions: SunatReversion[] }> =>
    api.get('/api/billing/reversions', { params: cleanFiscalAuxParams(params) }).then(r => r.data),
  createReversion: (details: VoidedDetailInput[]): Promise<{ success: boolean; reversion: SunatReversion }> =>
    api.post('/api/billing/reversions', { details }).then(r => r.data),
  getReversionStatus: (id: number): Promise<SunatReversion> =>
    api.get(`/api/billing/reversions/${id}/status`).then(r => r.data),
}

export interface FiscalAuxListParams {
  q?: string
  status?: string
  billing_status?: string
  serie?: string
  correlativo?: string
  purchase_id?: number
  source_sale_id?: number
  from?: string
  to?: string
}

function cleanFiscalAuxParams(params?: FiscalAuxListParams): Record<string, string | number> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    out[k] = v as string | number
  }
  return Object.keys(out).length ? out : undefined
}

export interface LinkedReversionSummary {
  id: number
  correlativo: string
  status: string
  ticket?: string
  sunat_code?: string
  motivo?: string
}

export interface LinkedFiscalDocSummary {
  id: number
  sale_id?: number
  series: string
  correlative: string
  status: string
  billing_status?: string
  doc_kind: 'retention' | 'perception'
  sunat_code?: string
  sunat_message?: string
  linked_reversion?: LinkedReversionSummary | null
}

export interface SunatSummary {
  id: number
  fec_resumen: string
  correlativo: string
  ticket: string
  status: string
  sunat_code?: string
  sunat_message?: string
  cdr_url?: string
  details_count: number
  created_at?: string
}

export interface SunatVoided {
  id: number
  fec_comunicacion: string
  correlativo: string
  ticket: string
  status: string
  sunat_code?: string
  sunat_message?: string
  cdr_url?: string
  details_count: number
  created_at?: string
}

export interface VoidedDetailInput {
  tipo_doc: string
  serie: string
  correlativo: string
  des_motivo_baja: string
}

export interface InvoiceStatusResult {
  success: boolean
  error?: { code?: string; message?: string }
  code?: string
  cdrZip?: string
  cdrResponse?: {
    accepted: boolean
    id?: string
    code?: string
    description?: string
    notes?: string[]
  }
}

export interface SunatDespatch {
  id: number
  sale_id?: number
  branch_id: number
  series_id: number
  series: string
  correlative: number
  issue_date: string
  destinatario_ruc?: string
  destinatario_razon?: string
  ticket?: string
  status: string
  billing_status?: string
  doc_type?: string
  sunat_code?: string
  sunat_message?: string
  cdr_url?: string
  details_count: number
  created_at?: string
}

export interface SunatRetention {
  id: number
  sale_id?: number
  purchase_id?: number
  series: string
  correlative: string
  fecha_emision: string
  proveedor_ruc?: string
  proveedor_razon?: string
  regimen?: string
  tasa: number
  imp_retenido: number
  imp_pagado: number
  status: string
  billing_status?: string
  sunat_code?: string
  sunat_message?: string
  cdr_url?: string
  details_count: number
  created_at?: string
  linked_reversion?: LinkedReversionSummary | null
  origin_purchase_label?: string
}

export interface SunatPerception {
  id: number
  sale_id?: number
  source_sale_id?: number
  series: string
  correlative: string
  fecha_emision: string
  proveedor_ruc?: string
  proveedor_razon?: string
  regimen?: string
  tasa: number
  imp_percibido: number
  imp_cobrado: number
  status: string
  billing_status?: string
  sunat_code?: string
  sunat_message?: string
  cdr_url?: string
  details_count: number
  created_at?: string
  linked_reversion?: LinkedReversionSummary | null
  origin_sale_label?: string
}

export interface RevertedDocLine {
  tipo_doc: string
  serie: string
  correlativo: string
  motivo: string
}

export interface SunatReversion {
  id: number
  fec_comunicacion: string
  correlativo: string
  ticket?: string
  status: string
  sunat_code?: string
  sunat_message?: string
  details_count: number
  created_at?: string
  details?: RevertedDocLine[]
}

export interface CreateDespatchInput {
  branch_id: number
  series_id: number
  source_sale_id?: number
  destinatario: { tipo_doc: string; num_doc: string; rzn_social: string; address: string; ubigeo?: string }
  remitente?: { tipo_doc: string; num_doc: string; rzn_social: string; address: string; ubigeo?: string }
  envio: {
    cod_traslado: string
    des_traslado: string
    mod_traslado: string
    fec_traslado: string
    fec_entrega_transportista?: string
    partida_ubigueo?: string
    partida_direccion?: string
    llegada_ubigueo?: string
    llegada_direccion?: string
    peso_total: number
    und_peso_total?: string
    num_bultos: number
    transportista_ruc?: string
    transportista_razon?: string
    transportista_placa?: string
    transportista_mtc?: string
    vehiculo_hab_cert?: string
    vehiculo_cod_emisor?: string
    chofer_tipo_doc?: string
    chofer_doc?: string
    chofer_licencia?: string
    chofer_nombres?: string
    chofer_apellidos?: string
  }
  details: Array<{ codigo: string; descripcion: string; unidad: string; cantidad: number }>
}

export interface CreateRetentionInput {
  branch_id: number
  series_id: number
  contact_id: number
  source_purchase_id?: number
  fecha_emision: string
  observacion?: string
  proveedor: { tipo_doc: string; num_doc: string; rzn_social: string; address: string; ubigeo?: string }
  regimen: string
  tasa: number
  imp_retenido: number
  imp_pagado: number
  details: Array<{
    tipo_doc: string
    num_doc: string
    fecha_emision: string
    imp_total: number
    moneda?: string
    pagos: Array<{ moneda?: string; importe: number; fecha: string }>
    fecha_retencion: string
    imp_retenido: number
    imp_pagar: number
    tipo_cambio?: { moneda_ref: string; moneda_obj: string; factor: number; fecha: string }
  }>
}

export interface CreatePerceptionInput {
  branch_id: number
  series_id: number
  contact_id: number
  source_sale_id?: number
  fecha_emision: string
  observacion?: string
  proveedor: { tipo_doc: string; num_doc: string; rzn_social: string; address: string; ubigeo?: string }
  regimen: string
  tasa: number
  imp_percibido: number
  imp_cobrado: number
  details: Array<{
    tipo_doc: string
    num_doc: string
    fecha_emision: string
    imp_total: number
    moneda?: string
    cobros: Array<{ moneda?: string; importe: number; fecha: string }>
    fecha_percepcion: string
    imp_percibido: number
    imp_cobrar: number
    tipo_cambio?: { moneda_ref: string; moneda_obj: string; factor: number; fecha: string }
  }>
}
