import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { getTodayPeru } from '@/utils/datesPeru'

/** Tope de SUNAT para cbc:Note; el backend valida lo mismo. */
const MAX_OBSERVATION = 250

/**
 * Días de atraso admitidos. El backend es la autoridad (SUNAT_MAX_BACKDATE_DAYS);
 * aquí solo se acota el selector para no ofrecer fechas que serán rechazadas.
 */
const MAX_BACKDATE_DAYS = 3

export interface FiscalReissueTarget {
  id: number
  number: string
  issueDate: string
}

interface Props {
  target: FiscalReissueTarget | null
  submitting: boolean
  onClose: () => void
  onConfirm: (input: { issue_date: string; reason: string; observation?: string }) => void
}

function minAllowedDate(): string {
  const today = new Date(`${getTodayPeru()}T12:00:00`)
  today.setDate(today.getDate() - MAX_BACKDATE_DAYS)
  return today.toISOString().slice(0, 10)
}

/**
 * Corrección fiscal de un comprobante ya emitido: lo reenvía a SUNAT con otra
 * fecha de emisión, conservando su numeración.
 *
 * Está pensado para comprobantes emitidos contra el ambiente de pruebas que
 * después hay que llevar a producción: SUNAT nunca los recibió en el ambiente
 * real, pero el número ya se entregó al cliente. La acción solo está disponible
 * para soporte con acceso maestro y queda auditada.
 */
export function FiscalReissueModal({ target, submitting, onClose, onConfirm }: Props) {
  const [issueDate, setIssueDate] = useState(getTodayPeru())
  const [reason, setReason] = useState('')
  const [observation, setObservation] = useState('')

  // Cada comprobante arranca con el formulario limpio: arrastrar el motivo de una
  // corrección anterior dejaría una auditoría equivocada.
  useEffect(() => {
    if (target) {
      setIssueDate(getTodayPeru())
      setReason('')
      setObservation('')
    }
  }, [target])

  if (!target) return null

  const trimmedReason = reason.trim()
  const observationTooLong = observation.trim().length > MAX_OBSERVATION
  const canSubmit = trimmedReason.length > 0 && issueDate !== '' && !observationTooLong && !submitting

  const submit = () => {
    if (!canSubmit) return
    const trimmedObservation = observation.trim()
    onConfirm({
      issue_date: issueDate,
      reason: trimmedReason,
      ...(trimmedObservation ? { observation: trimmedObservation } : {}),
    })
  }

  return (
    <Modal open onClose={() => !submitting && onClose()} contentClassName="max-w-lg">
      <div className="p-6 space-y-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Corregir y reenviar a SUNAT</h2>
          <p className="text-sm text-gray-500 mt-1">
            Comprobante <strong>{target.number}</strong>
          </p>
        </div>

        <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
          <AlertTriangle className="shrink-0 mt-0.5" size={18} />
          <p>
            Se generará un XML nuevo con la fecha indicada y se enviará a SUNAT
            conservando la numeración. La fecha de emisión del comprobante cambia
            de forma permanente y la acción queda registrada.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nueva fecha de emisión *
          </label>
          <input
            type="date"
            value={issueDate}
            min={minAllowedDate()}
            max={getTodayPeru()}
            disabled={submitting}
            onChange={e => setIssueDate(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))]"
          />
          <p className="text-xs text-gray-500 mt-1">
            Fecha actual del comprobante: {target.issueDate}. SUNAT admite hasta{' '}
            {MAX_BACKDATE_DAYS} día(s) de atraso.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Observación para SUNAT (opcional)
          </label>
          <textarea
            value={observation}
            rows={2}
            disabled={submitting}
            onChange={e => setObservation(e.target.value)}
            placeholder="Texto que viajará en el comprobante electrónico"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))]"
          />
          <p className={`text-xs mt-1 ${observationTooLong ? 'text-red-600' : 'text-gray-500'}`}>
            {observation.trim().length}/{MAX_OBSERVATION} caracteres
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Motivo de la corrección *
          </label>
          <textarea
            value={reason}
            rows={2}
            disabled={submitting}
            onChange={e => setReason(e.target.value)}
            placeholder="Ej. emitido en ambiente de pruebas; se reenvía a producción"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[rgb(var(--p200))]"
          />
          <p className="text-xs text-gray-500 mt-1">
            Queda en la auditoría interna; no se envía a SUNAT.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Enviando...' : 'Corregir y reenviar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
