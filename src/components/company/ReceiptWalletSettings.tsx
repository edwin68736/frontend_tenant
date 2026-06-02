import { useEffect, useRef, useState } from 'react'
import { ImagePlus, QrCode, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { companyService, type CompanyConfig } from '@/services/company.service'

const PROVIDERS = [
  { value: '', label: 'Sin QR de pago' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
]

export function ReceiptWalletSettings() {
  const [form, setForm] = useState<Partial<CompanyConfig>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const qrInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    companyService
      .getConfig()
      .then(setForm)
      .catch(() => toast.error('Error cargando configuración de comprobantes'))
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof CompanyConfig>(k: K, v: CompanyConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleQrFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Selecciona una imagen (PNG, JPG, etc.)')
      return
    }
    setUploadingQr(true)
    void companyService
      .uploadReceiptWalletQr(file)
      .then((r) => {
        set('wallet_qr_url', r.wallet_qr_url)
        toast.success('QR guardado en el servidor')
      })
      .catch((err: unknown) => {
        const msg =
          (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
          'No se pudo subir el QR'
        toast.error(msg)
      })
      .finally(() => setUploadingQr(false))
  }

  const qrPreviewSrc = form.wallet_qr_url
    ? form.wallet_qr_url.startsWith('data:')
      ? form.wallet_qr_url
      : resolvePublicAssetUrl(form.wallet_qr_url)
    : ''

  const handleSave = async () => {
    const provider = String(form.wallet_provider ?? '').trim().toLowerCase()
    const phone = String(form.wallet_phone ?? '').trim()
    const hasQr = Boolean(form.wallet_qr_url?.trim())
    if (provider && (!phone || !hasQr)) {
      toast.error('Indique número y QR si elige Yape o Plin')
      return
    }
    setSaving(true)
    try {
      await companyService.updateReceiptWallet({
        wallet_provider: provider,
        wallet_phone: phone,
        wallet_qr_url: form.wallet_qr_url ?? '',
        wallet_show_on_a4: Boolean(form.wallet_show_on_a4),
        wallet_show_on_ticket: Boolean(form.wallet_show_on_ticket),
      })
      toast.success('Comprobantes actualizados')
    } catch (e: unknown) {
      toast.error((e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const provider = String(form.wallet_provider ?? '')

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <QrCode size={20} className="text-violet-600" />
        <div>
          <h3 className="text-lg font-bold text-gray-800">Comprobantes — QR Yape / Plin</h3>
          <p className="text-sm text-gray-500">
            Opcional en PDF locales. Por defecto oculto hasta activarlo por formato.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Billetera</label>
          <select
            value={provider}
            onChange={(e) => set('wallet_provider', e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value || 'none'} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Número celular</label>
          <input
            value={form.wallet_phone ?? ''}
            onChange={(e) => set('wallet_phone', e.target.value)}
            placeholder="Ej. 987654321"
            disabled={!provider}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Imagen QR</label>
        <div className="flex flex-wrap items-start gap-4">
          {form.wallet_qr_url ? (
            <div className="relative">
              <img
                src={qrPreviewSrc}
                alt="QR de pago"
                className="w-28 h-28 object-contain border border-gray-200 rounded-xl bg-white p-1"
                onError={() =>
                  toast.error('No se pudo mostrar el QR. Verifique que Nginx reenvíe /uploads al backend.')
                }
              />
              <button
                type="button"
                onClick={() => {
                  set('wallet_qr_url', '')
                  if (qrInputRef.current) qrInputRef.current.value = ''
                }}
                className="absolute -top-2 -right-2 p-1 rounded-full bg-gray-800 text-white"
                aria-label="Quitar QR"
              >
                <X size={12} />
              </button>
            </div>
          ) : null}
          <label
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed text-sm cursor-pointer ${
              provider && !uploadingQr
                ? 'border-gray-300 hover:bg-gray-50'
                : 'border-gray-200 opacity-50 pointer-events-none'
            }`}
          >
            <ImagePlus size={16} />
            {uploadingQr ? 'Subiendo…' : 'Subir QR'}
            <input
              ref={qrInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={!provider || uploadingQr}
              onChange={handleQrFile}
            />
          </label>
        </div>
      </div>

      <div className="border-t border-gray-100 pt-4 space-y-2">
        <p className="text-sm font-semibold text-gray-800">Mostrar en comprobantes PDF</p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(form.wallet_show_on_a4)}
            onChange={(e) => set('wallet_show_on_a4', e.target.checked)}
            disabled={!provider}
            className="rounded"
          />
          <span className="text-sm text-gray-700">PDF formato A4</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(form.wallet_show_on_ticket)}
            onChange={(e) => set('wallet_show_on_ticket', e.target.checked)}
            disabled={!provider}
            className="rounded"
          />
          <span className="text-sm text-gray-700">PDF formato ticket (rollo)</span>
        </label>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-[rgb(var(--p600))] text-white rounded-xl text-sm font-medium disabled:opacity-50"
        >
          <Save size={15} />
          {saving ? 'Guardando…' : 'Guardar comprobantes'}
        </button>
      </div>
    </div>
  )
}
