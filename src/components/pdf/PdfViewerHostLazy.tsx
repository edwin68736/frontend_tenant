import { lazy, Suspense, useEffect, useState } from 'react'
import { runWhenIdle } from '@/utils/runWhenIdle'
import { subscribePdfViewer } from './pdfViewerStore'

const loadHost = () => import('./PdfViewerHost').then((m) => ({ default: m.PdfViewerHost }))
const PdfViewerHost = lazy(loadHost)

/**
 * Monta el visor de PDF SOLO cuando hay algo que mostrar.
 *
 * PdfViewerHost arrastra PdfBlobViewer → receiptShare → receiptPdf → jsPDF (+ pako, fast-png…): ~290 KB que el
 * navegador tenía que bajar y ejecutar antes de pintar CUALQUIER pantalla (incluido el login), solo para tener
 * montado un modal que casi nunca se abre. Este wrapper solo depende del store (pocas líneas); el host real se
 * descarga al primer uso y, para que ese primer PDF no espere, se precarga cuando el navegador está ocioso.
 */
export function PdfViewerHostLazy() {
  const [needed, setNeeded] = useState(false)

  useEffect(() => subscribePdfViewer((req) => req && setNeeded(true)), [])
  useEffect(() => runWhenIdle(() => void loadHost(), { minDelayMs: 4000, maxWaitMs: 8000 }), [])

  if (!needed) return null
  return (
    <Suspense fallback={null}>
      <PdfViewerHost />
    </Suspense>
  )
}
