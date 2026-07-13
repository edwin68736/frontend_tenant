import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ExternalLink, ImagePlus, Pencil, QrCode, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import { cashbankService, type BankAccount } from '@/services/cashbank.service'
import { companyService, type CompanyConfig } from '@/services/company.service'
import { parseReceiptBankAccountIds } from '@/utils/receiptBankAccounts'
import { BankAccountEditModal } from '@/components/company/BankAccountEditModal'

const PROVIDERS = [
  { value: '', label: 'Sin QR de pago' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
]

export function ReceiptWalletSettings() {
  const [form, setForm] = useState<Partial<CompanyConfig>>({})
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [selectedBankIds, setSelectedBankIds] = useState<Set<number>>(new Set())
  const [banksFilterConfigured, setBanksFilterConfigured] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingQr, setUploadingQr] = useState(false)
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null)
  const qrInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all([
      companyService.getConfig(),
      cashbankService.listBankAccounts(true).catch(() => [] as BankAccount[]),
    ])
      .then(([cfg, accounts]) => {
        setForm(cfg)
        const active = (accounts ?? []).filter((a) => a.active !== false)
        setBankAccounts(active)
        const parsed = parseReceiptBankAccountIds(cfg.receipt_bank_account_ids)
        if (parsed === null) {
          setBanksFilterConfigured(false)
          setSelectedBankIds(new Set(active.map((a) => a.id)))
        } else {
          setBanksFilterConfigured(true)
          setSelectedBankIds(new Set(parsed))
        }
      })
      .catch(() => toast.error('Error cargando configuración de comprobantes'))
      .finally(() => setLoading(false))
  }, [])

  const set = <K extends keyof CompanyConfig>(k: K, v: CompanyConfig[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const toggleBank = (id: number) => {
    setBanksFilterConfigured(true)
    setSelectedBankIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAllBanks = () => {
    setBanksFilterConfigured(true)
    setSelectedBankIds(new Set(bankAccounts.map((a) => a.id)))
  }

  const clearAllBanks = () => {
    setBanksFilterConfigured(true)
    setSelectedBankIds(new Set())
  }

  const handleAccountSaved = (updated: BankAccount) => {
    if (updated.active === false) {
      // Se desactivó: sale de la lista de cuentas para comprobantes.
      setBankAccounts((prev) => prev.filter((a) => a.id !== updated.id))
      setSelectedBankIds((prev) => {
        const next = new Set(prev)
        next.delete(updated.id)
        return next
      })
      return
    }
    setBankAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
  }

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
    const receiptBankIds = banksFilterConfigured
      ? Array.from(selectedBankIds).sort((a, b) => a - b)
      : bankAccounts.map((a) => a.id).sort((a, b) => a - b)

    setSaving(true)
    try {
      await companyService.updateReceiptWallet({
        wallet_provider: provider,
        wallet_phone: phone,
        wallet_qr_url: form.wallet_qr_url ?? '',
        wallet_show_on_a4: Boolean(form.wallet_show_on_a4),
        wallet_show_on_ticket: Boolean(form.wallet_show_on_ticket),
        receipt_bank_account_ids: receiptBankIds,
      })
      setBanksFilterConfigured(true)
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
    <div className="space-y-5 max-w-3xl">
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-violet-50 text-violet-700 flex items-center justify-center">
            <QrCode size={18} />
          </div>
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
      </section>

      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <Building2 size={18} />
          </div>
          <div>
            <Link
              to="/cashbank/bank"
              className="group inline-flex items-center gap-1.5 text-lg font-bold text-gray-800 hover:text-[rgb(var(--p700))]"
            >
              Cuentas bancarias en comprobantes
              <ExternalLink
                size={15}
                className="text-gray-400 group-hover:text-[rgb(var(--p600))]"
                aria-hidden
              />
            </Link>
            <p className="text-sm text-gray-500">
              Elija qué cuentas aparecen en ticket y PDF. Las demás no se imprimen.
            </p>
          </div>
        </div>

        {bankAccounts.length === 0 ? (
          <p className="text-sm text-gray-500 rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
            No hay cuentas bancarias activas. Créelas en Caja y bancos → Cuentas / Bancos.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={selectAllBanks}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Marcar todas
              </button>
              <button
                type="button"
                onClick={clearAllBanks}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Quitar todas
              </button>
            </div>
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {bankAccounts.map((acc) => {
                const label = [acc.bank_name, acc.name].filter(Boolean).join(' — ') || acc.name || 'Cuenta'
                const checked = selectedBankIds.has(acc.id)
                return (
                  <li
                    key={acc.id}
                    className="flex items-stretch gap-1 rounded-xl border border-gray-200 hover:bg-gray-50/80"
                  >
                    <label className="flex min-w-0 flex-1 items-start gap-3 cursor-pointer px-3 py-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleBank(acc.id)}
                        className="mt-0.5 rounded border-gray-300 text-[rgb(var(--p600))]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-800">{label}</span>
                        {acc.account_number ? (
                          <span className="block text-xs text-gray-500 font-mono mt-0.5">
                            Cta: {acc.account_number} ({acc.currency || 'PEN'})
                          </span>
                        ) : null}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setEditingAccount(acc)}
                      className="my-2 mr-2 flex shrink-0 items-center gap-1 self-start rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-white hover:text-[rgb(var(--p700))]"
                      aria-label={`Editar ${label}`}
                    >
                      <Pencil size={13} aria-hidden />
                      <span className="hidden sm:inline">Editar</span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="text-xs text-gray-500">
              {selectedBankIds.size === 0
                ? 'Sin cuentas seleccionadas: no se mostrará información bancaria en los comprobantes.'
                : `${selectedBankIds.size} cuenta(s) seleccionada(s) para ticket y PDF.`}
            </p>
          </>
        )}
      </section>

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

      <BankAccountEditModal
        open={editingAccount !== null}
        account={editingAccount}
        onClose={() => setEditingAccount(null)}
        onSaved={handleAccountSaved}
      />
    </div>
  )
}
