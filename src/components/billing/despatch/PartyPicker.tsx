import { useEffect, useRef, useState } from 'react'
import { Loader2, Search, UserRound, X, SearchCheck } from 'lucide-react'
import { toast } from 'sonner'
import { contactsService, type Contact } from '@/services/contacts.service'
import { consultaService } from '@/services/consulta.service'
import { ubigeoToIds } from '@/services/ubigeo.service'
import { UbigeoSelects } from '@/components/UbigeoSelects'
import { formatTipoDocIdentidadDisplay, toTipoDocIdentidadCode } from '@/constants/sunat'
import { emptyParty, type PartyData } from './despatchModel'
import { Field, inputCls } from './ui'

function contactToParty(c: Contact): PartyData {
  return {
    tipo_doc: toTipoDocIdentidadCode(c.doc_type),
    num_doc: c.doc_number ?? '',
    rzn_social: c.business_name ?? '',
    address: c.address ?? '',
    ubigeo: c.ubigeo ?? '',
  }
}

/**
 * Busca a la otra parte del traslado por RUC, DNI o nombre entre los contactos y, si no está,
 * la consulta en SUNAT/RENIEC. Una vez elegida deja editar la dirección y el distrito ahí mismo
 * (antes obligaba a corregir el contacto en otra pantalla).
 */
export function PartyPicker({
  value,
  onChange,
  contactType,
  companyRuc,
  placeholder = 'Escribe un RUC, DNI o nombre',
  requireAddress,
  addressLabel = 'Dirección',
}: {
  value: PartyData
  onChange: (p: PartyData) => void
  contactType: 'customer' | 'supplier' | ''
  companyRuc: string
  placeholder?: string
  requireAddress?: boolean
  addressLabel?: string
}) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [consulting, setConsulting] = useState(false)
  const [ubi, setUbi] = useState(() => ubigeoToIds(value.ubigeo))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const selected = Boolean(value.num_doc.trim())

  useEffect(() => {
    setUbi(ubigeoToIds(value.ubigeo))
  }, [value.ubigeo])

  useEffect(() => {
    if (selected) return
    if (timer.current) clearTimeout(timer.current)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    timer.current = setTimeout(() => {
      setLoading(true)
      contactsService
        .list(q.trim(), contactType)
        .then((rows) => setResults(Array.isArray(rows) ? rows.slice(0, 8) : []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [q, contactType, selected])

  const digits = q.replace(/\D/g, '')
  const canConsult = (digits.length === 11 || digits.length === 8) && digits === q.trim().replace(/-/g, '')

  const consult = async () => {
    if (!companyRuc) {
      toast.error('Configura primero el RUC de tu empresa')
      return
    }
    setConsulting(true)
    try {
      if (digits.length === 11) {
        const res = await consultaService.ruc(companyRuc, digits)
        if (!res.success || !res.razon_social) {
          toast.error('No encontramos ese RUC en SUNAT')
          return
        }
        onChange({
          tipo_doc: '6',
          num_doc: digits,
          rzn_social: res.razon_social,
          address: res.direccion ?? res.direccion_completa ?? '',
          ubigeo: res.ubigeo ?? '',
        })
      } else {
        const res = await consultaService.dni(companyRuc, digits)
        if (!res.success || !res.nombre_completo) {
          toast.error('No encontramos ese DNI en RENIEC')
          return
        }
        onChange({ tipo_doc: '1', num_doc: digits, rzn_social: res.nombre_completo, address: '', ubigeo: '' })
      }
      setQ('')
    } catch {
      toast.error('No se pudo consultar el documento')
    } finally {
      setConsulting(false)
    }
  }

  if (!selected) {
    return (
      <div className="space-y-2">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputCls} pl-9`}
            value={q}
            placeholder={placeholder}
            onChange={(e) => setQ(e.target.value)}
            aria-label={placeholder}
          />
          {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
        </div>
        {results.length > 0 && (
          <ul className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden bg-white">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center gap-2"
                  onClick={() => {
                    onChange(contactToParty(c))
                    setQ('')
                  }}
                >
                  <UserRound size={14} className="text-gray-400 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm text-gray-900 truncate">{c.business_name}</span>
                    <span className="block text-[11px] text-gray-500">{formatTipoDocIdentidadDisplay(c.doc_type, c.doc_number)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {canConsult && (
          <button
            type="button"
            onClick={() => void consult()}
            disabled={consulting}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[rgb(var(--p700))] hover:underline disabled:opacity-60"
          >
            {consulting ? <Loader2 size={13} className="animate-spin" /> : <SearchCheck size={13} />}
            {digits.length === 11 ? 'Buscar este RUC en SUNAT' : 'Buscar este DNI en RENIEC'}
          </button>
        )}
        {q.trim().length >= 2 && !loading && results.length === 0 && !canConsult && (
          <p className="text-[11px] text-gray-500">Sin coincidencias. Escribe el RUC (11 dígitos) o DNI (8) completo para buscarlo en SUNAT/RENIEC.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5">
        <UserRound size={16} className="text-gray-400 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{value.rzn_social}</p>
          <p className="text-[11px] text-gray-500">{formatTipoDocIdentidadDisplay(value.tipo_doc, value.num_doc)}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(emptyParty())}
          className="text-xs text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
        >
          <X size={13} /> Cambiar
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label={`${addressLabel}${requireAddress ? ' *' : ''}`}>
          <input
            className={inputCls}
            value={value.address}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
            placeholder="Calle, número, urbanización"
          />
        </Field>
        <div>
          <span className="block text-xs font-medium text-gray-600 mb-1">Distrito{requireAddress ? ' *' : ''}</span>
          <UbigeoSelects
            regionId={ubi.regionId}
            provinciaId={ubi.provinciaId}
            distritoId={ubi.distritoId}
            onChange={(r, p, d) => {
              setUbi({ regionId: r, provinciaId: p, distritoId: d })
              onChange({ ...value, ubigeo: d })
            }}
          />
        </div>
      </div>
    </div>
  )
}
