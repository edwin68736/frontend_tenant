import RequireModule from '@/components/ui/RequireModule'
import InventoryDocumentPage from '@/pages/inventory/InventoryDocumentPage'

export default function InventoryEgressPage() {
  return (
    <RequireModule moduleKey="inventory">
      <InventoryDocumentPage direction="OUT" />
    </RequireModule>
  )
}
