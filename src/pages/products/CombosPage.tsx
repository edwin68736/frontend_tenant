import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { ProductCombosPanel } from '@/components/products/ProductCombosPanel'
import { productsService, type Category } from '@/services/products.service'
import { useBranch } from '@/contexts/BranchContext'

/**
 * Combos y promociones: productos agrupados a un precio fijo.
 *
 * Vive en su propia ruta y no como pestaña de Productos porque esa página no tiene tabs;
 * el listado del catálogo excluye los combos para que no se vendan como producto suelto.
 */
export default function CombosPage() {
  return (
    <RequireModule moduleKey="products">
      <CombosContent />
    </RequireModule>
  )
}

function CombosContent() {
  const { activeBranchId } = useBranch()
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    productsService
      .listCategories()
      .then(setCategories)
      .catch(() => setCategories([]))
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            to="/products"
            className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-[rgb(var(--p600))]"
          >
            <ArrowLeft size={16} /> Volver a productos
          </Link>
          <h1 className="mt-1 text-xl font-bold text-gray-900">Combos y promociones</h1>
          <p className="text-sm text-gray-500">
            Agrupe productos y véndalos a un precio fijo. El stock se descuenta de cada
            componente que tenga control de inventario.
          </p>
        </div>
      </div>

      <ProductCombosPanel branchId={activeBranchId} categories={categories} />
    </div>
  )
}
