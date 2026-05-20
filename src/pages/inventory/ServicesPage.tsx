import RequireModule from '@/components/ui/RequireModule'
import { ProductsContent } from '@/pages/products/ProductsPage'

/** Catálogo de servicios (type=service, unidad ZZ, sin stock). */
export default function ServicesPage() {
  return (
    <RequireModule moduleKey="products">
      <ProductsContent pageMode="service" />
    </RequireModule>
  )
}
