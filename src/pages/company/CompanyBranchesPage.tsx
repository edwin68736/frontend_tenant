import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, MapPin, ImagePlus, X } from 'lucide-react'
import { companyService, type BranchRow } from '@/services/company.service'
import { resolveCompanyLogoDisplayUrl } from '@/config/apiBaseUrl'
import { PlanLimitBanner } from '@/components/ui/PlanLimitBanner'
import { Modal } from '@/components/ui/Modal'

const empty = (): Partial<BranchRow> => ({
  name: '',
  address: '',
  phone: '',
  fiscal_domicile_code: '',
  is_main: false,
})

export default function CompanyBranchesPage() {
  const [branches, setBranches] = useState<BranchRow[]>([])
  const [loading, setLoading] = useState(true)
  const [show, setShow] = useState(false)
  const [editing, setEditing] = useState<BranchRow | null>(null)
  const [form, setForm] = useState<Partial<BranchRow>>(empty())
  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  const load = () =>
    companyService
      .listBranches()
      .then((d) => setBranches(d ?? []))
      .catch(() => toast.error('Error cargando sucursales'))
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  const openNew = () => {
    setEditing(null)
    setForm(empty())
    setShow(true)
  }

  const openEdit = (b: BranchRow) => {
    setEditing(b)
    setForm({
      name: b.name,
      address: b.address,
      phone: b.phone,
      fiscal_domicile_code: b.fiscal_domicile_code ?? '',
      is_main: b.is_main,
      logo_url: b.logo_url,
      logo_data_url: b.logo_data_url,
    })
    setShow(true)
  }

  const handleBranchLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editing) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen (PNG, JPG, etc.)')
      return
    }
    setUploadingLogo(true)
    void companyService
      .uploadBranchLogo(editing.id, file)
      .then((res) => {
        const logo_url = res.logo_url ?? res.data?.logo_url ?? ''
        setForm((f) => ({ ...f, logo_url, logo_data_url: res.data?.logo_data_url }))
        toast.success('Logo de la sucursal guardado')
        void load()
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        toast.error(err.response?.data?.error ?? 'Error al guardar el logo')
      })
      .finally(() => {
        setUploadingLogo(false)
        if (logoInputRef.current) logoInputRef.current.value = ''
      })
  }

  const clearBranchLogo = () => {
    if (!editing) return
    setUploadingLogo(true)
    void companyService
      .deleteBranchLogo(editing.id)
      .then(() => {
        setForm((f) => ({ ...f, logo_url: '', logo_data_url: '' }))
        if (logoInputRef.current) logoInputRef.current.value = ''
        toast.success('Logo de la sucursal eliminado')
        void load()
      })
      .catch((err: { response?: { data?: { error?: string } } }) => {
        toast.error(err.response?.data?.error ?? 'Error al quitar el logo')
      })
      .finally(() => setUploadingLogo(false))
  }

  const handleSave = async () => {
    if (!form.name?.trim()) {
      toast.error('Nombre requerido')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        address: form.address ?? '',
        phone: form.phone ?? '',
        fiscal_domicile_code: form.fiscal_domicile_code ?? '',
        is_main: form.is_main ?? false,
      }
      if (editing) await companyService.updateBranch(editing.id, payload)
      else await companyService.createBranch(payload)
      toast.success(editing ? 'Sucursal actualizada' : 'Sucursal creada')
      setShow(false)
      setLoading(true)
      load()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar esta sucursal?')) return
    try {
      await companyService.deleteBranch(id)
      toast.success('Sucursal eliminada')
      setLoading(true)
      load()
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al eliminar')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <PlanLimitBanner resource="branches" />
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Sucursales</h2>
          <p className="text-sm text-gray-500">Sedes y puntos de venta. Configure el domicilio fiscal por sucursal.</p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-4 py-2.5 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Plus size={15} /> Nueva sucursal
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {['Logo', 'Nombre', 'Dirección', 'Teléfono', 'Cód. domicilio fiscal', 'Principal', ''].map((h) => (
                  <th key={h || 'actions'} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {b.logo_data_url || b.logo_url ? (
                      <img
                        src={resolveCompanyLogoDisplayUrl(b.logo_data_url || b.logo_url)}
                        alt={`Logo ${b.name}`}
                        className="h-8 w-8 rounded-lg object-contain border border-gray-200 bg-white"
                      />
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    <span className="inline-flex items-center gap-2">
                      <MapPin size={14} className="text-gray-400" />
                      {b.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{b.address || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.phone || '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{b.fiscal_domicile_code?.trim() || '—'}</td>
                  <td className="px-4 py-3">
                    {b.is_main && (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">Principal</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => openEdit(b)}
                        className="p-1.5 text-gray-400 hover:text-[rgb(var(--p600))] hover:bg-[rgb(var(--p50))] rounded-lg"
                      >
                        <Pencil size={14} />
                      </button>
                      {!b.is_main && (
                        <button
                          type="button"
                          onClick={() => void handleDelete(b.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {branches.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm">No hay sucursales registradas</div>
        )}
      </div>

      <Modal open={show} onClose={() => setShow(false)} contentClassName="max-w-md w-full mx-2 sm:mx-0">
        <h3 className="font-bold text-gray-800">{editing ? 'Editar sucursal' : 'Nueva sucursal'}</h3>
        <div className="space-y-3 mt-3">
          {(
            [
              ['name', 'Nombre *'],
              ['address', 'Dirección'],
              ['phone', 'Teléfono'],
              ['fiscal_domicile_code', 'Código de domicilio fiscal'],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{label}</label>
              <input
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
                value={(form[k] as string) ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              />
            </div>
          ))}
          <p className="text-xs text-gray-500 -mt-1">
            Código de establecimiento anexo (domicilio fiscal) por sucursal. Se usa en facturación electrónica cuando aplica.
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.is_main ?? false}
              onChange={(e) => setForm((f) => ({ ...f, is_main: e.target.checked }))}
              className="rounded accent-[rgb(var(--p600))]"
            />
            Sucursal principal
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Logo de la sucursal</label>
            {editing ? (
              <div className="flex items-center gap-3">
                {form.logo_data_url || form.logo_url ? (
                  <img
                    src={resolveCompanyLogoDisplayUrl(form.logo_data_url || form.logo_url)}
                    alt="Logo de la sucursal"
                    className="h-12 w-12 rounded-lg object-contain border border-gray-200 bg-white"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-lg border border-dashed border-gray-300 flex items-center justify-center text-gray-300">
                    <ImagePlus size={18} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {form.logo_url ? 'Cambiar logo' : 'Cargar logo'}
                  </button>
                  {form.logo_url && (
                    <button
                      type="button"
                      onClick={clearBranchLogo}
                      disabled={uploadingLogo}
                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50"
                      title="Quitar logo"
                    >
                      <X size={14} />
                    </button>
                  )}
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBranchLogoFile}
                  />
                </div>
              </div>
            ) : (
              <p className="text-xs text-gray-500">Guarde la sucursal primero para poder cargarle un logo propio.</p>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Opcional. Si no se configura, los comprobantes de esta sucursal usan el logo general de la empresa
              (Ajustes → Empresa).
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShow(false)}
              className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
