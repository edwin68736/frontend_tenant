import { useMemo, useState } from 'react'
import { Building2, ZoomIn } from 'lucide-react'
import { assetUrl, type PaymentConfigView } from '@/services/subscription.service'
import QrLightbox from './QrLightbox'

/** Colores de marca para el QR ampliado — solo cosmético, cae a un gris genérico si el método
 * no tiene una marca conocida (cualquier método nuevo que agreguen en la central). */
const QR_BRAND_STYLE: Record<string, { header: string }> = {
  yape: { header: 'bg-[#742284]' },
  plin: { header: 'bg-[#00A19A]' },
}

/**
 * Métodos de pago configurados en la central (panel Cobros SaaS → Métodos de pago): cada método
 * puede tener su propio QR (opcional) o mostrar la lista de cuentas bancarias, según su tipo.
 * Antes esto mostraba SIEMPRE todos los QR y TODAS las cuentas bancarias juntos, sin importar
 * qué método eligiera el tenant en el <select> — ahora se filtra por `selectedMethodKey`: nada
 * se muestra hasta elegir un método, y solo se ve lo que corresponde a ese método puntual.
 * Se usa tanto en el formulario de pago de SubscriptionPage como en PlanPickerModal.
 */
export default function PaymentMethodsPanel({
  cfg,
  selectedMethodKey,
}: {
  cfg: PaymentConfigView
  selectedMethodKey: string
}) {
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const selected = useMemo(
    () => cfg.methods.find(m => m.key === selectedMethodKey),
    [cfg.methods, selectedMethodKey],
  )

  if (!selected) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 px-4 py-3 text-xs text-gray-500">
        Elige un método de pago para ver el QR o las cuentas bancarias.
      </div>
    )
  }

  const brand = QR_BRAND_STYLE[selected.key] ?? { header: 'bg-gray-700' }
  const qrUrl = selected.kind === 'qr' && selected.qr_url ? assetUrl(selected.qr_url) : ''

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">{selected.label}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {selected.kind === 'qr' ? 'Escanea el código QR' : 'Transfiere o deposita a alguna de estas cuentas'}
          </p>
        </div>

        <div className="p-4">
          {selected.kind === 'qr' && (
            qrUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="w-full text-left rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 ring-gray-300 max-w-[220px]"
              >
                <div className={`px-3 py-2 ${brand.header}`}>
                  <span className="text-sm font-bold text-white">{selected.label}</span>
                </div>
                <div className="p-3 bg-white flex flex-col items-center gap-2">
                  <img src={qrUrl} alt={`QR ${selected.label}`} className="h-28 w-full object-contain" />
                  <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                    <ZoomIn size={12} />
                    Toca para ampliar, descargar o compartir
                  </span>
                </div>
              </button>
            ) : (
              <p className="text-xs text-gray-500">
                Todavía no hay un QR cargado para {selected.label}. Contacta a soporte para coordinar el pago.
              </p>
            )
          )}

          {selected.kind === 'bank_account' && (
            cfg.bank_accounts.length > 0 ? (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-gray-500 uppercase flex items-center gap-1">
                  <Building2 size={12} />
                  Cuentas bancarias
                </p>
                {cfg.bank_accounts.map((b, i) => (
                  <div key={i} className="rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-xs text-gray-700 space-y-0.5">
                    <p className="font-semibold text-gray-900">{b.bank}</p>
                    {b.holder && <p className="text-gray-600">Titular: {b.holder}</p>}
                    <p className="font-mono text-sm">{b.account_number}</p>
                    {b.cci && <p className="text-gray-500">CCI: {b.cci}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500">
                Todavía no hay cuentas bancarias configuradas. Contacta a soporte para coordinar el pago.
              </p>
            )
          )}
        </div>
      </div>

      {lightboxOpen && qrUrl && (
        <QrLightbox
          open
          onClose={() => setLightboxOpen(false)}
          url={qrUrl}
          title={selected.label}
          accentClass={brand.header}
        />
      )}
    </>
  )
}
