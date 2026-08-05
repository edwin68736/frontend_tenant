import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DespatchFormModal } from '@/components/billing/DespatchFormModal'
import { filterAllGuiaSeries, type GuiaSunatCode, type GuiaSeriesRow } from '@/utils/despatchSeries'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'

/** Segmento de ruta (remitente/transportista) → código SUNAT de la guía. */
function guiaSunatCodeFromParam(guiaTipo: string | undefined): GuiaSunatCode {
  return guiaTipo === 'transportista' ? '31' : '09'
}

function GuiaRemisionCreateContent() {
  const navigate = useNavigate()
  const { guiaTipo } = useParams<{ guiaTipo: string }>()
  const guiaSunatCode = guiaSunatCodeFromParam(guiaTipo)
  const listPath = `/billing/docs/despatches/${guiaSunatCode === '31' ? 'transportista' : 'remitente'}`

  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const [series, setSeries] = useState<GuiaSeriesRow[]>([])
  const [branches, setBranches] = useState<{ id: number; name: string }[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    companyService
      .getSunat()
      .then((d) => setSunatEnabled(d.sunat_enabled ?? false))
      .catch(() => setSunatEnabled(false))
  }, [])

  useEffect(() => {
    if (sunatEnabled !== true) return
    Promise.all([companyService.listSeries({}), companyService.listBranches()])
      .then(([seriesData, branchesData]) => {
        const raw = seriesData as GuiaSeriesRow[] | { data?: GuiaSeriesRow[] }
        const list = Array.isArray(raw) ? raw : (raw?.data ?? [])
        setSeries(filterAllGuiaSeries(list))
        setBranches(Array.isArray(branchesData) ? branchesData : [])
        setReady(true)
      })
      .catch(() => toast.error('Error al cargar series y sucursales'))
  }, [sunatEnabled])

  if (sunatEnabled === null || (sunatEnabled && !ready)) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!sunatEnabled) return <SunatRequiredMessage />

  const mainBranchId = branches.find((b) => b.name === 'Principal')?.id ?? branches[0]?.id ?? 1
  const title =
    guiaSunatCode === '31' ? 'Nueva guía transportista (31)' : 'Nueva guía de remisión (09)'

  return (
    <DespatchFormModal
      layout="page"
      open
      guiaSunatCode={guiaSunatCode}
      title={title}
      onClose={() => navigate(listPath)}
      onCreated={() => navigate(listPath)}
      series={series}
      branches={branches}
      mainBranchId={mainBranchId}
    />
  )
}

export default function GuiaRemisionCreatePage() {
  return (
    <RequireModule moduleKey="billing">
      <GuiaRemisionCreateContent />
    </RequireModule>
  )
}
