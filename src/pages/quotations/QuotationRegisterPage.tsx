import { useParams } from 'react-router-dom'
import SalesRegisterPage from '@/pages/sales/SalesRegisterPage'

export default function QuotationRegisterPage() {
  const { id } = useParams()
  const quotationId = id ? Number(id) : undefined
  return <SalesRegisterPage mode="quotation" quotationId={Number.isFinite(quotationId) ? quotationId : undefined} />
}
