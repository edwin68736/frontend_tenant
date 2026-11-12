import { useState } from 'react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { EXPORT_COUNTRIES } from '@/constants/countries'
import { SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE } from '@/constants/sunat'
import { EXPORT_MAX_STAY_DAYS, guestFromContact, stayDays, type ExportContact, type ExportFormState } from '@/utils/exportService'

type Props = {
  operationCode: string
  value: ExportFormState
  onChange: (next: ExportFormState) => void
  /** Cliente de la venta: en el hospedaje es el huésped. */
  contact?: ExportContact | null
}

const INPUT = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white'
const LABEL = 'block text-xs font-medium text-gray-600 mb-1'
const COUNTRY_OPTIONS = EXPORT_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))

/**
 * Datos que pide cada exportación, lo mínimo posible. Servicio a un cliente del exterior = un solo dato (país donde se usa). Hospedaje: el
 * huésped es el cliente elegido (nombre y documento salen de él), así que solo se piden el país del pasaporte y las fechas de la estadía.
 * El IGV queda en 0 sin que el cajero toque nada.
 */
export function ExportServiceFields({ operationCode, value, onChange, contact }: Props) {
  const set = (patch: Partial<ExportFormState>) => onChange({ ...value, ...patch })
  const [otherResidence, setOtherResidence] = useState(false)

  if (operationCode !== SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-2">
        <p className="text-xs text-sky-900">Exportación: sin IGV. Solo falta indicar dónde se usa el servicio.</p>
        <div className="max-w-sm">
          <label className={LABEL}>País donde se usa el servicio *</label>
          <SearchSelect options={COUNTRY_OPTIONS} value={value.country_use} onChange={(v) => set({ country_use: v })} placeholder="Seleccione el país" />
        </div>
      </div>
    )
  }

  const guest = guestFromContact(contact)
  const days = stayDays(value.check_in, value.check_out)
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-3">
      <p className="text-xs text-sky-900">
        Hospedaje a extranjero: sin IGV si es no domiciliado y su estadía no pasa de {EXPORT_MAX_STAY_DAYS} días desde que entró al país. Guarde copia de su
        pasaporte.
      </p>
      {guest ? (
        <p className="text-sm text-gray-800">
          Huésped: <strong>{guest.name}</strong> · {guest.docType === '4' ? 'Carné de extranjería' : 'Pasaporte'} {guest.docNumber}
        </p>
      ) : (
        <p className="text-xs rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-amber-900">
          El huésped es el cliente: elíjalo arriba, o créelo con «Nuevo cliente» usando su pasaporte o carné de extranjería (no sirve «Clientes varios»).
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>País del pasaporte *</label>
          <SearchSelect options={COUNTRY_OPTIONS} value={value.passport_country} onChange={(v) => set({ passport_country: v })} placeholder="Seleccione el país" />
          {!otherResidence ? (
            <button type="button" onClick={() => setOtherResidence(true)} className="mt-1 text-xs text-[rgb(var(--p600))] hover:underline">
              Reside en otro país
            </button>
          ) : (
            <div className="mt-2">
              <label className={LABEL}>País de residencia</label>
              <SearchSelect
                options={COUNTRY_OPTIONS}
                value={value.residence_country}
                onChange={(v) => set({ residence_country: v })}
                placeholder="Igual al del pasaporte"
              />
              <button
                type="button"
                onClick={() => {
                  setOtherResidence(false)
                  set({ residence_country: '' })
                }}
                className="mt-1 text-xs text-gray-500 hover:underline"
              >
                Es el mismo del pasaporte
              </button>
            </div>
          )}
        </div>
        <div>
          <label className={LABEL}>Ingresó al Perú el * (sello de migraciones)</label>
          <input type="date" className={INPUT} value={value.entry_date} onChange={(e) => set({ entry_date: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Entra al hotel *</label>
          <input type="date" className={INPUT} value={value.check_in} onChange={(e) => set({ check_in: e.target.value })} />
        </div>
        <div>
          <label className={LABEL}>Sale del hotel *</label>
          <input type="date" className={INPUT} value={value.check_out} onChange={(e) => set({ check_out: e.target.value })} />
        </div>
      </div>
      {days !== null && <p className="text-xs text-gray-600">Estadía: {days} día(s)</p>}
    </div>
  )
}
