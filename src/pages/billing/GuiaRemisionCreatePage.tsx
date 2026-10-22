import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DespatchForm } from '@/components/billing/despatch/DespatchForm'
import { filterAllGuiaSeries, type GuiaSunatCode, type GuiaSeriesRow } from '@/utils/despatchSeries'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'

/** Segmento de ruta (remitente/transportista) → código SUNAT; sin segmento se pregunta qué guía necesita. */
function guiaSunatCodeFromParam(guiaTipo: string | undefined): GuiaSunatCode | undefined {
  if (guiaTipo === 'transportista') return '31'
  if (guiaTipo === 'remitente') return '09'
  return undefined
}

function GuiaRemisionCreateContent() {
  const navigate = useNavigate()
  const { guiaTipo } = useParams<{ guiaTipo: string }>()
  const initialKind = guiaSunatCodeFromParam(guiaTipo)
  const listPathFor = (code: GuiaSunatCode) => `/billing/docs/despatches/${code === '31' ? 'transportista' : 'remitente'}`

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
  return (
    <DespatchForm
      layout="page"
      initialKind={initialKind}
      title="Nueva guía de remisión"
      onClose={() => navigate(listPathFor(initialKind ?? '09'))}
      onCreated={(_, kind) => navigate(listPathFor(kind))}
      series={series}
      branches={branches}
      mainBranchId={mainBranchId}
    />
  )
}

export default function GuiaRemisionCreatePage() {
  return (
    <RequireModule moduleKey="despatch">
      <GuiaRemisionCreateContent />
    </RequireModule>
  )
}
