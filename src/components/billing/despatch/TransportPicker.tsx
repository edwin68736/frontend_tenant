import { useState } from 'react'
import { Plus } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { QuickCarrierCreateModal } from '@/components/billing/QuickCarrierCreateModal'
import { QuickDriverCreateModal } from '@/components/billing/QuickDriverCreateModal'
import { QuickVehicleCreateModal } from '@/components/billing/QuickVehicleCreateModal'
import type { GreCarrier, GreDriver, GreVehicle } from '@/services/fleet.service'
import type { DespatchDraft, FleetCatalog } from './despatchModel'

const labelRow = 'flex items-center justify-between text-xs font-medium text-gray-600 mb-1'
const newBtn = 'inline-flex items-center gap-1 text-[rgb(var(--p700))] hover:underline font-medium'

/**
 * Campos de transporte según la modalidad (transporte privado: conductor y vehículo; público:
 * transportista). La modalidad se elige en la cabecera, igual que en el facturador anterior.
 */
export function TransportPicker({
  draft,
  fleet,
  onPatch,
  onFleetChange,
  publico,
  hideVehicle,
}: {
  draft: DespatchDraft
  fleet: FleetCatalog
  onPatch: (p: Partial<DespatchDraft>) => void
  onFleetChange: (f: Partial<FleetCatalog>) => void
  publico: boolean
  /** Vehículo M1/L: no lleva conductor ni placa. */
  hideVehicle?: boolean
}) {
  const [quick, setQuick] = useState<'carrier' | 'driver' | 'vehicle' | null>(null)
  const driver = fleet.drivers.find((d) => d.id === draft.driverId)
  const vehicle = fleet.vehicles.find((v) => v.id === draft.vehicleId)
  const carrier = fleet.carriers.find((c) => c.id === draft.carrierId)

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-12 gap-3">
        {!publico && hideVehicle && (
          <p className="col-span-2 lg:col-span-12 text-xs text-gray-600 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5">
            Traslado en vehículo M1 o L: no se declara conductor ni placa.
          </p>
        )}

        {!publico && !hideVehicle && (
          <>
            <div className="col-span-2 lg:col-span-5">
              <span className={labelRow}>
                <span>Conductor *</span>
                <button type="button" onClick={() => setQuick('driver')} className={newBtn}>
                  <Plus size={12} /> Nuevo
                </button>
              </span>
              <SearchableSelect
                value={draft.driverId === '' ? null : draft.driverId}
                onChange={(v) => onPatch({ driverId: v === null ? '' : Number(v) })}
                options={fleet.drivers.map((d) => ({ value: d.id, label: `${d.full_name} · ${d.doc_number}` }))}
                placeholder="Seleccionar conductor"
                onCreateNew={() => setQuick('driver')}
              />
              {driver && <p className="text-[11px] text-gray-500 mt-1">{driver.license_number ? `Licencia ${driver.license_number}` : 'Sin licencia registrada'}</p>}
            </div>
            <div className="col-span-2 lg:col-span-4">
              <span className={labelRow}>
                <span>Vehículo (placa) *</span>
                <button type="button" onClick={() => setQuick('vehicle')} className={newBtn}>
                  <Plus size={12} /> Nuevo
                </button>
              </span>
              <SearchableSelect
                value={draft.vehicleId === '' ? null : draft.vehicleId}
                onChange={(v) => onPatch({ vehicleId: v === null ? '' : Number(v) })}
                options={fleet.vehicles.map((v) => ({ value: v.id, label: [v.plate, v.brand, v.model].filter(Boolean).join(' · ') }))}
                placeholder="Seleccionar vehículo"
                onCreateNew={() => setQuick('vehicle')}
              />
              {vehicle?.habilitation_cert && <p className="text-[11px] text-gray-500 mt-1">Cert. habilitación {vehicle.habilitation_cert}</p>}
            </div>
          </>
        )}

        {publico && (
          <div className="col-span-2 lg:col-span-6">
            <span className={labelRow}>
              <span>Transportista *</span>
              <button type="button" onClick={() => setQuick('carrier')} className={newBtn}>
                <Plus size={12} /> Nuevo
              </button>
            </span>
            <SearchableSelect
              value={draft.carrierId === '' ? null : draft.carrierId}
              onChange={(v) => onPatch({ carrierId: v === null ? '' : Number(v) })}
              options={fleet.carriers.map((c) => ({ value: c.id, label: `${c.business_name} · ${c.doc_number}` }))}
              placeholder="Seleccionar transportista"
              onCreateNew={() => setQuick('carrier')}
            />
            {carrier?.mtc_number && <p className="text-[11px] text-gray-500 mt-1">N° MTC {carrier.mtc_number}</p>}
          </div>
        )}
      </div>

      <QuickCarrierCreateModal
        open={quick === 'carrier'}
        onClose={() => setQuick(null)}
        stacked
        onCreated={(c: GreCarrier) => {
          onFleetChange({ carriers: [...fleet.carriers, c] })
          onPatch({ carrierId: c.id })
        }}
      />
      <QuickDriverCreateModal
        open={quick === 'driver'}
        onClose={() => setQuick(null)}
        stacked
        onCreated={(d: GreDriver) => {
          onFleetChange({ drivers: [...fleet.drivers, d] })
          onPatch({ driverId: d.id })
        }}
      />
      <QuickVehicleCreateModal
        open={quick === 'vehicle'}
        onClose={() => setQuick(null)}
        stacked
        onCreated={(v: GreVehicle) => {
          onFleetChange({ vehicles: [...fleet.vehicles, v] })
          onPatch({ vehicleId: v.id })
        }}
      />
    </>
  )
}
