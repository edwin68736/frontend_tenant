import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { clsx } from 'clsx'
import type { PrintData } from '@/types/printData'
import { formatMoney } from '@/utils/format'
import { getPrintIssuerAddress } from '@/utils/printIssuer'
import { receiptDocTypeTitle } from '@/utils/fiscalPrepayment'
import { resolveCompanyLogoDisplayUrl } from '@/config/apiBaseUrl'
import { isElectronicSunatCode } from '@/constants/sunat'
import { buildReceiptTotalLines } from '@/utils/receiptTotals'
import {
  receiptItemDisplayDescription,
  receiptItemDisplayTotal,
  receiptItemDisplayUnitPrice,
} from '@/utils/receiptBonificacion'
import { salePaymentMethodLabelEs } from '@/utils/paymentMethodLabels'
import { TUKIFAC_APP_NAME } from '@/lib/appVersion'

/**
 * Emulación en HTML del comprobante como "papel", para plataformas donde el PDF no
 * puede incrustarse (Android WebView). Simula visualmente que el usuario está viendo
 * el comprobante en PDF dentro del mismo modal. No reemplaza la impresión ni el PDF real.
 */
export function ReceiptPaperPreview({
  printData,
  format,
}: {
  printData: PrintData
  format: 'ticket' | 'a4'
}) {
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const showQr = isElectronicSunatCode(printData.sunat_code) && Boolean(printData.qr_data)

  useEffect(() => {
    let alive = true
    if (showQr) {
      QRCode.toDataURL(printData.qr_data, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
        .then((u) => alive && setQrUrl(u))
        .catch(() => alive && setQrUrl(null))
    } else {
      setQrUrl(null)
    }
    return () => {
      alive = false
    }
  }, [showQr, printData.qr_data])

  const c = printData.company
  const logo = resolveCompanyLogoDisplayUrl(c?.logo_url)
  const addr = getPrintIssuerAddress(printData)
  const money = (n: number) => formatMoney(n, printData.currency)
  const isTicket = format === 'ticket'
  const businessName = c?.business_name?.trim()
  const tradeName = c?.trade_name?.trim()
  const showBusiness = Boolean(businessName) && businessName !== tradeName

  return (
    <div className="flex justify-center overflow-y-auto bg-stone-300/60 p-3 md:p-5 h-[min(70vh,520px)] min-h-[320px]">
      <div
        className={clsx(
          'h-max bg-white text-stone-900 shadow-xl ring-1 ring-black/10',
          isTicket
            ? 'w-[300px] px-4 py-4 font-mono text-[11px] leading-snug'
            : 'w-full max-w-[540px] px-7 py-7 text-[12px] leading-relaxed',
        )}
      >
        {logo && (
          <div className="mb-2 flex justify-center">
            <img src={logo} alt="logo" className="max-h-16 max-w-[70%] object-contain" />
          </div>
        )}

        <div className="text-center">
          {tradeName && <p className="font-bold uppercase">{tradeName}</p>}
          {(showBusiness || !tradeName) && <p className={clsx(!tradeName && 'font-bold uppercase')}>{businessName || 'Empresa'}</p>}
          {c?.ruc && <p>RUC: {c.ruc}</p>}
          {addr && <p>{addr}</p>}
          {c?.phone && <p>Telf: {c.phone}</p>}
          {c?.email && <p>Email: {c.email}</p>}
        </div>

        <Sep />

        <div className="text-center font-bold">
          <p>{receiptDocTypeTitle(printData.sunat_code, printData.fiscal)}</p>
          <p>{printData.number}</p>
        </div>

        <Sep />

        <div className="space-y-0.5">
          <p>Fecha Emision: {printData.issue_date}</p>
          {printData.issue_time && <p>Hora Emision: {printData.issue_time}</p>}
          {printData.client && (
            <>
              <p>Cliente: {printData.client.business_name}</p>
              <p>Doc: {printData.client.doc_number}</p>
              {printData.client.address && <p>Dir: {printData.client.address}</p>}
            </>
          )}
        </div>

        <Sep />

        <table className="w-full">
          <thead>
            <tr className="border-b border-dashed border-stone-400 text-left">
              <th className="pb-1 pr-1 font-semibold">Cant</th>
              <th className="pb-1 pr-1 font-semibold">Descripcion</th>
              <th className="pb-1 text-right font-semibold">P.U.</th>
              <th className="pb-1 pl-1 text-right font-semibold">Imp.</th>
            </tr>
          </thead>
          <tbody>
            {printData.items.map((it, i) => (
              <tr key={i} className="align-top">
                <td className="py-0.5 pr-1">{it.quantity}</td>
                <td className="py-0.5 pr-1">{receiptItemDisplayDescription(it)}</td>
                <td className="py-0.5 text-right">{receiptItemDisplayUnitPrice(it, money)}</td>
                <td className="py-0.5 pl-1 text-right">{receiptItemDisplayTotal(it, money)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <Sep />

        <div className="space-y-0.5">
          {buildReceiptTotalLines(printData).map((row, i) => (
            <div key={i} className={clsx('flex justify-between', row.bold && 'font-bold')}>
              <span>{row.label.replace(/:$/, '')}</span>
              <span>
                {row.negative ? '- ' : ''}
                {money(Math.abs(row.amount))}
              </span>
            </div>
          ))}
        </div>

        {printData.payments.length > 0 && (
          <div className="mt-1 border-t border-dashed border-stone-300 pt-1">
            {printData.payments.map((p, i) => (
              <div key={i} className="flex justify-between">
                <span>{salePaymentMethodLabelEs(p.method)}</span>
                <span>{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {printData.legend_text && <p className="mt-2">Son: {printData.legend_text}</p>}

        {showQr && qrUrl && (
          <div className="mt-3 flex flex-col items-center text-center">
            <img src={qrUrl} alt="QR SUNAT" className="h-32 w-32" />
            {printData.sunat_hash && <p className="mt-1 break-all">Hash: {printData.sunat_hash}</p>}
            <p className="mt-1">Representacion impresa CPE</p>
            <p>Consulte en sunat.gob.pe</p>
          </div>
        )}

        <div className="mt-3 text-center text-stone-500">{TUKIFAC_APP_NAME} - Sistema POS</div>
      </div>
    </div>
  )
}

function Sep() {
  return <div className="my-2 border-t border-dashed border-stone-400" />
}
