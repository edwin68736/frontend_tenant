import RequireModule from '@/components/ui/RequireModule'
import { ContactsContent } from './ContactsPage'

/** Proveedores — misma gestión que clientes, filtrado por tipo supplier. */
export default function SuppliersPage() {
  return (
    <RequireModule moduleKey="contacts">
      <ContactsContent
        contactType="supplier"
        pageTitle="Proveedores"
        pageSubtitle="Gestión de contactos tipo proveedor"
      />
    </RequireModule>
  )
}
