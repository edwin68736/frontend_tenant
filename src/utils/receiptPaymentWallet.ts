import type { jsPDF } from 'jspdf'
import { resolvePublicAssetUrl } from '@/config/apiBaseUrl'
import type { PrintData } from '@/types/printData'

export function paymentWalletVisible(data: PrintData, format: 'a4' | 'ticket'): boolean {
  const w = data.payment_wallet
  if (!w?.qr_url?.trim()) return false
  if (!w.provider?.trim() || !w.phone?.trim()) return false
  return format === 'a4' ? Boolean(w.show_on_a4) : Boolean(w.show_on_ticket)
}

export function walletProviderLabel(provider: string): string {
  const p = provider.trim().toLowerCase()
  if (p === 'yape') return 'Yape'
  if (p === 'plin') return 'Plin'
  return provider
}

function qrImageFormat(dataUrl: string): 'PNG' | 'JPEG' {
  return /image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG'
}

export async function renderPaymentWalletBlock(
  doc: jsPDF,
  data: PrintData,
  format: 'a4' | 'ticket',
  startY: number,
  pageW: number,
  margin: number,
): Promise<number> {
  const w = data.payment_wallet
  if (!w || !paymentWalletVisible(data, format)) return startY

  const qrSize = format === 'a4' ? 28 : 22
  const lineH = format === 'a4' ? 5 : 4.2
  const label = walletProviderLabel(w.provider)
  let y = startY

  const drawCenter = (text: string, size: number) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'normal')
    doc.text(text, pageW / 2, y, { align: 'center' })
    y += lineH
  }

  drawCenter(`Paga con ${label}`, format === 'a4' ? 9 : 8)
  drawCenter(w.phone, format === 'a4' ? 8 : 7)

  const qrSrc = w.qr_url.startsWith('data:') ? w.qr_url : resolvePublicAssetUrl(w.qr_url)
  try {
    doc.addImage(qrSrc, qrImageFormat(w.qr_url), (pageW - qrSize) / 2, y, qrSize, qrSize)
    y += qrSize + (format === 'a4' ? 4 : 3)
  } catch {
    /* ignore */
  }

  void margin
  return y
}
