import { useState } from 'react'
import { Building2, Plus, Truck, UserRound } from 'lucide-react'
import { SearchableSelect } from '@/components/SearchableSelect'
import { QuickCarrierCreateModal } from '@/components/billing/QuickCarrierCreateModal'
import { QuickDriverCreateModal } from '@/components/billing/QuickDriverCreateModal'
import { QuickVehicleCreateModal } from '@/components/billing/QuickVehicleCreateModal'
import type { GreCarrier, GreDriver, GreVehicle } from '@/services/fleet.service'
import type { DespatchDraft, FleetCatalog } from './despatchModel'
import { ChoiceCard } from './ui'

/**
 * «¿Quién transporta?». Yo mismo (una sola tarjeta de conductor y vehículo) o una empresa de
 * transporte (un solo selector, sin datos de conductor). La guía transportista solo tiene la
 * primera opción.
 */
export function TransportPicker({
  draft,
  fleet,
  onPatch,
  onFleetChange,
  allowCompany,
  hideVehicle,
}: {
  draft: DespatchDraft
  fleet: FleetCatalog
  onPatch: (p: Partial<DespatchDraft>) => void
  onFleetChange: (f: Partial<FleetCatalog>) => void
  allowCompany: boolean
  /** Vehículo M1/L: no lleva conductor ni placa. */
  hideVehicle?: boolean
}) {
  const [quick, setQuick] = useState<'carrier' | 'driver' | 'vehicle' | null>(null)
  const driver = fleet.drivers.find((d) => d.id === draft.driverId)
  const vehicle = fleet.vehicles.find((v) => v.id === draft.vehicleId)
  const carrier = fleet.carriers.find((c) => c.id === draft.carrierId)
  const propio = !allowCompany || draft.transporte === 'propio'

  return (
    <div className="space-y-4">
      {allowCompany && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ChoiceCard
            selected={draft.transporte === 'propio'}
            onClick={() => onPatch({ transporte: 'propio' })}
            icon={<Truck size={15} />}
            title="Yo mismo"
            hint="Con mi conductor y mi vehículo"
          />
          <ChoiceCard
            selected={draft.transporte === 'empresa'}
            onClick={() => onPatch({ transporte: 'empresa' })}
            icon={<Building2 size={15} />}
            title="Una empresa de transporte"
            hint="Ellos ponen conductor y vehículo"
          />
        </div>
      )}

      {propio && hideVehicle && (
        <p className="text-xs text-gray-600 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2.5">
          Vehículo M1/L: SUNAT no pide conductor ni placa en este caso.
        </p>
      )}

      {propio && !hideVehicle && (
        <div className="rounded-xl border border-gray-200 p-3.5 space-y-3">
          <div>
            <span className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
              <span className="inline-flex items-center gap-1.5">
                <UserRound size={13} /> Conductor
              </span>
              <button type="button" onClick={() => setQuick('driver')} className="inline-flex items-center gap-1 text-[rgb(var(--p700))] hover:underline">
                <Plus size={12} /> Nuevo
              </button>
            </span>
            <SearchableSelect
              value={draft.driverId === '' ? null : draft.driverId}
              onChange={(v) => onPatch({ driverId: v === null ? '' : Number(v) })}
              options={fleet.drivers.map((d) => ({ value: d.id, label: `${d.full_name} · ${d.doc_number}` }))}
              placeholder="Elige el conductor"
              onCreateNew={() => setQuick('driver')}
            />
            {driver && (
              <p className="text-[11px] text-gray-500 mt-1">
                {driver.license_number ? `Licencia ${driver.license_number}` : 'Sin licencia registrada'}
              </p>
            )}
          </div>
          <div>
            <span className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
              <span className="inline-flex items-center gap-1.5">
                <Truck size={13} /> Vehículo
              </span>
              <button type="button" onClick={() => setQuick('vehicle')} className="inline-flex items-center gap-1 text-[rgb(var(--p700))] hover:underline">
                <Plus size={12} /> Nuevo
              </button>
            </span>
            <SearchableSelect
              value={draft.vehicleId === '' ? null : draft.vehicleId}
              onChange={(v) => onPatch({ vehicleId: v === null ? '' : Number(v) })}
              options={fleet.vehicles.map((v) => ({ value: v.id, label: [v.plate, v.brand, v.model].filter(Boolean).join(' · ') }))}
              placeholder="Elige el vehículo"
              onCreateNew={() => setQuick('vehicle')}
            />
            {vehicle?.habilitation_cert && <p className="text-[11px] text-gray-500 mt-1">Certificado de habilitación {vehicle.habilitation_cert}</p>}
          </div>
        </div>
      )}

      {!propio && (
        <div className="rounded-xl border border-gray-200 p-3.5">
          <span className="flex items-center justify-between text-xs font-medium text-gray-600 mb-1">
            <span className="inline-flex items-center gap-1.5">
              <Building2 size={13} /> Empresa de transporte
            </span>
            <button type="button" onClick={() => setQuick('carrier')} className="inline-flex items-center gap-1 text-[rgb(var(--p700))] hover:underline">
              <Plus size={12} /> Nueva
            </button>
          </span>
          <SearchableSelect
            value={draft.carrierId === '' ? null : draft.carrierId}
            onChange={(v) => onPatch({ carrierId: v === null ? '' : Number(v) })}
            options={fleet.carriers.map((c) => ({ value: c.id, label: `${c.business_name} · ${c.doc_number}` }))}
            placeholder="Elige la empresa de transporte"
            onCreateNew={() => setQuick('carrier')}
          />
          {carrier?.mtc_number && <p className="text-[11px] text-gray-500 mt-1">Registro MTC {carrier.mtc_number}</p>}
        </div>
      )}

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
    </div>
  )
}
