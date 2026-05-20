import PagePlaceholder from '@/components/ui/PagePlaceholder'

export default function BankPage() {
  return (
    <PagePlaceholder
      title="Cuentas Bancarias"
      description="Gestión de cuentas bancarias y movimientos"
      apiEndpoints={[
        'GET  /api/cashbank/bank-accounts',
        'POST /api/cashbank/bank-accounts',
        'GET  /api/cashbank/bank-accounts/:id/movements',
        'POST /api/cashbank/bank-accounts/:id/movements',
      ]}
    />
  )
}
