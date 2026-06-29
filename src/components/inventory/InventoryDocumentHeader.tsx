import type { InventoryDocumentDirection, InventoryOperationType } from '@/services/inventory.service'
import { getTodayPeru } from '@/utils/datesPeru'

export interface InventoryDocumentHeaderValues {
  branch_id: number
  document_date: string
  operation_type_id: number
  reference: string
  movement_reason: string
  notes: string
}

interface Branch {
  id: number
  name: string
}

interface Props {
  direction: InventoryDocumentDirection
  branches: Branch[]
  operationTypes: InventoryOperationType[]
  values: InventoryDocumentHeaderValues
  onChange: (patch: Partial<InventoryDocumentHeaderValues>) => void
  disabled?: boolean
  branchDisabled?: boolean
}

export function InventoryDocumentHeader({
  direction,
  branches,
  operationTypes,
  values,
  onChange,
  disabled = false,
  branchDisabled = false,
}: Props) {
  const selectedOp = operationTypes.find(o => o.id === values.operation_type_id)
  const referenceRequired = selectedOp?.requires_document ?? false

  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">
        Cabecera — {direction === 'IN' ? 'Ingreso' : 'Egreso'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sucursal</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            value={values.branch_id || ''}
            onChange={e => onChange({ branch_id: Number(e.target.value) })}
            disabled={disabled || branchDisabled}
          >
            <option value="">Seleccione</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
          <input
            type="date"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            value={values.document_date || getTodayPeru()}
            onChange={e => onChange({ document_date: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de operación</label>
          <select
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            value={values.operation_type_id || ''}
            onChange={e => onChange({ operation_type_id: Number(e.target.value) })}
            disabled={disabled}
          >
            <option value="">Seleccione</option>
            {operationTypes.map(o => (
              <option key={o.id} value={o.id}>
                {o.sunat_code} — {o.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Referencia{referenceRequired ? ' *' : ''}
          </label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            placeholder="N° documento soporte"
            value={values.reference}
            onChange={e => onChange({ reference: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Motivo</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            placeholder="Motivo del movimiento"
            value={values.movement_reason}
            onChange={e => onChange({ movement_reason: e.target.value })}
            disabled={disabled}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Observaciones</label>
          <input
            type="text"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:bg-gray-50"
            placeholder="Notas adicionales"
            value={values.notes}
            onChange={e => onChange({ notes: e.target.value })}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}

export function isHeaderUxValid(
  values: InventoryDocumentHeaderValues,
  operationTypes: InventoryOperationType[]
): boolean {
  if (!values.branch_id || !values.operation_type_id || !values.document_date) return false
  const op = operationTypes.find(o => o.id === values.operation_type_id)
  if (op?.requires_document && !values.reference.trim()) return false
  return true
}
