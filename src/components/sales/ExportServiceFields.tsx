import { SearchSelect } from '@/components/ui/SearchSelect'
import { EXPORT_COUNTRIES } from '@/constants/countries'
import { SUNAT_TIPO_OPERACION_EXPORT_HOSPEDAJE } from '@/constants/sunat'
import { EXPORT_MAX_STAY_DAYS, stayDays, type ExportFormState } from '@/utils/exportService'

type Props = {
  operationCode: string
  value: ExportFormState
  onChange: (next: ExportFormState) => void
}

const INPUT = 'w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white'
const LABEL = 'block text-xs font-medium text-gray-600 mb-1'
const COUNTRY_OPTIONS = EXPORT_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))

/**
 * Datos que pide cada exportación, lo mínimo posible: servicio a un cliente del exterior = un solo dato (país donde se usa); hospedaje =
 * el huésped y su estadía. El IGV queda en 0 sin que el cajero toque nada.
 */
export function ExportServiceFields({ operationCode, value, onChange }: Props) {
  const set = (patch: Partial<ExportFormState>) => onChange({ ...value, ...patch })

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

  const days = stayDays(value.check_in, value.check_out)
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3 space-y-3">
      <p className="text-xs text-sky-900">
        Hospedaje a extranjero: sin IGV si es no domiciliado y su estadía no pasa de {EXPORT_MAX_STAY_DAYS} días desde que entró al país. Guarde copia de su
        pasaporte.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={LABEL}>Nombre del huésped *</label>
          <input className={INPUT} value={value.guest_name} onChange={(e) => set({ guest_name: e.target.value })} placeholder="Como figura en el pasaporte" />
        </div>
        <div className="grid grid-cols-[8rem_1fr] gap-2">
          <div>
            <label className={LABEL}>Documento *</label>
            <select className={INPUT} value={value.guest_doc_type} onChange={(e) => set({ guest_doc_type: e.target.value as '7' | '4' })}>
              <option value="7">Pasaporte</option>
              <option value="4">Carné de extranjería</option>
            </select>
          </div>
          <div>
            <label className={LABEL}>Número *</label>
            <input className={INPUT} value={value.guest_doc_number} onChange={(e) => set({ guest_doc_number: e.target.value })} />
          </div>
        </div>
        <div>
          <label className={LABEL}>País que emitió el pasaporte *</label>
          <SearchSelect
            options={COUNTRY_OPTIONS}
            value={value.passport_country}
            onChange={(v) => set({ passport_country: v, residence_country: value.residence_country || v })}
            placeholder="Seleccione el país"
          />
        </div>
        <div>
          <label className={LABEL}>País de residencia *</label>
          <SearchSelect options={COUNTRY_OPTIONS} value={value.residence_country} onChange={(v) => set({ residence_country: v })} placeholder="Seleccione el país" />
        </div>
        <div>
          <label className={LABEL}>Ingresó al Perú el *</label>
          <input type="date" className={INPUT} value={value.entry_date} onChange={(e) => set({ entry_date: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={LABEL}>Entra al hotel *</label>
            <input
              type="date"
              className={INPUT}
              value={value.check_in}
              onChange={(e) => set({ check_in: e.target.value })}
            />
          </div>
          <div>
            <label className={LABEL}>Sale del hotel *</label>
            <input type="date" className={INPUT} value={value.check_out} onChange={(e) => set({ check_out: e.target.value })} />
          </div>
        </div>
      </div>
      {days !== null && <p className="text-xs text-gray-600">Estadía: {days} día(s)</p>}
    </div>
  )
}
