import { useEffect, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { Check, FileText, Save } from 'lucide-react'
import { toast } from 'sonner'
import { companyService, type CompanyConfig } from '@/services/company.service'
import { A4_DESIGNS, DEFAULT_A4_DESIGN, getA4Design } from '@/utils/receiptA4'
import { buildA4SamplePrintData } from '@/utils/receiptA4/sampleData'
import { generateReceiptPngBlob } from '@/utils/receiptPng'

/**
 * Diseño del PDF A4 de comprobantes (factura, boleta, notas, nota de venta y cotización).
 * No afecta tickets de 80/58 mm ni guías de remisión. Cada tarjeta muestra una vista previa generada
 * con el mismo motor del PDF real, con los datos de la empresa y un cliente de ejemplo.
 */
export function A4DesignSettings() {
  const [cfg, setCfg] = useState<CompanyConfig | null>(null)
  const [saved, setSaved] = useState(DEFAULT_A4_DESIGN)
  const [selected, setSelected] = useState(DEFAULT_A4_DESIGN)
  const [previews, setPreviews] = useState<Record<string, string | 'error'>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    let alive = true
    companyService
      .getConfig()
      .then((c) => {
        if (!alive) return
        setCfg(c)
        const slug = getA4Design(c.pdf_a4_design).slug
        setSaved(slug)
        setSelected(slug)
      })
      .catch(() => toast.error('Error cargando la configuración de comprobantes'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Vistas previas: una por diseño, en secuencia (jsPDF es síncrono y pesado en un teléfono).
  useEffect(() => {
    if (!cfg || cfg.pdf_a4_design === undefined) return
    let alive = true
    void (async () => {
      for (const d of A4_DESIGNS) {
        try {
          const blob = await generateReceiptPngBlob(buildA4SamplePrintData(cfg, d.slug), 'a4', 1.1)
          if (!alive) return
          const url = URL.createObjectURL(blob)
          urlsRef.current.push(url)
          setPreviews((p) => ({ ...p, [d.slug]: url }))
        } catch (e) {
          console.error('[A4DesignSettings] vista previa', d.slug, e)
          if (alive) setPreviews((p) => ({ ...p, [d.slug]: 'error' }))
        }
      }
    })()
    return () => {
      alive = false
    }
  }, [cfg])

  useEffect(
    () => () => {
      urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
      urlsRef.current = []
    },
    [],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      await companyService.updateConfig({ pdf_a4_design: selected })
      setSaved(selected)
      toast.success('Diseño del PDF A4 actualizado')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }
  // Backend sin esta función (aún no desplegado): no se ofrece un selector que no podría guardar.
  if (!cfg || cfg.pdf_a4_design === undefined) return null

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-700 flex items-center justify-center">
          <FileText size={18} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-gray-800">Diseño del PDF A4</h3>
          <p className="text-sm text-gray-500">
            Elija cómo se ven sus facturas, boletas, notas y cotizaciones en hoja A4. No cambia los tickets
            (80/58 mm) ni los PDF que ya envió; si vuelve a abrir un comprobante antiguo, saldrá con el diseño
            elegido.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {A4_DESIGNS.map((d) => {
          const active = selected === d.slug
          const preview = previews[d.slug]
          return (
            <button
              key={d.slug}
              type="button"
              aria-pressed={active}
              onClick={() => setSelected(d.slug)}
              className={clsx(
                'rounded-xl border-2 p-3 text-left transition',
                active
                  ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p500))]/5'
                  : 'border-gray-200 bg-white hover:border-[rgb(var(--p300))]',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">{d.label}</span>
                {active && (
                  <span className="flex items-center gap-1 text-xs font-semibold text-[rgb(var(--p600))]">
                    <Check size={14} /> Elegido
                  </span>
                )}
              </div>
              <p className="mt-0.5 mb-2 text-xs text-gray-500">{d.description}</p>
              <div className="aspect-[210/297] w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center">
                {preview && preview !== 'error' ? (
                  <img src={preview} alt={`Vista previa del diseño ${d.label}`} className="h-full w-full object-contain" />
                ) : preview === 'error' ? (
                  <span className="px-3 text-center text-xs text-gray-400">No se pudo generar la vista previa</span>
                ) : (
                  <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                )}
              </div>
            </button>
          )
        })}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || selected === saved}
          className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </section>
  )
}
