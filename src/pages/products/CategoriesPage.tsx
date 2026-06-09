import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, FolderTree } from 'lucide-react'
import RequireModule from '@/components/ui/RequireModule'
import { productsService, type Category } from '@/services/products.service'

export default function CategoriesPage() {
  return (
    <RequireModule moduleKey="products">
      <CategoriesContent />
    </RequireModule>
  )
}

function CategoriesContent() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    productsService
      .listCategories()
      .then(list => setCategories(Array.isArray(list) ? list : []))
      .catch(() => toast.error('Error al cargar categorías'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) {
      toast.error('Ingresa un nombre')
      return
    }
    setSaving(true)
    try {
      await productsService.createCategory(trimmed)
      setName('')
      toast.success('Categoría creada')
      load()
    } catch {
      toast.error('Error al crear categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <FolderTree size={20} className="text-primary-600" />
          Categorías
        </h2>
        <p className="text-sm text-gray-500">Organiza tu catálogo de productos y servicios.</p>
      </div>

      <div className="flex gap-2">
        <input
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm"
          placeholder="Nombre de la categoría"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && void handleCreate()}
        />
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={saving || !name.trim()}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Plus size={15} />
          {saving ? 'Guardando…' : 'Agregar'}
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-primary-600 rounded-full animate-spin" />
          </div>
        ) : categories.length === 0 ? (
          <p className="text-center py-12 text-gray-400 text-sm">No hay categorías registradas</p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {categories.map(c => (
              <li key={c.id} className="px-4 py-3 text-sm font-medium text-gray-800">
                {c.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
