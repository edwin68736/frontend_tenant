import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { SaleUnitsEditor } from '@/components/products/SaleUnitsEditor'
import { SaleUnitBranchPricesPanel } from '@/components/products/SaleUnitBranchPricesPanel'
import { productsService, type ProductSaleUnit, type Unit } from '@/services/products.service'

type Props = {
  open: boolean
  productId: number
  productName?: string
  /** Nombre visible de la unidad base del producto (ej. "KG", "Unidades"). */
  baseUnitLabel: string
  onClose: () => void
  /** Se llama tras guardar o eliminar con éxito, para que el padre refresque su propio resumen. */
  onChanged?: () => void
}

function emptyRow(sortOrder: number): ProductSaleUnit {
  return {
    name: '',
    unit_id: null,
    unit: '',
    conversion_factor: 1,
    is_base: false,
    allow_fraction: false,
    price1: 0,
    price2: null,
    price3: null,
    sort_order: sortOrder,
    active: true,
  }
}

function validateRow(u: ProductSaleUnit): string | null {
  const name = u.name.trim()
  if (!name) return 'El nombre de la unidad de venta es obligatorio.'
  if (name.length > 120) return 'El nombre de la unidad de venta no puede superar 120 caracteres.'
  // Requerido solo para filas nuevas — igual que el backend (CreateSaleUnit exige UnitID,
  // UpdateSaleUnit no, para no forzar a completar retroactivamente SaleUnits ya existentes).
  if (!u.id && !u.unit_id) {
    return `Elige la unidad de medida (Catálogo SUNAT N°03) de "${name || 'la nueva unidad de venta'}".`
  }
  if (!(u.conversion_factor > 0)) return `El factor de conversión de "${name}" debe ser mayor a 0.`
  if (u.is_base && u.conversion_factor !== 1) {
    return `La unidad base "${name}" debe tener factor de conversión igual a 1.`
  }
  if (!(u.price1 > 0)) return `El precio 1 de "${name}" debe ser mayor a 0.`
  if (u.price2 != null && !(u.price2 > 0)) return `El precio 2 de "${name}" debe ser mayor a 0 si se especifica.`
  if (u.price3 != null && !(u.price3 > 0)) return `El precio 3 de "${name}" debe ser mayor a 0 si se especifica.`
  return null
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } }
  return err?.response?.data?.error ?? fallback
}

/**
 * Gestión completa (crear/editar/eliminar) de las SaleUnits de un producto. A diferencia de
 * ProductPresentationsModal (que solo mantiene un draft local y lo envía embebido en el guardado
 * del producto), SaleUnit tiene su propio CRUD REST dedicado en el backend
 * (`/products/:id/sale-units...`, ver product_service.go) — este modal llama a esos endpoints
 * directamente (productsService.createSaleUnit/updateSaleUnit/deleteSaleUnit), sin pasar por el
 * guardado del producto.
 *
 * Solo tiene sentido para un producto ya existente (con id) — no se ofrece durante la creación
 * inicial (Fase 7B, sección 6 del encargo).
 */
export function SaleUnitsModal({ open, productId, productName, baseUnitLabel, onClose, onChanged }: Props) {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')

  const [units, setUnits] = useState<ProductSaleUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductSaleUnit | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Catálogo SUNAT N°03 (TenantUnit) para que cada SaleUnit elija su propia unidad comercial —
  // mismo catálogo que ya usa ProductsPage.tsx para la unidad base del producto.
  const [catalogUnits, setCatalogUnits] = useState<Unit[]>([])

  // Precios por sucursal (Fase 7D) de una SaleUnit puntual — solo aplica a filas ya guardadas.
  const [branchPricesFor, setBranchPricesFor] = useState<ProductSaleUnit | null>(null)

  const load = useCallback(() => {
    if (!productId) return
    setLoading(true)
    Promise.all([productsService.listSaleUnits(productId, { all: true }), productsService.listUnits()])
      .then(([list, unitsList]) => {
        setUnits(Array.isArray(list) ? list : [])
        setCatalogUnits(Array.isArray(unitsList) ? unitsList : [])
      })
      .catch(() => toast.error('Error al cargar las unidades de venta'))
      .finally(() => setLoading(false))
  }, [productId])

  useEffect(() => {
    if (open) {
      load()
    } else {
      // Si el modal se cierra (incluso en cascada, porque el Panel avanzado que lo contiene se
      // cerró) no debe quedar un sub-panel de BranchPrices abierto con un productId obsoleto.
      setBranchPricesFor(null)
    }
  }, [open, load])

  const handleChangeRow = (index: number, patch: Partial<ProductSaleUnit>) => {
    setUnits((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, ...patch } : r))
      // Solo puede haber una unidad base a la vez — el backend también lo garantiza
      // (clearOtherBaseSaleUnitsTx), pero reflejarlo aquí evita un segundo "click" confuso.
      if (patch.is_base === true) {
        return next.map((r, i) => (i === index ? { ...r, conversion_factor: 1 } : { ...r, is_base: false }))
      }
      return next
    })
  }

  const handleAddRow = () => {
    setUnits((prev) => [...prev, emptyRow(prev.length)])
  }

  const handleRemoveRow = (index: number) => {
    const row = units[index]
    if (row.id) {
      setDeleteTarget(row)
      return
    }
    // Fila nueva sin guardar todavía: no existe en el backend, no requiere confirmación ni permiso.
    setUnits((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    // Salvavidas defensivo: con el guard de `open` en ProductsPage.tsx esto ya no debería ser
    // alcanzable, pero evita en cualquier caso enviar una mutación contra el producto "0".
    if (!productId) {
      toast.error('No se encontró el producto — cierra y vuelve a intentarlo')
      return
    }
    // Descarta filas nuevas que el usuario dejó completamente vacías (mismo criterio que
    // ProductPresentationsEditor: una fila sin nombre no se envía).
    const rows = units.filter((u) => u.id || u.name.trim().length > 0)
    for (const u of rows) {
      const err = validateRow(u)
      if (err) {
        toast.error(err)
        return
      }
    }
    setSaving(true)
    try {
      // Solo se envían las filas que el usuario realmente tiene permiso de guardar: nuevas
      // (products.create) o existentes (products.edit). Si el botón está visible es porque al
      // menos uno de los dos es true, pero no necesariamente ambos.
      const toSave = rows.filter((u) => (u.id ? canEdit : canCreate))
      const results = await Promise.allSettled(
        toSave.map((u) => {
          const payload: ProductSaleUnit = {
            name: u.name.trim(),
            unit_id: u.unit_id ?? null,
            conversion_factor: u.conversion_factor,
            is_base: u.is_base,
            allow_fraction: u.allow_fraction,
            price1: u.price1,
            price2: u.price2 ?? null,
            price3: u.price3 ?? null,
            sort_order: u.sort_order ?? 0,
            active: u.active,
          }
          return u.id
            ? productsService.updateSaleUnit(productId, u.id, payload)
            : productsService.createSaleUnit(productId, payload)
        }),
      )
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? errorMessage(failed[0].reason, 'No se pudo guardar una unidad de venta')
            : `${failed.length} unidades de venta no se pudieron guardar`,
        )
      } else {
        toast.success('Unidades de venta guardadas')
      }
      load()
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!deleteTarget?.id) return
    setDeleting(true)
    try {
      await productsService.deleteSaleUnit(productId, deleteTarget.id)
      toast.success('Unidad de venta eliminada')
      setUnits((prev) => prev.filter((u) => u.id !== deleteTarget.id))
      setDeleteTarget(null)
      onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo eliminar la unidad de venta'))
    } finally {
      setDeleting(false)
    }
  }

  const handleClose = () => {
    if (saving) return
    onClose()
  }

  return (
    <>
      <Modal
        open={open}
        onClose={handleClose}
        stacked
        contentClassName="max-w-2xl max-h-[min(92dvh,760px)] flex flex-col"
        closeOnBackdropClick={!saving}
      >
        <div className="flex flex-col flex-1 min-h-0 -mx-1">
          <div className="pb-3 border-b border-gray-100 shrink-0">
            <h3 className="font-bold text-gray-900 text-lg">Unidades de venta</h3>
            {productName ? <p className="text-sm text-gray-500 mt-0.5 truncate">{productName}</p> : null}
          </div>
          <div className="py-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
              </div>
            ) : (
              <SaleUnitsEditor
                units={units}
                catalogUnits={catalogUnits}
                baseUnitLabel={baseUnitLabel}
                canCreate={canCreate}
                canEdit={canEdit}
                canDelete={canDelete}
                onChangeRow={handleChangeRow}
                onAddRow={handleAddRow}
                onRemoveRow={handleRemoveRow}
                onManageBranchPrices={setBranchPricesFor}
              />
            )}
          </div>
          <div className="pt-3 border-t border-gray-100 flex gap-2 shrink-0">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="flex-1 min-h-[48px] py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cerrar
            </button>
            {canCreate || canEdit ? (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || loading}
                className="flex-1 min-h-[48px] py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            ) : null}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar unidad de venta"
        message={deleteTarget ? <>¿Eliminar la unidad de venta <strong>{deleteTarget.name}</strong>?</> : null}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        stacked
      />

      <SaleUnitBranchPricesPanel
        // Depende también de `open` (el propio SaleUnitsModal): si este se cierra en cascada
        // (porque el Panel avanzado que lo contiene se cerró), este panel no debe quedar operable
        // con el mismo productId obsoleto — mismo bug que motivó el guard de más arriba.
        open={open && !!branchPricesFor}
        productId={productId}
        saleUnitId={branchPricesFor?.id ?? 0}
        saleUnitName={branchPricesFor?.name}
        globalPrice1={branchPricesFor?.price1 ?? 0}
        globalPrice2={branchPricesFor?.price2}
        globalPrice3={branchPricesFor?.price3}
        onClose={() => setBranchPricesFor(null)}
      />
    </>
  )
}
