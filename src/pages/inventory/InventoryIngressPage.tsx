import RequireModule from '@/components/ui/RequireModule'
import InventoryDocumentPage from '@/pages/inventory/InventoryDocumentPage'

export default function InventoryIngressPage() {
  return (
    <RequireModule moduleKey="inventory">
      <InventoryDocumentPage direction="IN" />
    </RequireModule>
  )
}
