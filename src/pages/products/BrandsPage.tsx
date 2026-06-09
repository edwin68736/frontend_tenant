import { Award } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'

/** Placeholder hasta que el backend exponga marcas como entidad propia. */
export default function BrandsPage() {
  return (
    <RequireModule moduleKey="products">
      <div className="space-y-4 max-w-xl">
        <div>
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Award size={20} className="text-primary-600" />
            Marcas
          </h2>
          <p className="text-sm text-gray-500">Gestión de marcas del catálogo.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-6 py-10 text-center">
          <Award size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm text-gray-600 font-medium">Próximamente</p>
          <p className="text-xs text-gray-500 mt-1">
            La administración de marcas estará disponible en una próxima actualización del sistema.
          </p>
        </div>
      </div>
    </RequireModule>
  )
}
