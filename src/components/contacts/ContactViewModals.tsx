import { User, Mail, Phone, Users } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import {
  getContactPhotoUrl,
  type Contact,
  type ContactPerson,
} from '@/services/contacts.service'
import { formatTipoDocIdentidadDisplay } from '@/constants/sunat'

type PersonsModalProps = {
  open: boolean
  onClose: () => void
  contact: Contact | null
  persons: ContactPerson[]
  loading: boolean
  entityLabel: string
}

export function ContactPersonsModal({
  open,
  onClose,
  contact,
  persons,
  loading,
  entityLabel,
}: PersonsModalProps) {
  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-lg">
      <h3 className="font-bold text-gray-800 text-lg mb-1">Contactos del {entityLabel}</h3>
      {contact && (
        <p className="text-sm text-gray-500 mb-4">{contact.business_name}</p>
      )}
      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : persons.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No hay contactos adicionales registrados.</p>
      ) : (
        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
          {persons.map((p, i) => (
            <div key={p.id ?? i} className="p-3 rounded-xl border border-gray-100 bg-gray-50/80">
              <p className="font-medium text-gray-800">{p.name}</p>
              {p.relationship && (
                <p className="text-xs text-gray-500 mt-0.5">{p.relationship}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-sm text-gray-600">
                {p.phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone size={13} className="text-gray-400" />
                    {p.phone}
                  </span>
                )}
                {p.email && (
                  <span className="inline-flex items-center gap-1">
                    <Mail size={13} className="text-gray-400" />
                    {p.email}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

type DetailModalProps = {
  open: boolean
  onClose: () => void
  contact: Contact | null
  loading: boolean
  entityLabel: string
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  const v = (value ?? '').trim()
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{v || '—'}</p>
    </div>
  )
}

export function ContactDetailModal({ open, onClose, contact, loading, entityLabel }: DetailModalProps) {
  const photoSrc = contact?.photo_url ? getContactPhotoUrl(contact.photo_url) : ''
  const persons = contact?.contact_persons ?? []

  return (
    <Modal open={open} onClose={onClose} contentClassName="max-w-2xl max-h-[90vh] overflow-y-auto">
      <h3 className="font-bold text-gray-800 text-lg mb-1">Detalle del {entityLabel}</h3>
      {contact && !loading && (
        <p className="text-sm text-gray-500 mb-4">{contact.business_name}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contact ? (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="w-32 h-32 rounded-2xl border border-gray-100 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0 mx-auto sm:mx-0">
              {photoSrc ? (
                <img src={photoSrc} alt={contact.business_name} className="w-full h-full object-cover" />
              ) : (
                <User size={48} className="text-gray-300" />
              )}
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DetailRow label="Razón social / Nombre" value={contact.business_name} />
              <DetailRow label="Nombre comercial" value={contact.trade_name} />
              <DetailRow
                label="Documento"
                value={formatTipoDocIdentidadDisplay(contact.doc_type, contact.doc_number)}
              />
              <DetailRow label="Estado" value={contact.active ? 'Activo' : 'Inactivo'} />
              <DetailRow label="Teléfono" value={contact.phone} />
              <DetailRow label="Correo" value={contact.email} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 pt-2 border-t border-gray-100">
            <DetailRow label="Dirección" value={contact.address} />
            <DetailRow label="Ubigeo" value={contact.ubigeo} />
          </div>

          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Users size={16} className="text-gray-400" />
              <h4 className="text-sm font-semibold text-gray-700">Contactos adicionales</h4>
            </div>
            {persons.length === 0 ? (
              <p className="text-sm text-gray-400">Sin contactos adicionales.</p>
            ) : (
              <div className="space-y-2">
                {persons.map((p, i) => (
                  <div
                    key={p.id ?? i}
                    className="p-3 rounded-xl border border-gray-100 bg-gray-50/60 text-sm"
                  >
                    <p className="font-medium text-gray-800">{p.name}</p>
                    {p.relationship && (
                      <p className="text-xs text-gray-500">{p.relationship}</p>
                    )}
                    <div className="mt-1 flex flex-wrap gap-3 text-gray-600">
                      {p.phone && <span>Tel: {p.phone}</span>}
                      {p.email && <span>{p.email}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
