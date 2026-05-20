import PagePlaceholder from '@/components/ui/PagePlaceholder'

export default function CashPage() {
  return (
    <PagePlaceholder
      title="Caja"
      description="Control de sesiones de caja, apertura, cierre y movimientos"
      apiEndpoints={[
        'GET  /api/cashbank/sessions?branch_id=',
        'GET  /api/cashbank/sessions/open?branch_id=',
        'POST /api/cashbank/sessions',
        'POST /api/cashbank/sessions/:id/close',
        'GET  /api/cashbank/sessions/:id/movements',
        'POST /api/cashbank/sessions/:id/movements',
      ]}
    />
  )
}
