import { useState } from 'react'
import { ChevronDown, Plus, Trash2 } from 'lucide-react'
import { emptyRelatedDoc, type DespatchDraft, type RelatedDocDraft } from './despatchModel'
import { Field, inputCls } from './ui'

const DOC_TYPES = [
  { value: '09', label: 'Guía de remisión remitente' },
  { value: '01', label: 'Factura' },
  { value: '03', label: 'Boleta' },
]

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm text-gray-800">{label}</span>
        {hint && <span className="block text-[11px] text-gray-500">{hint}</span>}
      </span>
    </label>
  )
}

/** Opciones poco frecuentes, plegadas para no estorbar en el caso normal. */
export function MoreOptions({
  draft,
  onPatch,
  /** Hay conductor y vehículo propios que declarar (no aplica con empresa de transporte). */
  ownTransport,
  companyRuc,
}: {
  draft: DespatchDraft
  onPatch: (p: Partial<DespatchDraft>) => void
  ownTransport: boolean
  companyRuc: string
}) {
  const setRow = (i: number, p: Partial<RelatedDocDraft>) => onPatch({ docsRel: draft.docsRel.map((x, j) => (j === i ? { ...x, ...p } : x)) })
  const [open, setOpen] = useState(false)
  const remitente = draft.kind === '09'
  const activeCount =
    [draft.m1l, draft.retornoEnvases, draft.retornoVacio, draft.transbordo, draft.pagaFleteRemitente].filter(Boolean).length +
    (draft.chofer2.doc || draft.vehiculo2 ? 1 : 0) +
    draft.docsRel.filter((d) => !d.primary && d.numero).length +
    (draft.observacion ? 1 : 0)

  return (
    <section className="border-t border-gray-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between py-1.5 text-left"
      >
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Opciones adicionales
          <span className="ml-2 text-xs font-normal text-gray-500">
            {activeCount > 0 ? `${activeCount} activada${activeCount > 1 ? 's' : ''}` : 'Solo si las necesitas'}
          </span>
        </span>
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-5 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {remitente && (
              <Check
                checked={draft.m1l}
                onChange={(v) => onPatch({ m1l: v })}
                label="Traslado en vehículo M1 o L"
                hint="Autos, camionetas o motos: no se declara conductor ni placa"
              />
            )}
            {!remitente && (
              <Check
                checked={draft.pagaFleteRemitente}
                onChange={(v) => onPatch({ pagaFleteRemitente: v })}
                label="El remitente paga el flete"
                hint="Si lo paga un subcontratador o un tercero, emite la guía desde el facturador anterior"
              />
            )}
            <Check checked={draft.retornoEnvases} onChange={(v) => onPatch({ retornoEnvases: v })} label="Retorno de envases o embalajes vacíos" />
            <Check checked={draft.retornoVacio} onChange={(v) => onPatch({ retornoVacio: v })} label="Retorno del vehículo vacío" />
            <Check checked={draft.transbordo} onChange={(v) => onPatch({ transbordo: v })} label="Hay transbordo programado" />
          </div>

          {ownTransport && !draft.m1l && (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-600">Segundo conductor y vehículo secundario (opcional)</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Field label="DNI del segundo conductor">
                  <input className={inputCls} value={draft.chofer2.doc} onChange={(e) => onPatch({ chofer2: { ...draft.chofer2, doc: e.target.value } })} />
                </Field>
                <Field label="Licencia">
                  <input className={inputCls} value={draft.chofer2.licencia} onChange={(e) => onPatch({ chofer2: { ...draft.chofer2, licencia: e.target.value } })} />
                </Field>
                <Field label="Nombre">
                  <input className={inputCls} value={draft.chofer2.nombres} onChange={(e) => onPatch({ chofer2: { ...draft.chofer2, nombres: e.target.value } })} />
                </Field>
                <Field label="Placa del semirremolque">
                  <input className={inputCls} value={draft.vehiculo2} onChange={(e) => onPatch({ vehiculo2: e.target.value })} />
                </Field>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-600">Documentos relacionados</p>
            {draft.docsRel.map((d, i) =>
              d.primary ? null : (
                <div key={i} className="grid grid-cols-2 lg:grid-cols-12 gap-2 items-end">
                  <div className="col-span-2 lg:col-span-4">
                    <label className="block text-[11px] text-gray-500 mb-0.5">Tipo</label>
                    <select className={inputCls} value={d.tipo} onChange={(e) => setRow(i, { tipo: e.target.value })}>
                      {DOC_TYPES.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 lg:col-span-3">
                    <label className="block text-[11px] text-gray-500 mb-0.5">RUC del emisor</label>
                    <input className={inputCls} inputMode="numeric" maxLength={11} placeholder="11 dígitos" value={d.ruc} onChange={(e) => setRow(i, { ruc: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-0.5">Serie</label>
                    <input className={inputCls} maxLength={4} placeholder="T001" value={d.serie} onChange={(e) => setRow(i, { serie: e.target.value.toUpperCase() })} />
                  </div>
                  <div className="lg:col-span-2">
                    <label className="block text-[11px] text-gray-500 mb-0.5">Número</label>
                    <input className={inputCls} inputMode="numeric" maxLength={8} placeholder="123" value={d.numero} onChange={(e) => setRow(i, { numero: e.target.value.replace(/\D/g, '') })} />
                  </div>
                  <div className="lg:col-span-1">
                    <button type="button" aria-label="Quitar" className="p-2 text-gray-400 hover:text-red-600" onClick={() => onPatch({ docsRel: draft.docsRel.filter((_, j) => j !== i) })}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ),
            )}
            <button
              type="button"
              onClick={() => onPatch({ docsRel: [...draft.docsRel, emptyRelatedDoc(remitente ? '01' : '09', remitente ? companyRuc : '')] })}
              className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--p700))] hover:underline"
            >
              <Plus size={13} /> Agregar documento
            </button>
          </div>

          <Field label="Observaciones" hint={`${draft.observacion.length}/250`}>
            <textarea
              rows={2}
              maxLength={250}
              className={inputCls}
              value={draft.observacion}
              onChange={(e) => onPatch({ observacion: e.target.value })}
              placeholder="Indicaciones para el transportista o el destinatario"
            />
          </Field>
        </div>
      )}
    </section>
  )
}
