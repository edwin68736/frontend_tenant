import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  accountingService, type AccountingDefaults, type AccountingSettings, type SireSettingsView,
} from '@/services/accounting.service'
import { errMessage } from '@/utils/accountingExport'
import { AccountingPage, Card, Field, Spinner, btnPrimary, inputCls } from '@/components/accounting/AccountingUi'

const EMPTY: AccountingSettings = {
  receivable_pen: '', receivable_usd: '', igv_sales_pen: '', igv_sales_usd: '', taxed_pen: '', taxed_usd: '',
  exonerated: '', unaffected: '', exportation: '', icbper: '', payable_pen: '', payable_usd: '', igv_purchases: '',
  purchase_cost: '', subdiario_sales: '',
}

type Row = { key: keyof AccountingSettings; label: string; def?: keyof AccountingDefaults }
const SALES_ROWS: Row[] = [
  { key: 'receivable_pen', label: 'Cuenta por cobrar (total) – Soles', def: 'ReceivablePEN' },
  { key: 'receivable_usd', label: 'Cuenta por cobrar (total) – Dólares', def: 'ReceivableUSD' },
  { key: 'igv_sales_pen', label: 'IGV ventas – Soles', def: 'IgvSalesPEN' },
  { key: 'igv_sales_usd', label: 'IGV ventas – Dólares', def: 'IgvSalesUSD' },
  { key: 'taxed_pen', label: 'Ingresos operaciones gravadas – Soles', def: 'TaxedPEN' },
  { key: 'taxed_usd', label: 'Ingresos operaciones gravadas – Dólares', def: 'TaxedUSD' },
  { key: 'exonerated', label: 'Ingresos operaciones exoneradas', def: 'Exonerated' },
  { key: 'unaffected', label: 'Ingresos operaciones inafectas', def: 'Unaffected' },
  { key: 'exportation', label: 'Ingresos por exportación', def: 'Exportation' },
  { key: 'icbper', label: 'ICBPER (bolsas plásticas)', def: 'Icbper' },
  { key: 'subdiario_sales', label: 'Subdiario de ventas (Concar)', def: 'SubdiarioSales' },
]

/** Configuración: cuentas contables de los formatos y credenciales SIRE. */
export default function SettingsPage() {
  const [form, setForm] = useState<AccountingSettings>(EMPTY)
  const [defaults, setDefaults] = useState<AccountingDefaults | null>(null)
  const [sire, setSire] = useState<SireSettingsView | null>(null)
  const [sireForm, setSireForm] = useState({ client_id: '', client_secret: '', sol_username: '', sol_password: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([accountingService.getSettings(), accountingService.sireSettings()])
      .then(([s, sr]) => {
        setForm({ ...EMPTY, ...s.settings })
        setDefaults(s.defaults)
        setSire(sr)
        setSireForm((f) => ({ ...f, client_id: sr.client_id, sol_username: sr.sol_username }))
      })
      .catch((e) => toast.error(errMessage(e)))
      .finally(() => setLoading(false))
  }, [])

  const saveAccounts = async () => {
    setSaving(true)
    try {
      setForm({ ...EMPTY, ...(await accountingService.saveSettings(form)) })
      toast.success('Cuentas contables guardadas')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const saveSire = async () => {
    setSaving(true)
    try {
      const v = await accountingService.saveSireSettings(sireForm)
      setSire(v)
      setSireForm((f) => ({ ...f, client_secret: '', sol_password: '' }))
      toast.success('Credenciales SIRE guardadas (cifradas)')
    } catch (e) {
      toast.error(errMessage(e))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner text="Cargando configuración…" />
  return (
    <AccountingPage title="Configuración de Contabilidad" subtitle="Cuentas de los formatos de exportación y credenciales de SUNAT SIRE.">
      <Card>
        <h2 className="font-semibold text-gray-800 mb-1">Cuentas contables (ventas)</h2>
        <p className="text-xs text-gray-500 mb-3">
          Si dejas una cuenta vacía se usa el valor por defecto que se muestra como ayuda. Se guardan como texto (no pierden el cero inicial).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {SALES_ROWS.map((r) => (
            <Field key={r.key} label={r.label}>
              <input
                className={inputCls}
                value={form[r.key]}
                placeholder={defaults && r.def ? defaults[r.def] : ''}
                maxLength={r.key === 'subdiario_sales' ? 5 : 20}
                onChange={(e) => setForm((f) => ({ ...f, [r.key]: e.target.value }))}
              />
            </Field>
          ))}
        </div>
        <div className="mt-4">
          <button type="button" className={btnPrimary} disabled={saving} onClick={() => void saveAccounts()}>
            <Save size={16} /> Guardar cuentas
          </button>
        </div>
      </Card>

      <Card>
        <h2 className="font-semibold text-gray-800 mb-1">Credenciales SIRE (SUNAT)</h2>
        <p className="text-xs text-gray-500 mb-3">
          Se guardan cifradas y nunca se vuelven a mostrar. Deja un secreto vacío para conservar el guardado. El usuario SOL va completo
          (RUC + usuario, p. ej. 20123456789MODDATOS).
        </p>
        {sire && !sire.encryption_ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 mb-3">
            El servidor no tiene configurada la clave de cifrado de secretos; no se podrán guardar credenciales.
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Client ID">
            <input className={inputCls} value={sireForm.client_id} onChange={(e) => setSireForm((f) => ({ ...f, client_id: e.target.value }))} />
          </Field>
          <Field label={`Client secret ${sire?.has_client_secret ? '(guardado)' : ''}`}>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={sireForm.client_secret}
              placeholder={sire?.has_client_secret ? '••••••••' : ''}
              onChange={(e) => setSireForm((f) => ({ ...f, client_secret: e.target.value }))}
            />
          </Field>
          <Field label="Usuario SOL">
            <input className={inputCls} value={sireForm.sol_username} onChange={(e) => setSireForm((f) => ({ ...f, sol_username: e.target.value }))} />
          </Field>
          <Field label={`Clave SOL ${sire?.has_sol_password ? '(guardada)' : ''}`}>
            <input
              type="password"
              autoComplete="new-password"
              className={inputCls}
              value={sireForm.sol_password}
              placeholder={sire?.has_sol_password ? '••••••••' : ''}
              onChange={(e) => setSireForm((f) => ({ ...f, sol_password: e.target.value }))}
            />
          </Field>
        </div>
        <div className="mt-4">
          <button type="button" className={btnPrimary} disabled={saving || (sire ? !sire.encryption_ok : false)} onClick={() => void saveSire()}>
            <Save size={16} /> Guardar credenciales
          </button>
        </div>
      </Card>
    </AccountingPage>
  )
}
