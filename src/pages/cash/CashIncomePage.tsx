import RequireModule from '@/components/ui/RequireModule'
import { CashMovementTypeView } from '@/components/cash/CashMovementTypeView'

export default function CashIncomePage() {
  return (
    <RequireModule moduleKey="cashbank">
      <CashMovementTypeView type="income" />
    </RequireModule>
  )
}
