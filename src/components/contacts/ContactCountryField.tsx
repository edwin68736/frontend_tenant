import { SearchSelect } from '@/components/ui/SearchSelect'
import { EXPORT_COUNTRIES } from '@/constants/countries'

const OPTIONS = EXPORT_COUNTRIES.map((c) => ({ value: c.code, label: c.name }))

/** Solo los documentos de personas del exterior (pasaporte y carné de extranjería) llevan país; con RUC/DNI/otros el cliente es del Perú. */
export function contactDocNeedsCountry(docCode: string): boolean {
  return docCode === '7' || docCode === '4'
}

/** País de un cliente extranjero (opcional; vacío = Perú). Lo usa la exportación de servicios: el hospedaje toma de aquí el país del pasaporte. */
export function ContactCountryField({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">País del cliente (opcional)</label>
      <SearchSelect options={OPTIONS} value={value} onChange={onChange} placeholder="Perú / sin indicar" />
    </div>
  )
}
