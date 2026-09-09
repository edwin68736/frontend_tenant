import RequireModule from '@/components/ui/RequireModule'
import { CashMovementTypeView } from '@/components/cash/CashMovementTypeView'

export default function CashExpensePage() {
  return (
    <RequireModule moduleKey="cashbank">
      <CashMovementTypeView type="expense" />
    </RequireModule>
  )
}
