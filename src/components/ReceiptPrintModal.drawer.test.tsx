import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const state = { native: true, allowed: true, printers: ['documentos'] as string[] }
const openCashDrawer = vi.fn(async () => 'Enviado a la impresora')
const printDocumentAuto = vi.fn(async () => 'ok')
const toastError = vi.fn()

vi.mock('@/services/printers.service', () => ({
  isNativePrintAvailable: () => state.native,
  isAutoPrintEnabled: () => false,
  getConfiguredPrinter: (kind: string) => (state.printers.includes(kind) ? { paperWidthMm: 80 } : null),
  openCashDrawer: () => openCashDrawer(),
  printDocumentAuto: () => printDocumentAuto(),
}))
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ hasPermission: (p: string) => state.allowed && p === 'cashbank.movements' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }))
vi.mock('@/components/ui/PortalModal', () => ({ PortalModal: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/PdfBlobViewer', () => ({ PdfBlobViewer: () => null }))
vi.mock('@/components/ReceiptEmailModal', () => ({ ReceiptEmailModal: () => null }))
vi.mock('@/utils/receiptPdf', () => ({ printDataToPdfBlob: async () => new Blob(), downloadReceiptPdf: vi.fn(), printReceiptPdf: vi.fn() }))
vi.mock('@/utils/receiptShare', () => ({ shareReceiptPdf: vi.fn() }))
vi.mock('@/utils/receiptPng', () => ({ shareReceiptPngViaWhatsApp: vi.fn() }))
vi.mock('@/utils/receiptTicketPrint', () => ({ printTicketPreferDirect: vi.fn() }))

import { ReceiptPrintModal } from '@/components/ReceiptPrintModal'

const data = { number: 'NV001-1', total: 10, currency: 'PEN', payments: [] } as never
const show = (extra: Record<string, unknown> = {}) => render(<ReceiptPrintModal open onClose={() => {}} printData={data} saleId={1} {...extra} />)
const drawer = () => screen.queryByRole('button', { name: 'Abrir gaveta' })

beforeEach(() => {
  URL.createObjectURL = () => 'blob:x'
  URL.revokeObjectURL = () => {}
  Object.assign(state, { native: true, allowed: true, printers: ['documentos'] })
  vi.clearAllMocks()
})
afterEach(cleanup)

describe('Botón «Abrir gaveta» en el modal de venta', () => {
  it('en la app instalada abre la gaveta sin imprimir nada', async () => {
    show()
    fireEvent.click(drawer()!)
    await waitFor(() => expect(openCashDrawer).toHaveBeenCalledTimes(1))
    expect(printDocumentAuto).not.toHaveBeenCalled()
  })
  it('no aparece en el navegador', () => {
    state.native = false
    show()
    expect(drawer()).toBeNull()
  })
  it('no aparece sin permiso de caja, y «Reimprimir» ocupa todo el ancho', () => {
    state.allowed = false
    show()
    expect(drawer()).toBeNull()
    expect(screen.getByRole('button', { name: 'Volver a imprimir' }).className).toContain('col-span-2')
  })
  it('sin impresora configurada avisa y no intenta abrir', () => {
    state.printers = []
    show()
    fireEvent.click(drawer()!)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(openCashDrawer).not.toHaveBeenCalled()
  })
  it('no aparece en una cotización', () => {
    show({ documentKind: 'quotation' })
    expect(drawer()).toBeNull()
  })
})
