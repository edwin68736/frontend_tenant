import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import {
  getProductImageUrl,
  productsService,
  type ModifierGroup,
  type Product,
  type ProductPresentation,
  type ProductSaleUnit,
  type SaleUnitBranchPrice,
} from '@/services/products.service'
import { formatSaleMoney } from '@/utils/formatMoney'
import { formatAmountDisplay } from '@/utils/money'
import { productUnitFormDisplayName } from '@/constants/sunatUnits'
import type { CatalogCartLine } from '@/utils/posCart'
import { createCatalogCartLine } from '@/utils/posCart'
import type { CartModifierEntry } from '@/types/productModifiers'
import {
  calcUnitPriceWithModifiers,
  formatModifierSummary,
  getModifierSetupIssue,
  getProductExtraGroups,
  hasConfigurableModifierUI,
  productNeedsConfiguration,
  productNeedsSaleConfiguration,
  selectionFromProductPresentation,
  toggleExtraSelection,
  validateModifierSelection,
} from '@/utils/productModifiers'

type SerialRow = { serial: string; branch_id: number; status: string }

type Props = {
  product: Product | null
  branchId?: number | null
  stacked?: boolean
  /**
   * Fase 7E: habilita la carga y selección de SaleUnits en este modal. Por defecto false para no
   * cambiar en nada el comportamiento de los demás consumidores del componente (ej.
   * SalesRegisterPage.tsx, fuera de alcance de esta fase) — solo POSPage.tsx lo activa.
   */
  enableSaleUnits?: boolean
  onClose: () => void
  onConfirm: (line: CatalogCartLine) => void
}

/**
 * Resuelve el Price1 efectivo de una SaleUnit para la sucursal activa: BranchPrice activo de esa
 * sucursal si existe, si no el Price1 global — el mismo orden documentado en
 * pkg/saleunit.ResolvePrice (backend), pero SOLO el primer paso (nivel 1, el único que usa el
 * flujo real de ventas hoy). No reimplementa el resto del algoritmo (niveles 2/3, validación de
 * pertenencia, etc.) — la autoridad final sigue siendo el backend en POST /sales.
 */
function resolveSaleUnitPrice1(
  saleUnit: ProductSaleUnit,
  branchPrices: SaleUnitBranchPrice[],
  branchId?: number | null,
): number {
  if (branchId) {
    const override = branchPrices.find((bp) => bp.branch_id === branchId && bp.active)
    if (override) return override.price1
  }
  return saleUnit.price1
}

export function ProductConfigureModal({ product, branchId, stacked, enableSaleUnits, onClose, onConfirm }: Props) {
  const [loading, setLoading] = useState(false)
  const [optionsLoaded, setOptionsLoaded] = useState(false)
  const [modifierGroupIds, setModifierGroupIds] = useState<number[]>([])
  const [presentations, setPresentations] = useState<ProductPresentation[]>([])
  const [allGroups, setAllGroups] = useState<ModifierGroup[]>([])
  const [selected, setSelected] = useState<CartModifierEntry[]>([])
  const [availableSerials, setAvailableSerials] = useState<SerialRow[]>([])
  const [selectedSerial, setSelectedSerial] = useState('')
  // SaleUnits (Fase 7E) — solo se cargan/usan cuando enableSaleUnits es true (POS).
  const [saleUnits, setSaleUnits] = useState<ProductSaleUnit[]>([])
  const [saleUnitBranchPrices, setSaleUnitBranchPrices] = useState<Record<number, SaleUnitBranchPrice[]>>({})
  // Corrección "unidad base + SaleUnits": la opción elegida puede ser la unidad base (sintética,
  // clave fija 'base') o una SaleUnit real (clave `su-{id}`) — unitOptions más abajo arma la lista.
  const [selectedUnitKey, setSelectedUnitKey] = useState<string | null>(null)
  const degradedRef = useRef(false)
  const loadGenRef = useRef(0)
  const loadedProductIdRef = useRef<number | null>(null)
  const onConfirmRef = useRef(onConfirm)
  const onCloseRef = useRef(onClose)
  onConfirmRef.current = onConfirm
  onCloseRef.current = onClose

  const productId = product?.id ?? null

  useEffect(() => {
    degradedRef.current = false
    loadedProductIdRef.current = null
    if (!productId || !product) {
      setOptionsLoaded(false)
      setModifierGroupIds([])
      setPresentations([])
      setAllGroups([])
      setSelected([])
      setAvailableSerials([])
      setSelectedSerial('')
      setSaleUnits([])
      setSaleUnitBranchPrices({})
      setSelectedUnitKey(null)
      return
    }
    const gen = ++loadGenRef.current
    setOptionsLoaded(false)
    setLoading(true)
    setModifierGroupIds([])
    setPresentations([])
    setAllGroups([])
    setSelected([])
    setAvailableSerials([])
    setSelectedSerial('')
    setSaleUnits([])
    setSaleUnitBranchPrices({})
    setSelectedUnitKey(null)

    const serialsPromise = product.manage_series
      ? productsService.getSerials(productId).then((rows) =>
          (rows ?? []).filter(
            (s) =>
              s.status === 'available' &&
              (branchId && branchId > 0 ? s.branch_id === branchId : true),
          ),
        )
      : Promise.resolve([] as SerialRow[])

    // SaleUnits (Fase 7E): solo se piden cuando el caller las habilita (POS). GET /products/:id no
    // las incluye (confirmado en Fase 7A) — se piden aparte con el service ya existente.
    const saleUnitsPromise = enableSaleUnits
      ? productsService.listSaleUnits(productId).catch(() => [] as ProductSaleUnit[])
      : Promise.resolve([] as ProductSaleUnit[])

    Promise.all([
      productsService.get(productId),
      productsService.listModifierGroups(),
      serialsPromise,
      saleUnitsPromise,
    ])
      .then(([detail, groups, serials, units]) => {
        if (loadGenRef.current !== gen) return
        const ids = detail.modifier_group_ids ?? []
        const pres = (detail.presentations ?? []).filter((p) => p.name.trim())
        loadedProductIdRef.current = productId
        setModifierGroupIds(ids)
        setPresentations(pres)
        setAllGroups(groups ?? [])
        setAvailableSerials(serials ?? [])
        setSaleUnits(units ?? [])
        const auto: CartModifierEntry[] = []
        if (pres.length === 1 && units.length === 0) {
          // Solo auto-selecciona Presentation cuando el producto no tiene SaleUnits activas —
          // con SaleUnits, esa sección queda oculta (mutuamente excluyentes, ver sección 11/12
          // del encargo de Fase 7E).
          auto.push(selectionFromProductPresentation(pres[0]))
        }
        setSelected(auto)
        // Auto-selección de unidad: si, contando también la opción "unidad base" cuando
        // corresponda (ver unitOptions más abajo), solo queda una opción total, se preselecciona
        // — mismo criterio que antes con una única SaleUnit. La opción base sintética NO se
        // agrega si ya existe una SaleUnit real marcada is_base (ver sección "SALE UNIT is_base"
        // del encargo de corrección): en ese caso esa fila real YA representa la unidad base.
        if (units.length > 0) {
          const hasIsBaseSaleUnit = units.some((u) => u.is_base)
          const totalOptions = units.length + (hasIsBaseSaleUnit ? 0 : 1)
          setSelectedUnitKey(totalOptions === 1 ? `su-${units[0].id}` : null)
        }

        // Precios por sucursal de cada SaleUnit (Fase 7D), para resolver el precio efectivo sin
        // reimplementar ResolvePrice — un GET liviano por unidad, solo cuando realmente hay
        // SaleUnits y una sucursal activa contra la cual resolver el override.
        if (units.length > 0 && branchId) {
          Promise.all(
            units.map((u) =>
              productsService
                .listSaleUnitBranchPrices(productId, u.id ?? 0)
                .catch(() => [] as SaleUnitBranchPrice[]),
            ),
          ).then((lists) => {
            if (loadGenRef.current !== gen) return
            const map: Record<number, SaleUnitBranchPrice[]> = {}
            units.forEach((u, idx) => {
              if (u.id) map[u.id] = lists[idx] ?? []
            })
            setSaleUnitBranchPrices(map)
          })
        }
      })
      .catch(() => {
        if (loadGenRef.current === gen) toast.error('No se pudieron cargar las opciones del producto')
      })
      .finally(() => {
        if (loadGenRef.current !== gen) return
        setLoading(false)
        setOptionsLoaded(true)
      })
  }, [productId, product, branchId, enableSaleUnits])

  // SaleUnits activas (Fase 7E): si el producto tiene alguna, esta sección "toma el control" del
  // modal — Presentación, Extras y Serie quedan ocultos (el backend rechaza combinar SaleUnitID
  // con PresentationID, con modifiers_json o con productos manage_series; ver secciones 11/12 del
  // encargo). Con enableSaleUnits=false (todo caller salvo POSPage) esto siempre es false y el
  // resto del componente se comporta exactamente igual que antes de esta fase.
  const hasActiveSaleUnits = Boolean(enableSaleUnits) && saleUnits.length > 0

  const extraGroups = useMemo(() => {
    if (!product || hasActiveSaleUnits) return []
    return getProductExtraGroups(modifierGroupIds, allGroups, product)
  }, [product, modifierGroupIds, allGroups, hasActiveSaleUnits])

  useEffect(() => {
    if (!product || productId == null || loadedProductIdRef.current !== productId) return
    if (!optionsLoaded || loading || degradedRef.current) return
    // Hay una SaleUnit que elegir: nunca auto-agregar, el usuario debe decidir la unidad.
    if (hasActiveSaleUnits) return
    if (!productNeedsConfiguration(product)) return
    if (hasConfigurableModifierUI(product, modifierGroupIds, allGroups, presentations)) return
    if (product.manage_series && availableSerials.length > 0) return
    degradedRef.current = true
    const issue = getModifierSetupIssue(product, modifierGroupIds, allGroups, presentations)
    toast.warning(issue ?? 'Configuración incompleta; se agrega con precio base.', { duration: 6000 })
    onConfirmRef.current(
      createCatalogCartLine(product, {
        quantity: 1,
        notes: '',
        serials: product.manage_series && selectedSerial ? [selectedSerial] : undefined,
      }),
    )
    onCloseRef.current()
  }, [
    product,
    productId,
    optionsLoaded,
    loading,
    hasActiveSaleUnits,
    modifierGroupIds,
    allGroups,
    presentations,
    selectedSerial,
    availableSerials.length,
  ])

  const basePrice = product ? Number(product.sale_price) || 0 : 0
  const activePresentations = hasActiveSaleUnits ? [] : presentations.filter((p) => p.name.trim())

  // Corrección "unidad base + SaleUnits" (post-Fase 7E): cuando el producto tiene SaleUnits
  // activas, el selector debe ofrecer también la unidad base — SIN crear ninguna
  // TenantProductSaleUnit para representarla. Se arma como una opción sintética adicional
  // ('base', usando exclusivamente Product.UnitID/Product.SalePrice — nunca BranchPrice, nunca
  // Price2/3, nunca conversion_factor), EXCEPTO si el producto ya tiene una SaleUnit real marcada
  // is_base=true: en ese caso esa fila YA representa la unidad base (con su propio Price1 y, si
  // corresponde, su propio BranchPrice) y no se duplica con la sintética — se listan tal cual las
  // SaleUnits, sin agregar nada más.
  const hasIsBaseSaleUnit = saleUnits.some((u) => u.is_base)
  type UnitOption =
    | { key: string; kind: 'base' }
    | { key: string; kind: 'saleUnit'; unit: ProductSaleUnit }
  const unitOptions: UnitOption[] = hasActiveSaleUnits
    ? [
        ...(hasIsBaseSaleUnit ? [] : ([{ key: 'base', kind: 'base' }] as UnitOption[])),
        ...saleUnits.map((u): UnitOption => ({ key: `su-${u.id}`, kind: 'saleUnit', unit: u })),
      ]
    : []
  const selectedOption = unitOptions.find((o) => o.key === selectedUnitKey) ?? null
  const isBaseOptionSelected = selectedOption?.kind === 'base'
  const selectedSaleUnit = selectedOption?.kind === 'saleUnit' ? selectedOption.unit : null

  const selectedSaleUnitBranchPrices = selectedSaleUnit?.id ? (saleUnitBranchPrices[selectedSaleUnit.id] ?? []) : []
  const selectedSaleUnitPrice = selectedSaleUnit
    ? resolveSaleUnitPrice1(selectedSaleUnit, selectedSaleUnitBranchPrices, branchId)
    : 0
  const selectedSaleUnitHasBranchOverride =
    !!selectedSaleUnit && !!branchId && selectedSaleUnitBranchPrices.some((bp) => bp.branch_id === branchId && bp.active)
  // Precio de la opción "unidad base": exclusivamente Product.SalePrice, nunca BranchPrice ni
  // conversion_factor — la misma regla que ya rige para un producto sin SaleUnits.
  const baseUnitDisplayName = product ? productUnitFormDisplayName(product.unit) : ''

  const unitPrice = hasActiveSaleUnits
    ? isBaseOptionSelected
      ? basePrice
      : selectedSaleUnitPrice
    : calcUnitPriceWithModifiers(basePrice, selected)

  const selectedPresentation = selected.find((m) => m.type === 'variant')
  const displayBaseLabel = hasActiveSaleUnits
    ? isBaseOptionSelected
      ? `${baseUnitDisplayName} (unidad base)`
      : selectedSaleUnit
        ? selectedSaleUnit.name
        : 'Elige una unidad de venta'
    : selectedPresentation
      ? 'Precio de la presentación'
      : 'Precio base del producto'
  const displayBaseAmount = hasActiveSaleUnits
    ? isBaseOptionSelected
      ? basePrice
      : selectedSaleUnitPrice
    : selectedPresentation
      ? Number(selectedPresentation.extra_price) || basePrice
      : basePrice

  const priceBreakdown = useMemo(() => {
    const lines: { label: string; amount: number; sign: 'none' | 'plus' }[] = []

    if (hasActiveSaleUnits) {
      if (isBaseOptionSelected) {
        lines.push({ label: `${baseUnitDisplayName} (unidad base, precio de catálogo)`, amount: basePrice, sign: 'none' })
      } else if (selectedSaleUnit) {
        lines.push({
          label: selectedSaleUnit.name + (selectedSaleUnitHasBranchOverride ? ' (precio de esta sucursal)' : ''),
          amount: selectedSaleUnitPrice,
          sign: 'none',
        })
      }
      return lines
    }

    const presentation = selected.find((m) => m.type === 'variant')
    const extras = selected.filter((m) => m.type === 'modifier')

    if (!presentation) {
      lines.push({ label: 'Precio base', amount: basePrice, sign: 'none' })
    } else {
      const p = Number(presentation.extra_price) || 0
      lines.push({
        label: presentation.option_name || 'Presentación',
        amount: p > 0 ? p : basePrice,
        sign: 'none',
      })
    }
    for (const m of extras) {
      const amt = Number(m.extra_price) || 0
      if (amt !== 0) lines.push({ label: m.option_name, amount: amt, sign: 'plus' })
    }
    return lines
  }, [
    basePrice,
    selected,
    hasActiveSaleUnits,
    isBaseOptionSelected,
    baseUnitDisplayName,
    selectedSaleUnit,
    selectedSaleUnitPrice,
    selectedSaleUnitHasBranchOverride,
  ])

  const handleConfirm = () => {
    if (!product || productId == null || loadedProductIdRef.current !== productId) return

    if (hasActiveSaleUnits) {
      if (isBaseOptionSelected) {
        // Unidad base seleccionada: línea EXACTAMENTE igual a la de un producto sin SaleUnits —
        // sin `sale_unit`, con Product.SalePrice tal cual. El backend la trata como venta legacy
        // normal (sale_unit_id ausente), sin ninguna conversión de cantidad.
        degradedRef.current = true
        onConfirmRef.current(
          createCatalogCartLine(product, {
            quantity: 1,
            base_price: basePrice,
          }),
        )
        onCloseRef.current()
        return
      }
      if (!selectedSaleUnit) {
        toast.error('Elige una unidad de venta')
        return
      }
      degradedRef.current = true
      onConfirmRef.current(
        createCatalogCartLine(product, {
          quantity: 1,
          // base_price ya viene resuelto (BranchPrice si aplica, si no Price1 global) — NUNCA se
          // multiplica por conversion_factor. modifiers vacío a propósito: Presentation/Extras
          // quedan excluidos cuando la línea usa SaleUnit (ver sección 12 del encargo).
          base_price: selectedSaleUnitPrice,
          sale_unit: {
            id: selectedSaleUnit.id ?? 0,
            name: selectedSaleUnit.name,
            conversion_factor: selectedSaleUnit.conversion_factor,
            allow_fraction: selectedSaleUnit.allow_fraction,
          },
        }),
      )
      onCloseRef.current()
      return
    }

    if (product.manage_series && availableSerials.length > 0 && !selectedSerial) {
      toast.error('Seleccione la serie del producto')
      return
    }

    const err = validateModifierSelection(presentations, extraGroups, selected, product)
    if (err) {
      toast.error(err)
      return
    }

    degradedRef.current = true
    onConfirmRef.current(
      createCatalogCartLine(product, {
        quantity: 1,
        modifiers: selected,
        base_price: basePrice,
        serials: product.manage_series && selectedSerial ? [selectedSerial] : undefined,
      }),
    )
    onCloseRef.current()
  }

  if (!product) return null

  const imgUrl = getProductImageUrl(product.image_url)
  const showModifierSections = !hasActiveSaleUnits && productNeedsConfiguration(product)
  const serialRequired = !hasActiveSaleUnits && product.manage_series && availableSerials.length > 0
  const showPriceSummary =
    hasActiveSaleUnits ||
    showModifierSections ||
    selected.length > 0 ||
    (!hasActiveSaleUnits && product.manage_series) ||
    activePresentations.length > 0

  return (
    <Modal
      open={!!product}
      onClose={onClose}
      stacked={stacked}
      closeOnBackdropClick={false}
      contentClassName="max-w-lg max-h-[min(92dvh,720px)] flex flex-col"
    >
      <div className="flex flex-col flex-1 min-h-0 -mx-1">
        <div className="pb-3 border-b border-gray-100 shrink-0">
          <h3 className="font-bold text-gray-900 text-lg leading-tight">{product.name}</h3>
          {product.description?.trim() ? (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{product.description}</p>
          ) : null}
        </div>

        <div className="py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
          <div className="flex gap-3 items-start">
            {imgUrl ? (
              <img
                src={imgUrl}
                alt=""
                className="w-16 h-16 rounded-xl object-cover border border-gray-200 shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gray-100 border border-gray-200 shrink-0" />
            )}
            <div>
              <p className="text-sm text-gray-600">{displayBaseLabel}</p>
              <p className="text-xl font-bold text-[rgb(var(--p700))] tabular-nums">
                {formatSaleMoney(displayBaseAmount)}
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-[rgb(var(--p600))]" />
            </div>
          ) : (
            <>
              {hasActiveSaleUnits && (
                <div className="rounded-xl border-2 border-[rgb(var(--p200))] bg-[rgb(var(--p50))]/50 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--p800))]">
                      Unidad de venta
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Elige en qué unidad comercial vendes este producto.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unitOptions.map((option) => {
                      const active = selectedUnitKey === option.key
                      if (option.kind === 'base') {
                        return (
                          <button
                            key={option.key}
                            type="button"
                            onClick={() => setSelectedUnitKey(option.key)}
                            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                              active
                                ? 'bg-[rgb(var(--p600))] text-white border-[rgb(var(--p600))]'
                                : 'bg-white text-gray-800 border-gray-200 hover:border-[rgb(var(--p400))]'
                            }`}
                          >
                            {baseUnitDisplayName}
                            <span className="block text-[11px] font-normal opacity-90 tabular-nums">
                              S/ {formatAmountDisplay(basePrice)}
                            </span>
                            <span className="block text-[10px] font-normal opacity-75">Unidad base (catálogo)</span>
                          </button>
                        )
                      }
                      const u = option.unit
                      const price = resolveSaleUnitPrice1(
                        u,
                        u.id ? (saleUnitBranchPrices[u.id] ?? []) : [],
                        branchId,
                      )
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => setSelectedUnitKey(option.key)}
                          className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                            active
                              ? 'bg-[rgb(var(--p600))] text-white border-[rgb(var(--p600))]'
                              : 'bg-white text-gray-800 border-gray-200 hover:border-[rgb(var(--p400))]'
                          }`}
                        >
                          {u.name}
                          <span className="block text-[11px] font-normal opacity-90 tabular-nums">
                            S/ {formatAmountDisplay(price)}
                          </span>
                          {u.is_base ? (
                            <span className="block text-[10px] font-normal opacity-75">Unidad base</span>
                          ) : u.allow_fraction ? (
                            <span className="block text-[10px] font-normal opacity-75">Admite fracciones</span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {activePresentations.length > 0 && (
                <div className="rounded-xl border-2 border-[rgb(var(--p200))] bg-[rgb(var(--p50))]/50 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--p800))]">
                      Presentación
                    </p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      Elige una. Su precio reemplaza el precio base.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activePresentations.map((pres) => {
                      const active = selected.some(
                        (s) =>
                          s.type === 'variant' &&
                          (pres.id ? s.option_id === pres.id : s.option_name === pres.name.trim()),
                      )
                      const salePrice = Number(pres.sale_price) || 0
                      return (
                        <button
                          key={pres.id ?? pres.name}
                          type="button"
                          onClick={() =>
                            setSelected((prev) => [
                              ...prev.filter((s) => s.type !== 'variant'),
                              selectionFromProductPresentation(pres),
                            ])
                          }
                          className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                            active
                              ? 'bg-[rgb(var(--p600))] text-white border-[rgb(var(--p600))]'
                              : 'bg-white text-gray-800 border-gray-200 hover:border-[rgb(var(--p400))]'
                          }`}
                        >
                          {pres.name}
                          {salePrice > 0 ? (
                            <span className="block text-[11px] font-normal opacity-90 tabular-nums">
                              S/ {formatAmountDisplay(salePrice)}
                            </span>
                          ) : null}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {extraGroups.length > 0 && (
                <div className="rounded-xl border-2 border-amber-200 bg-amber-50/50 p-3 space-y-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-amber-900">
                      Extras y adicionales
                    </p>
                    <p className="text-[11px] text-amber-800/90 mt-0.5">Se suman al precio elegido.</p>
                  </div>
                  {extraGroups.map((g) => (
                    <section key={g.id}>
                      <p className="text-xs font-semibold text-gray-800 mb-2">
                        {g.name}
                        {g.required ? <span className="text-red-600"> *</span> : null}
                        {g.multi_select ? (
                          <span className="text-gray-500 font-normal"> (varios)</span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {(g.options ?? []).map((opt) => {
                          const active = selected.some(
                            (s) => s.type === 'modifier' && s.option_id === opt.id,
                          )
                          const extra = Number(opt.extra_price) || 0
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() =>
                                setSelected((prev) => toggleExtraSelection(prev, g, opt.id))
                              }
                              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
                                active
                                  ? 'bg-amber-500 text-white border-amber-500'
                                  : 'bg-white text-gray-800 border-amber-200 hover:border-amber-400'
                              }`}
                            >
                              {active ? '✓ ' : ''}
                              {opt.name}
                              {extra > 0 ? ` (+S/ ${formatAmountDisplay(extra)})` : ''}
                            </button>
                          )
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              )}

              {!hasActiveSaleUnits && product.manage_series && (
                <section className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Serie / lote{serialRequired ? ' *' : ''}
                  </label>
                  {availableSerials.length === 0 ? (
                    <p className="text-xs text-amber-700">No hay series disponibles en esta sucursal.</p>
                  ) : (
                    <select
                      className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white"
                      value={selectedSerial}
                      onChange={(e) => setSelectedSerial(e.target.value)}
                    >
                      <option value="">Seleccionar…</option>
                      {availableSerials.map((s) => (
                        <option key={s.serial} value={s.serial}>
                          {s.serial}
                        </option>
                      ))}
                    </select>
                  )}
                </section>
              )}

              {(showPriceSummary || !loading) && (
                <section className="rounded-xl bg-gray-50 border border-gray-200 p-3 space-y-1">
                  <p className="text-xs font-semibold text-gray-600 mb-1">Resumen de precio</p>
                  {priceBreakdown.length > 0 ? (
                    priceBreakdown.map((row) => (
                      <div key={row.label} className="flex justify-between text-sm text-gray-700">
                        <span>{row.sign === 'plus' ? `+ ${row.label}` : row.label}</span>
                        <span className="tabular-nums">
                          {row.sign === 'plus' ? '+' : ''}
                          {formatSaleMoney(row.amount)}
                        </span>
                      </div>
                    ))
                  ) : hasActiveSaleUnits ? (
                    <p className="text-sm text-gray-500">Elige una unidad de venta para ver su precio.</p>
                  ) : (
                    <div className="flex justify-between text-sm text-gray-700">
                      <span>Precio base</span>
                      <span className="tabular-nums">{formatSaleMoney(basePrice)}</span>
                    </div>
                  )}
                  {selected.length > 0 && (
                    <p className="text-[11px] text-gray-500 pt-1">{formatModifierSummary(selected)}</p>
                  )}
                  <div className="flex justify-between font-bold text-gray-900 pt-2 border-t border-gray-200 text-base">
                    <span>Total unitario</span>
                    <span className="text-[rgb(var(--p700))] tabular-nums">{formatSaleMoney(unitPrice)}</span>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <div className="pt-3 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 min-h-[48px] py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading || (serialRequired && !selectedSerial) || (hasActiveSaleUnits && !selectedOption)}
            className="flex-1 min-h-[48px] py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          >
            Agregar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Indica si el producto debe abrir el modal antes de agregar a venta/POS. */
export { productNeedsSaleConfiguration }
