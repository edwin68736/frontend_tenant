import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Utensils, Layers, ChefHat, UserCog, Grid3x3, Lock, ArrowLeft, CreditCard } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import RestaurantTablesPage from '@/pages/restaurant/RestaurantTablesPage'
import RestaurantFloorsPage from '@/pages/restaurant/RestaurantFloorsPage'
import RestaurantProductsPage from '@/pages/restaurant/RestaurantProductsPage'
import RestaurantSettingsPage from '@/pages/restaurant/RestaurantSettingsPage'

export default function ModulesPage() {
  const navigate = useNavigate()
  const { hasModule } = useAuth()
  const restaurantEnabled = hasModule('restaurant')
  const membershipsEnabled = hasModule('memberships')
  const [activeModule, setActiveModule] = useState<'restaurant' | null>(null)
  const [restaurantSection, setRestaurantSection] = useState<'tables' | 'floors' | 'products' | 'settings'>('tables')

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Módulos</h2>
        <p className="text-sm text-gray-500">
          Activa y accede a los módulos de tu sistema desde un solo lugar.
        </p>
      </div>

      {!activeModule && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {/* Membresías / cuotas */}
          <button
            type="button"
            onClick={() => membershipsEnabled && navigate('/memberships')}
            className={`bg-white rounded-2xl border p-5 flex flex-col gap-3 shadow-sm text-left transition
              ${membershipsEnabled ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer border-gray-100' : 'opacity-70 cursor-not-allowed border-dashed border-gray-200'}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                <CreditCard size={20} className="text-emerald-700" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 text-sm">Membresías y cuotas</h3>
                  {!membershipsEnabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                      <Lock size={10} /> No habilitado
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Mensualidades, matrículas y cobros recurrentes a tus clientes; genera ventas para SUNAT.
                </p>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">
              {membershipsEnabled ? 'Ir al listado de membresías.' : 'Solicita al administrador la activación de este módulo.'}
            </p>
          </button>

          {/* Módulo Restaurante */}
          <button
            type="button"
            onClick={() => restaurantEnabled && setActiveModule('restaurant')}
            className={`bg-white rounded-2xl border p-5 flex flex-col gap-3 shadow-sm text-left transition
              ${restaurantEnabled ? 'hover:shadow-md hover:-translate-y-0.5 cursor-pointer border-gray-100' : 'opacity-70 cursor-not-allowed border-dashed border-gray-200'}`}
          >
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-[rgb(var(--p50))] flex items-center justify-center flex-shrink-0">
                <Utensils size={20} className="text-[rgb(var(--p600))]" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-gray-800 text-sm">Restaurante</h3>
                  {!restaurantEnabled && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500">
                      <Lock size={10} /> No habilitado
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Gestión de mesas, pisos, carta y mozos para tu restaurante.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mt-1">
              {restaurantEnabled
                ? 'Haz clic para ver las opciones de gestión.'
                : 'Solicita al administrador la activación de este módulo.'}
            </p>
          </button>
        </div>
      )}

      {/* Panel de opciones del módulo activo */}
      {activeModule === 'restaurant' && restaurantEnabled && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Restaurante · opciones</h3>
              <p className="text-xs text-gray-500">
                Navega entre las diferentes áreas del módulo sin salir de esta vista.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveModule(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <ArrowLeft size={12} />
              <span>Volver a módulos</span>
            </button>
          </div>

          <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2">
            <ModuleTab
              active={restaurantSection === 'tables'}
              onClick={() => setRestaurantSection('tables')}
              icon={<Utensils size={13} />}
            >
              Mesas
            </ModuleTab>
            <ModuleTab
              active={restaurantSection === 'floors'}
              onClick={() => setRestaurantSection('floors')}
              icon={<Layers size={13} />}
            >
              Pisos / salones
            </ModuleTab>
            <ModuleTab
              active={restaurantSection === 'products'}
              onClick={() => setRestaurantSection('products')}
              icon={<ChefHat size={13} />}
            >
              Carta
            </ModuleTab>
            <ModuleTab
              active={restaurantSection === 'settings'}
              onClick={() => setRestaurantSection('settings')}
              icon={<Grid3x3 size={13} />}
            >
              Ajustes
            </ModuleTab>
          </div>

          <div className="p-4 md:p-5">
            {restaurantSection === 'tables' && <RestaurantTablesPage />}
            {restaurantSection === 'floors' && <RestaurantFloorsPage />}
            {restaurantSection === 'products' && <RestaurantProductsPage />}
            {restaurantSection === 'settings' && <RestaurantSettingsPage />}
          </div>
        </div>
      )}
    </div>
  )
}

function ModuleTab({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-[rgb(var(--p600))] border-[rgb(var(--p600))] text-white'
          : 'bg-white border-gray-200 text-gray-600 hover:border-[rgb(var(--p300))] hover:bg-[rgb(var(--p50))]'
      }`}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

