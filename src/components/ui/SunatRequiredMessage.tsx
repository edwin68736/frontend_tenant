import { FileText } from 'lucide-react'

/**
 * Mensaje que se muestra cuando la facturación electrónica no está habilitada.
 * La habilitación se controla desde el panel central (plan, migración).
 */
export default function SunatRequiredMessage() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center max-w-md mx-auto">
      <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mb-4">
        <FileText size={32} className="text-amber-600" />
      </div>
      <h3 className="text-lg font-bold text-gray-800 mb-2">Facturación electrónica no habilitada</h3>
      <p className="text-gray-600 text-sm">
        Para usar esta funcionalidad debe migrar o mejorar su plan para habilitar la facturación electrónica.
      </p>
      <p className="text-gray-500 text-xs mt-3">
        Mientras tanto, puede emitir <strong>Notas de venta</strong>. La habilitación de facturas, boletas y guías de remisión se gestiona desde el panel central de administración.
      </p>
    </div>
  )
}
