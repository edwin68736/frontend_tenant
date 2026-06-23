/** Parseo de respuesta SUNAT / CDR para UI de detalle de comprobante. */

export interface SunatObservation {
  code: string
  message: string
  node?: string
  value?: string
}

export type SunatFiscalOutcome = 'accepted' | 'observed' | 'rejected' | 'pending' | 'error' | 'unknown'

export interface SunatFiscalDetailView {
  outcome: SunatFiscalOutcome
  cdrCode: string | null
  summary: string | null
  observations: SunatObservation[]
  rejectionErrors: SunatObservation[]
  cdrNotes: string[]
  rawMessage: string | null
  pipelineStatus: string | null
}

export interface SunatFiscalInvoiceInput {
  sunat_message?: string | null
  sunat_response?: string | null
  sunat_cdr_code?: string | null
  sunat_cdr_notes?: string | null
  sunat_status?: string | null
  pipeline_status?: string | null
}

const INFO_RE = /INFO:\s*(\d+)\s*\(nodo:\s*"([^"]*)"\s*valor:\s*"([^"]*)"\)/gi
const OBS_SEGMENT_RE = /^(\d{4})\s*-\s*(.+)$/i

export function parseCdrNotesJson(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((n) => String(n).trim()).filter(Boolean)
    }
  } catch {
    /* texto libre */
  }
  const t = raw.trim()
  return t ? [t] : []
}

export function extractObservationsFromMessage(message: string): SunatObservation[] {
  const out: SunatObservation[] = []
  const seen = new Set<string>()

  const add = (o: SunatObservation) => {
    const codeNum = Number(o.code)
    if (!Number.isNaN(codeNum) && codeNum > 0 && codeNum < 4000) return
    const key = `${o.code}|${o.node ?? ''}|${o.message.slice(0, 80)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(o)
  }

  let m: RegExpExecArray | null
  INFO_RE.lastIndex = 0
  while ((m = INFO_RE.exec(message)) !== null) {
    const codeNum = Number(m[1])
    if (!Number.isNaN(codeNum) && codeNum > 0 && codeNum < 4000) continue
    add({
      code: m[1],
      message: `Código ${m[1]} en ${m[2]}`,
      node: m[2],
      value: m[3],
    })
  }

  const parts = message.split(/\s*—\s*/)
  for (const part of parts) {
    const trimmed = part.trim()
    const seg = trimmed.match(OBS_SEGMENT_RE)
    if (!seg) continue
    const code = seg[1]
    if (code === '0') continue
    const codeNum = Number(code)
    if (codeNum < 4000) continue
    let msg = seg[2].trim()
    const infoIdx = msg.indexOf(' - INFO:')
    if (infoIdx >= 0) msg = msg.slice(0, infoIdx).trim()
    const existing = out.find((x) => x.code === code)
    if (existing) {
      if (!existing.message && msg) existing.message = msg
      continue
    }
    add({ code, message: msg || `Observación SUNAT ${code}` })
  }

  return out.sort((a, b) => a.code.localeCompare(b.code))
}

export function extractSunatErrorsFromMessage(message: string, cdrCode: string | null): SunatObservation[] {
  const out: SunatObservation[] = []
  const seen = new Set<string>()
  const add = (o: SunatObservation) => {
    const codeNum = Number(o.code)
    if (Number.isNaN(codeNum) || codeNum <= 0 || codeNum >= 4000) return
    const key = `${o.code}|${o.node ?? ''}|${o.message.slice(0, 80)}`
    if (seen.has(key)) return
    seen.add(key)
    out.push(o)
  }

  let m: RegExpExecArray | null
  INFO_RE.lastIndex = 0
  while ((m = INFO_RE.exec(message)) !== null) {
    add({
      code: m[1],
      message: `Código ${m[1]} en ${m[2]}`,
      node: m[2],
      value: m[3],
    })
  }

  if (cdrCode && cdrCode !== '0') {
    const n = Number(cdrCode)
    if (!Number.isNaN(n) && n > 0 && n < 4000) {
      add({
        code: cdrCode,
        message: `Error SUNAT ${cdrCode}`,
      })
    }
  }

  return out.sort((a, b) => a.code.localeCompare(b.code))
}

export function inferSunatOutcome(
  billingStatus: string | undefined,
  cdrCode: string | null,
  observations: SunatObservation[],
  rawMessage: string | null,
): SunatFiscalOutcome {
  const bs = String(billingStatus ?? '').toLowerCase()
  if (bs === 'rejected') return 'rejected'
  if (bs === 'error') return 'error'
  if (bs === 'pending' || bs === 'sent') return 'pending'
  if (bs === 'observed') return 'observed'
  if (observations.length > 0) return 'observed'
  const msg = (rawMessage ?? '').toLowerCase()
  if (msg.includes('observ') || /\b4\d{3}\b/.test(rawMessage ?? '')) {
    if (msg.includes('aceptad') || cdrCode === '0') return 'observed'
  }
  if (bs === 'accepted' || cdrCode === '0') return 'accepted'
  if (cdrCode && cdrCode !== '0') {
    const n = Number(cdrCode)
    if (!Number.isNaN(n) && n >= 4000) return 'observed'
    return 'rejected'
  }
  return 'unknown'
}

export function buildSunatFiscalDetailView(
  invoice: SunatFiscalInvoiceInput | null | undefined,
  billingStatus?: string,
): SunatFiscalDetailView | null {
  if (!invoice) return null
  const rawMessage = (invoice.sunat_message ?? invoice.sunat_response ?? '').trim() || null
  const cdrCode = invoice.sunat_cdr_code?.trim() || null
  const cdrNotes = parseCdrNotesJson(invoice.sunat_cdr_notes)
  const observations = [
    ...extractObservationsFromMessage(rawMessage ?? ''),
    ...cdrNotes
      .filter((n) => /^\d{4}/.test(n) || n.toLowerCase().includes('info:'))
      .map((n) => {
        const seg = n.match(OBS_SEGMENT_RE)
        if (seg) return { code: seg[1], message: seg[2].trim() }
        return { code: '—', message: n }
      }),
  ]
  const deduped: SunatObservation[] = []
  const seen = new Set<string>()
  for (const o of observations) {
    const k = `${o.code}|${o.message}`
    if (seen.has(k)) continue
    seen.add(k)
    deduped.push(o)
  }

  let summary: string | null = null
  if (rawMessage) {
    const parts = rawMessage.split(/\s*—\s*/)
    summary = parts[0]?.trim() || rawMessage
  }

  const outcome = inferSunatOutcome(billingStatus, cdrCode, deduped, rawMessage)
  const rejectionErrors = outcome === 'rejected' ? extractSunatErrorsFromMessage(rawMessage ?? '', cdrCode) : []

  return {
    outcome,
    cdrCode,
    summary,
    observations: deduped,
    rejectionErrors,
    cdrNotes: cdrNotes.filter((n) => !deduped.some((o) => o.message.includes(n))),
    rawMessage,
    pipelineStatus: invoice.pipeline_status?.trim() || null,
  }
}

export const SUNAT_OUTCOME_LABELS: Record<SunatFiscalOutcome, string> = {
  accepted: 'Aceptado por SUNAT',
  observed: 'Aceptado con observaciones',
  rejected: 'Rechazado por SUNAT',
  pending: 'Pendiente de respuesta',
  error: 'Error de envío',
  unknown: 'Estado SUNAT',
}

export const SUNAT_REJECTED_HELP =
  'SUNAT rechazó el comprobante: no tiene validez tributaria. Debe corregir los datos indicados y emitir una nueva guía con el siguiente correlativo (no reutilice el mismo número rechazado).'

export const SUNAT_OBSERVED_HELP =
  'SUNAT aceptó el comprobante y el CDR es válido: el documento queda emitido y puede usarse (impresión, entrega al cliente, contabilidad). Las observaciones (códigos 4000 en adelante) son advertencias sobre el XML; no anulan el comprobante ni exigen baja. Conviene corregir el sistema para futuras emisiones; no es obligatorio reemitir este mismo número salvo que su asesor lo indique.'
