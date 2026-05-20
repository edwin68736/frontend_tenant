import { Plus, Trash2, User, ImagePlus } from 'lucide-react'
import { getContactPhotoUrl } from '@/services/contacts.service'

export type ContactPersonDraft = {
  key: string
  name: string
  phone: string
  email: string
  relationship: string
}

type Props = {
  contactType: 'customer' | 'supplier' | 'both'
  photoPreview: string
  onPhotoChange: (file: File | null) => void
  persons: ContactPersonDraft[]
  onPersonsChange: (persons: ContactPersonDraft[]) => void
}

const PERSON_LABEL: Record<string, { photo: string; contacts: string; add: string }> = {
  customer: {
    photo: 'Foto del cliente (opcional)',
    contacts: 'Contactos del cliente',
    add: 'Agregar contacto',
  },
  supplier: {
    photo: 'Foto del proveedor (opcional)',
    contacts: 'Contactos del proveedor',
    add: 'Agregar contacto',
  },
  both: {
    photo: 'Foto (opcional)',
    contacts: 'Personas de contacto',
    add: 'Agregar contacto',
  },
}

export function newContactPersonRow(): ContactPersonDraft {
  return {
    key: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    name: '',
    phone: '',
    email: '',
    relationship: '',
  }
}

export function ContactFormExtras({ contactType, photoPreview, onPhotoChange, persons, onPersonsChange }: Props) {
  const labels = PERSON_LABEL[contactType] ?? PERSON_LABEL.both

  const updatePerson = (key: string, field: keyof ContactPersonDraft, value: string) => {
    onPersonsChange(persons.map(p => (p.key === key ? { ...p, [field]: value } : p)))
  }

  const removePerson = (key: string) => {
    onPersonsChange(persons.filter(p => p.key !== key))
  }

  const addPerson = () => {
    onPersonsChange([...persons, newContactPersonRow()])
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    onPhotoChange(file)
    e.target.value = ''
  }

  const previewSrc = photoPreview.startsWith('blob:') || photoPreview.startsWith('http')
    ? photoPreview
    : getContactPhotoUrl(photoPreview)

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-2">{labels.photo}</label>
        <div className="flex flex-col sm:flex-row gap-4 items-start">
          <div className="w-28 h-28 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
            {previewSrc ? (
              <img src={previewSrc} alt="Vista previa" className="w-full h-full object-cover" />
            ) : (
              <User size={36} className="text-gray-300" />
            )}
          </div>
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
            <ImagePlus size={16} />
            Seleccionar imagen
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
          </label>
        </div>
        <p className="text-xs text-gray-400 mt-1">JPG, PNG o WebP. Máximo 5 MB.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">{labels.contacts}</label>
          <button
            type="button"
            onClick={addPerson}
            className="inline-flex items-center gap-1 text-xs font-medium text-[rgb(var(--p600))] hover:opacity-80"
          >
            <Plus size={14} />
            {labels.add}
          </button>
        </div>
        {persons.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-xl">
            No hay contactos adicionales. Usa «{labels.add}» para añadir uno.
          </p>
        ) : (
          <div className="space-y-3">
            {persons.map((p, idx) => (
              <div key={p.key} className="p-3 border border-gray-100 rounded-xl bg-gray-50/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-500">Contacto {idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removePerson(p.key)}
                    className="p-1 text-gray-400 hover:text-red-500 rounded-lg"
                    title="Quitar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-0.5">Nombre *</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={p.name}
                      onChange={e => updatePerson(p.key, 'name', e.target.value)}
                      placeholder="Nombre del contacto"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Teléfono</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={p.phone}
                      onChange={e => updatePerson(p.key, 'phone', e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-0.5">Correo</label>
                    <input
                      type="email"
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={p.email}
                      onChange={e => updatePerson(p.key, 'email', e.target.value)}
                      placeholder="Opcional"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs text-gray-500 mb-0.5">Parentesco / cargo</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm"
                      value={p.relationship}
                      onChange={e => updatePerson(p.key, 'relationship', e.target.value)}
                      placeholder="Ej. Gerente, Esposo/a, Compras"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
