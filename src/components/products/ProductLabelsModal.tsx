import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Printer, Search, Tags, Trash2, X } from 'lucide-react'
import { clsx } from 'clsx'
import { toast } from 'sonner'
import { PortalModal } from '@/components/ui/PortalModal'
import { productsService, type Product } from '@/services/products.service'
import {
  LABEL_FORMATS,
  LABEL_MAX_COLUMNS,
  LABEL_MAX_MM,
  LABEL_MAX_TOTAL,
  LABEL_MIN_MM,
  formatLabelPrice,
  openLabelsPdf,
  paintLabelPreview,
  paintLabelRow,
  totalLabels,
  type LabelFormat,
  type LabelItem,
} from '@/utils/productLabels'
import {
  LABEL_AFTER_OPTIONS,
  LABEL_DOTS_PER_MM,
  describePrinter,
  isNativePrintAvailable,
  labelRowWidthMm,
  listInstalledPrinters,
  loadLabelPrinterChoice,
  printLabels,
  printableWidthMm,
  resolveLabelPrinter,
  saveLabelPrinterChoice,
  type LabelAfter,
  type LabelLanguage,
  type LabelPrinterChoice,
} from '@/utils/labelPrint'

/** `qtyText` es lo que se está escribiendo (puede estar vacío mientras se borra); `quantity` es el valor válido vigente. */
type Line = { product: Product; item: LabelItem; quantity: number; qtyText?: string }

const SAMPLE: LabelItem = { name: 'Aceite Vegetal Primor Clásico Botella 900 mL', price: 7.9, code: '7750000000001' }

/** Precio a mostrar: un producto con presentaciones suele tener precio 0 y el real vive en la más barata. */
function labelPrice(p: Product): number {
  if (p.has_variants && p.min_presentation_price !== undefined && !(Number(p.sale_price) > 0)) return Number(p.min_presentation_price)
  return Number(p.sale_price) || 0
}

function toItem(p: Product): LabelItem {
  return { name: p.name, price: labelPrice(p), code: (p.code ?? '').trim() }
}

/** Dibuja una etiqueta de ejemplo con el formato y las medidas actuales. */
function LabelPreview({ format, w, h, item, maxW, maxH }: { format: LabelFormat; w: number; h: number; item: LabelItem; maxW: number; maxH: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const cssPerMm = Math.min(maxW / w, maxH / h)
  useEffect(() => {
    const c = ref.current
    if (!c) return
    paintLabelPreview(c, format, w, h, item, cssPerMm * 2)
  }, [format, w, h, item, cssPerMm])
  return <canvas ref={ref} style={{ width: w * cssPerMm, height: h * cssPerMm }} className="bg-white border border-stone-300 shadow-sm" />
}

/** Lo que saldrá en la ticketera: una fila de etiquetas a 203 dpi, en blanco y negro. */
function PrintPreview({ format, width, height, gap, items, dotsPerMm }: { format: LabelFormat; width: number; height: number; gap: number; items: LabelItem[]; dotsPerMm: number }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (ref.current) paintLabelRow(ref.current, { format, width, height, gap }, items, dotsPerMm)
  }, [format, width, height, gap, items, dotsPerMm])
  return <canvas ref={ref} className="bg-white border border-stone-300 shadow-sm max-w-full" />
}

const numberOr = (raw: string, fallback: number) => {
  const n = Number(raw.replace(',', '.'))
  return Number.isFinite(n) ? n : fallback
}

export function ProductLabelsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [format, setFormat] = useState<LabelFormat>('name_price_barcode')
  const [widthRaw, setWidthRaw] = useState('50')
  const [heightRaw, setHeightRaw] = useState('30')
  const [columns, setColumns] = useState(1)
  const [gapRaw, setGapRaw] = useState('2')
  const [lines, setLines] = useState<Line[]>([])
  const [printer, setPrinter] = useState<LabelPrinterChoice>(() => loadLabelPrinterChoice())
  const [winPrinters, setWinPrinters] = useState<string[]>([])
  const [printing, setPrinting] = useState<{ done: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const canPrint = isNativePrintAvailable()

  const [q, setQ] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [searching, setSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const searchBoxRef = useRef<HTMLDivElement | null>(null)

  const width = Math.min(LABEL_MAX_MM, Math.max(LABEL_MIN_MM, numberOr(widthRaw, 50)))
  const height = Math.min(LABEL_MAX_MM, Math.max(LABEL_MIN_MM, numberOr(heightRaw, 30)))
  const gap = Math.min(20, Math.max(0, numberOr(gapRaw, 2)))
  const total = totalLabels({ lines: lines.map((l) => ({ item: l.item, quantity: l.quantity })) })
  const sample = lines[0]?.item ?? SAMPLE

  // Buscador (como un select2): consulta al servidor tras una pausa y lista los coincidentes.
  useEffect(() => {
    if (!open) return
    const term = q.trim()
    if (term.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setSearching(true)
    const t = window.setTimeout(() => {
      productsService
        .list(term, undefined, false, true, 1, 15)
        .then((r) => {
          if (!cancelled) setResults(r.data ?? [])
        })
        .catch(() => {
          if (!cancelled) setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [q, open])

  useEffect(() => {
    if (!showResults) return
    const close = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setShowResults(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [showResults])

  const addProduct = (p: Product) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id)
      if (i >= 0) return prev.map((l, k) => (k === i ? { ...l, quantity: l.quantity + 1 } : l))
      return [...prev, { product: p, item: toItem(p), quantity: 1 }]
    })
    setQ('')
    setResults([])
    setShowResults(false)
  }

  // Se puede borrar el campo y escribir libremente: el texto se guarda tal cual mientras se edita (vacío incluido) y el
  // total se actualiza con cada número válido; al salir del campo, vacío o 0 vuelven a la última cantidad válida.
  const typeQty = (id: number, raw: string) => {
    const text = raw.replace(/\D/g, '').slice(0, 4)
    setLines((prev) =>
      prev.map((l) => {
        if (l.product.id !== id) return l
        const n = Number(text)
        return { ...l, qtyText: text, quantity: text !== '' && n >= 1 ? Math.min(LABEL_MAX_TOTAL, n) : l.quantity }
      }),
    )
  }
  const commitQty = (id: number) => setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, qtyText: undefined } : l)))

  const withoutCode = format !== 'name_price' ? lines.filter((l) => !l.item.code).length : 0

  const generate = () => {
    if (lines.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    if (total > LABEL_MAX_TOTAL) {
      toast.error(`Máximo ${LABEL_MAX_TOTAL} etiquetas por generación (llevas ${total})`)
      return
    }
    try {
      openLabelsPdf({
        format,
        width,
        height,
        columns,
        gap,
        lines: lines.map((l) => ({ item: l.item, quantity: l.quantity })),
      })
      if (withoutCode > 0) toast.warning(`${withoutCode} producto(s) sin código salen con el aviso "Sin código" en la etiqueta`)
    } catch {
      toast.error('No se pudo generar el PDF de etiquetas')
    }
  }

  const updatePrinter = (patch: Partial<LabelPrinterChoice>) =>
    setPrinter((prev) => {
      const next = { ...prev, ...patch }
      saveLabelPrinterChoice(next)
      return next
    })

  useEffect(() => {
    if (!open || !canPrint) return
    listInstalledPrinters()
      .then(setWinPrinters)
      .catch(() => setWinPrinters([]))
  }, [open, canPrint])

  const printerCfg = resolveLabelPrinter(printer)
  const rowMm = labelRowWidthMm({ width, columns, gap })
  const tspl = printer.language === 'tspl'
  const tooWide = !tspl && printerCfg ? rowMm > printableWidthMm(printerCfg.paperWidthMm) + 0.01 : false
  const previewItems = useMemo(() => Array.from({ length: columns }, () => sample), [columns, sample])

  const printDirect = async (test = false) => {
    if (!test && lines.length === 0) {
      toast.error('Agrega al menos un producto')
      return
    }
    if (total > LABEL_MAX_TOTAL) {
      toast.error(`Máximo ${LABEL_MAX_TOTAL} etiquetas por impresión (llevas ${total})`)
      return
    }
    const ctl = new AbortController()
    abortRef.current = ctl
    setPrinting({ done: 0, total: 1 })
    try {
      const job = {
        format,
        width,
        height,
        columns,
        gap,
        lines: test ? [{ item: sample, quantity: columns }] : lines.map((l) => ({ item: l.item, quantity: l.quantity })),
      }
      const res = await printLabels(job, printer, { signal: ctl.signal, frame: test && tspl, onProgress: (done, tot) => setPrinting({ done, total: tot }) })
      toast.success(`${res.labels} ${res.labels === 1 ? 'etiqueta enviada' : 'etiquetas enviadas'} a la impresora`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo imprimir')
    } finally {
      abortRef.current = null
      setPrinting(null)
    }
  }

  const reset = () => {
    setLines([])
    setQ('')
    setResults([])
  }

  const dimsOk = useMemo(() => width >= LABEL_MIN_MM && height >= LABEL_MIN_MM, [width, height])

  return (
    <PortalModal open={open} onClose={onClose} className="max-w-4xl">
      <div className="bg-white rounded-2xl shadow-xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Tags size={18} className="text-[rgb(var(--p600))] shrink-0" aria-hidden />
            <div className="min-w-0">
              <h3 className="font-bold text-gray-900 text-base">Generador de etiquetas</h3>
              <p className="text-xs text-gray-500">Para impresoras de etiquetas autoadhesivas</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100" aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {/* 1. Formato */}
          <section>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">1. Elige el formato</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LABEL_FORMATS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFormat(f.id)}
                  aria-pressed={format === f.id}
                  className={clsx(
                    'rounded-xl border-2 p-3 text-left transition-colors',
                    format === f.id ? 'border-[rgb(var(--p500))] bg-[rgb(var(--p50))]' : 'border-gray-200 hover:border-gray-300',
                  )}
                >
                  <div className="flex items-center justify-center h-28 rounded-lg bg-gray-100 mb-2">
                    <LabelPreview format={f.id} w={width} h={height} item={sample} maxW={170} maxH={100} />
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{f.title}</p>
                  <p className="text-xs text-gray-500">{f.hint}</p>
                </button>
              ))}
            </div>
          </section>

          {/* 2. Medidas */}
          <section>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">2. Tamaño de la etiqueta</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1">Ancho (mm)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={LABEL_MIN_MM}
                  max={LABEL_MAX_MM}
                  step="1"
                  value={widthRaw}
                  onChange={(e) => setWidthRaw(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1">Alto (mm)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={LABEL_MIN_MM}
                  max={LABEL_MAX_MM}
                  step="1"
                  value={heightRaw}
                  onChange={(e) => setHeightRaw(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-gray-500 mb-1">Columnas</span>
                <select
                  value={columns}
                  onChange={(e) => setColumns(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                >
                  {Array.from({ length: LABEL_MAX_COLUMNS }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n} {n === 1 ? 'columna' : 'columnas'}
                    </option>
                  ))}
                </select>
              </label>
              <label className={clsx('block', columns === 1 && 'opacity-50')}>
                <span className="block text-xs font-medium text-gray-500 mb-1">Separación (mm)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={20}
                  step="0.5"
                  value={gapRaw}
                  disabled={columns === 1}
                  onChange={(e) => setGapRaw(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                />
              </label>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {!dimsOk
                ? `Las medidas se ajustan entre ${LABEL_MIN_MM} y ${LABEL_MAX_MM} mm.`
                : `Cada página del PDF mide ${(columns * width + (columns - 1) * gap).toFixed(1).replace(/\.0$/, '')} × ${height} mm y lleva ${columns} ${columns === 1 ? 'etiqueta' : 'etiquetas'} por fila.`}
            </p>
          </section>

          {/* 3. Productos */}
          <section>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">3. Productos y cantidad de etiquetas</h4>
            <div ref={searchBoxRef}>
              <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value)
                  setShowResults(true)
                }}
                onFocus={() => setShowResults(true)}
                placeholder="Buscar producto por nombre o código…"
                className="w-full border border-gray-200 rounded-xl pl-8 pr-9 py-2 text-sm"
                aria-label="Buscar producto"
              />
              {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
              </div>
              {showResults && q.trim().length >= 2 && (
                <div className="mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                  {results.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-gray-500">{searching ? 'Buscando…' : 'Sin resultados'}</p>
                  ) : (
                    results.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addProduct(p)}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[rgb(var(--p50))]"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-gray-900">{p.name}</span>
                          <span className="block text-xs text-gray-500 truncate">
                            {p.code || 'Sin código'}
                            {p.category_name ? ` · ${p.category_name}` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-700">{formatLabelPrice(labelPrice(p))}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500">
                    <tr>
                      <th className="text-left font-medium px-3 py-2">Producto</th>
                      <th className="text-right font-medium px-3 py-2">Precio</th>
                      <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Categoría</th>
                      <th className="text-center font-medium px-3 py-2 w-28">Cantidad</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                          Busca y elige productos para agregarlos a la lista.
                        </td>
                      </tr>
                    ) : (
                      lines.map((l) => (
                        <tr key={l.product.id} className="border-t border-gray-100">
                          <td className="px-3 py-2">
                            <p className="text-gray-900">{l.product.name}</p>
                            <p className={clsx('text-xs', l.item.code ? 'text-gray-500' : 'text-amber-600')}>{l.item.code || 'Sin código'}</p>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatLabelPrice(l.item.price)}</td>
                          <td className="px-3 py-2 hidden sm:table-cell text-gray-600">{l.product.category_name || '—'}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={l.qtyText ?? String(l.quantity)}
                              onChange={(e) => typeQty(l.product.id, e.target.value)}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={() => commitQty(l.product.id)}
                              aria-label={`Etiquetas de ${l.product.name}`}
                              className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center tabular-nums"
                            />
                          </td>
                          <td className="px-1 py-2">
                            <button
                              type="button"
                              onClick={() => setLines((prev) => prev.filter((x) => x.product.id !== l.product.id))}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"
                              aria-label={`Quitar ${l.product.name}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {withoutCode > 0 && (
              <p className="mt-1.5 text-xs text-amber-600">
                {withoutCode} producto(s) sin código: con este formato la etiqueta saldrá con el aviso "Sin código".
              </p>
            )}
          </section>

          {/* 4. Impresión directa */}
          <section>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">4. Imprimir directo en la ticketera</h4>
            {!canPrint ? (
              <p className="text-xs text-gray-500 rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
                La impresión directa está disponible en la app de escritorio, en la de Android o con el Servidor de impresión vinculado. Mientras tanto usa «Generar PDF».
              </p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <label className="block sm:col-span-3">
                    <span className="block text-xs font-medium text-gray-500 mb-1">Tipo de impresora</span>
                    <select
                      value={printer.language}
                      onChange={(e) => updatePrinter({ language: e.target.value as LabelLanguage })}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="escpos">Ticketera de recibos (ESC/POS)</option>
                      <option value="tspl">Impresora de etiquetas en modo etiqueta (TSPL: Hoin, Xprinter, TSC…)</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="block text-xs font-medium text-gray-500 mb-1">Impresora</span>
                    <select
                      value={printer.source === 'windows' ? `w:${printer.printerName ?? ''}` : printer.source}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v.startsWith('w:')) updatePrinter({ source: 'windows', printerName: v.slice(2) })
                        else updatePrinter({ source: v as LabelPrinterChoice['source'] })
                      }}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="documentos">La de comprobantes</option>
                      <option value="precuenta">La de precuentas</option>
                      <option value="comandas">La de comandas</option>
                      {printer.source === 'windows' && printer.printerName && !winPrinters.includes(printer.printerName) && (
                        <option value={`w:${printer.printerName}`}>{printer.printerName}</option>
                      )}
                      {winPrinters.map((n) => (
                        <option key={n} value={`w:${n}`}>
                          {n} (instalada)
                        </option>
                      ))}
                    </select>
                  </label>
                  {printer.source === 'windows' && !tspl && (
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-500 mb-1">Ancho del rollo</span>
                      <select
                        value={printer.paperWidthMm}
                        onChange={(e) => updatePrinter({ paperWidthMm: Number(e.target.value) === 58 ? 58 : 80 })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      >
                        <option value={80}>80 mm</option>
                        <option value={58}>58 mm</option>
                      </select>
                    </label>
                  )}
                  {tspl && (
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-500 mb-1">Resolución de la impresora</span>
                      <select
                        value={printer.dotsPerMm ?? 8}
                        onChange={(e) => updatePrinter({ dotsPerMm: Number(e.target.value) })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      >
                        <option value={8}>203 dpi (la más común)</option>
                        <option value={12}>300 dpi</option>
                        <option value={16}>400 dpi</option>
                      </select>
                    </label>
                  )}
                  {tspl ? (
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-500 mb-1">Espacio entre etiquetas del rollo (mm)</span>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step="0.5"
                        value={printer.rollGapMm ?? 2}
                        onChange={(e) => updatePrinter({ rollGapMm: Math.min(10, Math.max(0, Number(e.target.value) || 0)) })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      />
                    </label>
                  ) : (
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-500 mb-1">Al terminar cada etiqueta</span>
                      <select
                        value={printer.after}
                        onChange={(e) => updatePrinter({ after: e.target.value as LabelAfter })}
                        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                      >
                        {LABEL_AFTER_OPTIONS.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
                <p className={clsx('text-xs', !printerCfg || tooWide ? 'text-amber-600' : 'text-gray-500')}>
                  {!printerCfg
                    ? 'Esa impresora no está configurada. Configúrala en Ajustes → Impresoras o elige otra.'
                    : tooWide
                      ? `La fila mide ${rowMm.toFixed(1)} mm y el rollo de ${printerCfg.paperWidthMm} mm imprime hasta ${printableWidthMm(printerCfg.paperWidthMm)} mm: reduce el ancho o las columnas.`
                      : tspl
                        ? `Se imprimirá en ${describePrinter(printerCfg)} con etiquetas de ${rowMm.toFixed(1).replace(/\.0$/, '')} × ${height} mm (la impresora debe estar en modo etiqueta).`
                        : `Se imprimirá en ${describePrinter(printerCfg)} (rollo de ${printerCfg.paperWidthMm} mm). ${LABEL_AFTER_OPTIONS.find((o) => o.id === printer.after)?.hint ?? ''}`}
                </p>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Vista previa de la impresión</p>
                  <div className="rounded-lg bg-gray-100 p-3 overflow-x-auto">
                    <PrintPreview format={format} width={width} height={height} gap={gap} items={previewItems} dotsPerMm={tspl ? printer.dotsPerMm : LABEL_DOTS_PER_MM} />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 shrink-0">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900 tabular-nums">{total}</span> {total === 1 ? 'etiqueta' : 'etiquetas'}
            {lines.length > 0 && (
              <button type="button" onClick={reset} className="ml-3 text-xs text-gray-500 underline hover:text-gray-700">
                Vaciar lista
              </button>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:bg-white">
              Cerrar
            </button>
            <button
              type="button"
              onClick={generate}
              disabled={lines.length === 0 || printing !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Generar PDF
            </button>
            {canPrint && (
              <>
                <button
                  type="button"
                  onClick={() => void printDirect(true)}
                  disabled={printing !== null || !printerCfg || tooWide}
                  className="hidden sm:inline-flex px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
                >
                  Etiqueta de prueba
                </button>
                {printing ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium"
                  >
                    <Loader2 size={15} className="animate-spin" /> {printing.done}/{printing.total} · Cancelar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => void printDirect()}
                    disabled={lines.length === 0 || !printerCfg || tooWide}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[rgb(var(--p600))] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <Printer size={15} /> Imprimir
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </PortalModal>
  )
}
