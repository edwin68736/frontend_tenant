import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { billingService, type SunatDespatch } from '@/services/billing.service'
import { GuiasListSection } from '@/components/billing/GuiasListSection'
import { companyService } from '@/services/company.service'
import RequireModule from '@/components/ui/RequireModule'
import SunatRequiredMessage from '@/components/ui/SunatRequiredMessage'
import { useBillingEvents } from '@/hooks/useBillingEvents'
import type { GuiaSunatCode } from '@/utils/despatchSeries'

/** Segmento de ruta (remitente/transportista) → código SUNAT de la guía. */
function guiaSunatCodeFromParam(guiaTipo: string | undefined): GuiaSunatCode {
  return guiaTipo === 'transportista' ? '31' : '09'
}

export default function GuiaListPage() {
  return (
    <RequireModule moduleKey="billing">
      <GuiaListContent />
    </RequireModule>
  )
}

function GuiaListContent() {
  const { guiaTipo } = useParams<{ guiaTipo: string }>()
  const guiaSunatCode = guiaSunatCodeFromParam(guiaTipo)
  const [sunatEnabled, setSunatEnabled] = useState<boolean | null>(null)
  const [despatches, setDespatches] = useState<SunatDespatch[]>([])
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState<number | null>(null)
  const despatchesRef = useRef(despatches)
  despatchesRef.current = despatches

  const loadDespatches = () => {
    setLoading(true)
    billingService.listDespatches()
      .then(({ despatches: list }) => setDespatches(list ?? []))
      .catch(() => toast.error('Error al cargar guías'))
      .finally(() => setLoading(false))
  }

  useBillingEvents(
    (evt) => {
      const d = despatchesRef.current.find((x) => x.sale_id === evt.sale_id)
      if (!d) return
      billingService.getDespatchStatus(d.id)
        .then((updated) => setDespatches((prev) => prev.map((x) => (x.id === updated.id ? updated : x))))
        .catch(() => {})
    },
    sunatEnabled === true,
  )

  useEffect(() => {
    companyService.getSunat().then(d => setSunatEnabled(d.sunat_enabled ?? false)).catch(() => setSunatEnabled(false))
  }, [])

  useEffect(() => {
    if (sunatEnabled !== true) return
    loadDespatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sunatEnabled])

  if (sunatEnabled === null) return <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" /></div>
  if (!sunatEnabled) return <SunatRequiredMessage />

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">
          {guiaSunatCode === '31' ? 'Guías de remisión — Transportista' : 'Guías de remisión — Remitente'}
        </h2>
        <p className="text-sm text-gray-500">
          {guiaSunatCode === '31'
            ? 'Su empresa transporta mercadería de terceros (GRE 31).'
            : 'Traslado de su propia mercadería, con transporte propio o contratado (GRE 09).'}
        </p>
      </div>
      <GuiasListSection
        guiaSunatCode={guiaSunatCode}
        list={despatches}
        loading={loading}
        onRefresh={loadDespatches}
        statusLoading={statusLoading}
        setStatusLoading={setStatusLoading}
        onStatusUpdated={(d) => setDespatches(prev => prev.map(x => x.id === d.id ? d : x))}
      />
    </div>
  )
}
