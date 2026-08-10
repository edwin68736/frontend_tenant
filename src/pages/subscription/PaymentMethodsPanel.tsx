import { useState } from 'react'
import { Building2, ZoomIn } from 'lucide-react'
import { assetUrl, type PaymentConfigView } from '@/services/subscription.service'
import QrLightbox from './QrLightbox'

const METHOD_STYLE: Record<string, { pill: string; ring: string }> = {
  yape: {
    pill: 'bg-[#742284]/12 text-[#742284] border-[#742284]/25',
    ring: 'ring-[#742284]/40',
  },
  plin: {
    pill: 'bg-[#00A19A]/12 text-[#007A74] border-[#00A19A]/30',
    ring: 'ring-[#00A19A]/40',
  },
  transfer: {
    pill: 'bg-blue-50 text-blue-800 border-blue-200',
    ring: 'ring-blue-300',
  },
  bank_transfer: {
    pill: 'bg-blue-50 text-blue-800 border-blue-200',
    ring: 'ring-blue-300',
  },
}

const QR_BRANDS = {
  yape: { label: 'Yape', header: 'bg-[#742284]', accent: 'bg-[#742284]' },
  plin: { label: 'Plin', header: 'bg-[#00A19A]', accent: 'bg-[#00A19A]' },
} as const

function methodPillClass(key: string) {
  return METHOD_STYLE[key]?.pill ?? 'bg-gray-100 text-gray-700 border-gray-200'
}

type QrKind = keyof typeof QR_BRANDS

/**
 * Métodos de pago configurados en la central (panel Cobros SaaS → QR/cuentas): QR de Yape/Plin
 * ampliable con descarga y compartir (Yape permite cargar un QR desde imagen, no solo escanear
 * en vivo), métodos habilitados y cuentas bancarias. Se usa tanto en el formulario de pago de
 * SubscriptionPage como en PlanPickerModal, para que el tenant sepa cómo pagar sin salir del flujo.
 */
export default function PaymentMethodsPanel({ cfg }: { cfg: PaymentConfigView }) {
  const [lightbox, setLightbox] = useState<{ kind: QrKind; url: string } | null>(null)

  const qrItems = (['yape', 'plin'] as const).filter(kind => {
    const url = kind === 'yape' ? cfg.yape_qr_url : cfg.plin_qr_url
    return Boolean(url?.trim())
  })

  return (
    <>
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-50">
          <h3 className="text-sm font-semibold text-gray-800">Métodos de pago</h3>
          <p className="text-xs text-gray-500 mt-0.5">Escanea el QR o transfiere a las cuentas indicadas</p>
        </div>

        <div className="p-4 space-y-4">
          {qrItems.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {qrItems.map(kind => {
                const brand = QR_BRANDS[kind]
                const rawUrl = kind === 'yape' ? cfg.yape_qr_url : cfg.plin_qr_url
                const url = assetUrl(rawUrl ?? '')
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setLightbox({ kind, url })}
                    className={`text-left rounded-xl border overflow-hidden transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 ${METHOD_STYLE[kind]?.ring ?? 'ring-gray-300'}`}
                  >
                    <div className={`px-3 py-2 ${brand.header}`}>
                      <span className="text-sm font-bold text-white">{brand.label}</span>
                    </div>
                    <div className="p-3 bg-white flex flex-col items-center gap-2">
                      <img src={url} alt={`QR ${brand.label}`} className="h-28 w-full object-contain" />
                      <span className="text-[11px] text-gray-500 inline-flex items-center gap-1">
                        <ZoomIn size={12} />
                        Toca para ampliar, descargar o compartir
                      </span>
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {cfg.methods.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {cfg.methods.map(m => (
                <li
                  key={m.key}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-semibold ${methodPillClass(m.key)}`}
                >
                  {m.label}
                </li>
              ))}
            </ul>
          )}

          {cfg.bank_accounts.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase flex items-center gap-1">
                <Building2 size={12} />
                Transferencia bancaria
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
          )}
        </div>
      </div>

      {lightbox && (
        <QrLightbox
          open
          onClose={() => setLightbox(null)}
          url={lightbox.url}
          title={QR_BRANDS[lightbox.kind].label}
          accentClass={QR_BRANDS[lightbox.kind].accent}
        />
      )}
    </>
  )
}
