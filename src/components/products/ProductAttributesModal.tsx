import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/contexts/AuthContext'
import { ProductAttributesEditor } from '@/components/products/ProductAttributesEditor'
import { productsService, type ProductAttribute } from '@/services/products.service'

type Props = {
  open: boolean
  productId: number
  productName?: string
  onClose: () => void
  /** Se llama tras guardar o eliminar con éxito, para que el padre refresque su propio resumen. */
  onChanged?: () => void
}

function emptyRow(sortOrder: number): ProductAttribute {
  return { name: '', value: '', sort_order: sortOrder, active: true }
}

/** Clave normalizada para detectar duplicados igual que el backend: LOWER(name) + LOWER(value). */
function duplicateKey(a: Pick<ProductAttribute, 'name' | 'value'>): string {
  return JSON.stringify([a.name.trim().toLowerCase(), a.value.trim().toLowerCase()])
}

function validateRow(a: ProductAttribute): string | null {
  const name = a.name.trim()
  const value = a.value.trim()
  if (!name) return 'El nombre del atributo es obligatorio.'
  if (!value) return 'El valor del atributo es obligatorio.'
  if (name.length > 100) return 'El nombre del atributo no puede superar 100 caracteres.'
  if (value.length > 255) return 'El valor del atributo no puede superar 255 caracteres.'
  return null
}

function errorMessage(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { error?: string } } }
  return err?.response?.data?.error ?? fallback
}

/**
 * Gestión completa (crear/editar/eliminar) de los Attributes de un producto. Mismo patrón que
 * SaleUnitsModal (Fase 7B): CRUD REST real por fila (`/products/:id/attributes...`), sin pasar por
 * el guardado del producto — Attribute, igual que SaleUnit, tiene su propio endpoint dedicado.
 *
 * Solo tiene sentido para un producto ya existente (con id), gestionado desde el Panel avanzado.
 *
 * DELETE es un hard delete real (TenantProductAttribute no tiene `deleted_at`, confirmado en
 * product_service.go:1855-1863) — a diferencia de SaleUnit, que sí es soft delete. No cambia la UX
 * (de cualquier forma la fila desaparece de la lista), pero no hay que asumir que es reversible.
 */
export function ProductAttributesModal({ open, productId, productName, onClose, onChanged }: Props) {
  const { hasPermission } = useAuth()
  const canCreate = hasPermission('products.create')
  const canEdit = hasPermission('products.edit')
  const canDelete = hasPermission('products.delete')

  const [attributes, setAttributes] = useState<ProductAttribute[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProductAttribute | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    if (!productId) return
    setLoading(true)
    productsService
      .listAttributes(productId, { all: true })
      .then((list) => setAttributes(Array.isArray(list) ? list : []))
      .catch(() => toast.error('Error al cargar los atributos'))
      .finally(() => setLoading(false))
  }, [productId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const handleChangeRow = (index: number, patch: Partial<ProductAttribute>) => {
    setAttributes((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const handleAddRow = () => {
    setAttributes((prev) => [...prev, emptyRow(prev.length)])
  }

  const handleRemoveRow = (index: number) => {
    const row = attributes[index]
    if (row.id) {
      setDeleteTarget(row)
      return
    }
    // Fila nueva sin guardar todavía: no existe en el backend, no requiere confirmación ni permiso.
    setAttributes((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    // Salvavidas defensivo: con el guard de `open` en ProductsPage.tsx esto ya no debería ser
    // alcanzable, pero evita en cualquier caso enviar una mutación contra el producto "0".
    if (!productId) {
      toast.error('No se encontró el producto — cierra y vuelve a intentarlo')
      return
    }
    // Descarta filas nuevas que el usuario dejó completamente vacías, igual que en SaleUnits.
    const rows = attributes.filter((a) => a.id || a.name.trim().length > 0 || a.value.trim().length > 0)
    for (const a of rows) {
      const err = validateRow(a)
      if (err) {
        toast.error(err)
        return
      }
    }
    // Duplicados de nombre+valor dentro del propio guardado — feedback inmediato antes de llamar
    // al backend (que también lo valida, LOWER(name)+LOWER(value), como autoridad final).
    const seen = new Map<string, ProductAttribute>()
    for (const a of rows) {
      const key = duplicateKey(a)
      if (seen.has(key)) {
        toast.error(`"${a.name.trim()} = ${a.value.trim()}" está repetido — no puede combinarse dos veces en el mismo producto.`)
        return
      }
      seen.set(key, a)
    }

    setSaving(true)
    try {
      // Solo se envían las filas que el usuario realmente tiene permiso de guardar: nuevas
      // (products.create) o existentes (products.edit).
      const toSave = rows.filter((a) => (a.id ? canEdit : canCreate))
      const results = await Promise.allSettled(
        toSave.map((a) => {
          const payload: ProductAttribute = {
            name: a.name.trim(),
            value: a.value.trim(),
            sort_order: a.sort_order ?? 0,
            active: a.active,
          }
          return a.id
            ? productsService.updateAttribute(productId, a.id, payload)
            : productsService.createAttribute(productId, payload)
        }),
      )
      const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed.length > 0) {
        toast.error(
          failed.length === 1
            ? errorMessage(failed[0].reason, 'No se pudo guardar un atributo')
            : `${failed.length} atributos no se pudieron guardar`,
        )
      } else {
        toast.success('Atributos guardados')
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
      await productsService.deleteAttribute(productId, deleteTarget.id)
      toast.success('Atributo eliminado')
      setAttributes((prev) => prev.filter((a) => a.id !== deleteTarget.id))
      setDeleteTarget(null)
      onChanged?.()
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo eliminar el atributo'))
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
            <h3 className="font-bold text-gray-900 text-lg">Atributos</h3>
            {productName ? <p className="text-sm text-gray-500 mt-0.5 truncate">{productName}</p> : null}
          </div>
          <div className="py-4 flex-1 min-h-0 flex flex-col overflow-hidden">
            {loading ? (
              <div className="flex-1 flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-gray-300 border-t-[rgb(var(--p600))] rounded-full animate-spin" />
              </div>
            ) : (
              <ProductAttributesEditor
                attributes={attributes}
                canCreate={canCreate}
                canEdit={canEdit}
                canDelete={canDelete}
                onChangeRow={handleChangeRow}
                onAddRow={handleAddRow}
                onRemoveRow={handleRemoveRow}
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
        title="Eliminar atributo"
        message={
          deleteTarget ? (
            <>
              ¿Eliminar el atributo <strong>{deleteTarget.name}</strong> ({deleteTarget.value})? Esta
              acción no se puede deshacer.
            </>
          ) : null
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleting}
        stacked
      />
    </>
  )
}
