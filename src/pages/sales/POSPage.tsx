import PagePlaceholder from '@/components/ui/PagePlaceholder'

export default function POSPage() {
  return (
    <PagePlaceholder
      title="Punto de Venta"
      description="Caja registradora con búsqueda de productos y cobro"
      apiEndpoints={[
        'GET  /api/products',
        'GET  /api/contacts?type=customer',
        'GET  /api/company/series?category=venta',
        'GET  /api/cashbank/sessions/open',
        'POST /api/sales',
        'POST /api/sales/:id/payments',
        'POST /api/billing/send/:saleId',
      ]}
    />
  )
}
