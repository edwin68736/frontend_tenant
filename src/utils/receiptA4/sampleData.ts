import type { PrintData, PrintItem } from '@/types/printData'
import type { CompanyConfig } from '@/services/company.service'
import { getCompanyLogoForPrint } from '@/lib/companyConfig/store'

/**
 * Factura de ejemplo para la vista previa de cada diseño en Ajustes: usa los datos reales de la empresa
 * (nombre, RUC, dirección, logo, tamaño de logo, términos) y un cliente e ítems ficticios. No se guarda ni
 * se envía a ningún lado.
 */
export function buildA4SamplePrintData(cfg: CompanyConfig, designSlug: string): PrintData {
  const mk = (n: number, description: string, qty: number, unitPrice: number): PrintItem => {
    const total = +(qty * unitPrice).toFixed(2)
    const subtotal = +(total / 1.18).toFixed(2)
    return {
      code: `PRD${String(n).padStart(3, '0')}`,
      description,
      unit: 'NIU',
      quantity: qty,
      unit_price: unitPrice,
      discount: 0,
      subtotal,
      tax_amount: +(total - subtotal).toFixed(2),
      total,
      igv_affectation_type: '10',
    }
  }
  const items = [
    mk(1, 'Producto de ejemplo', 2, 25),
    mk(2, 'Servicio de ejemplo con una descripción un poco más larga', 1, 80),
    mk(3, 'Otro producto', 3, 12.5),
  ]
  const total = +items.reduce((s, i) => s + i.total, 0).toFixed(2)
  const subtotal = +items.reduce((s, i) => s + i.subtotal, 0).toFixed(2)
  const tax = +(total - subtotal).toFixed(2)
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const terms = cfg.terms_and_conditions?.trim()

  return {
    doc_type: '01',
    sunat_code: '01',
    series: 'F001',
    number: '00000001',
    issue_date: date,
    issue_time: '10:30:00',
    currency: 'PEN',
    exchange_rate: null,
    sunat_hash: 'k8Zp3vQm2Yx9LwTq0aBcDeFgHiJ=',
    qr_data: `${cfg.ruc}|01|F001|00000001|${tax.toFixed(2)}|${total.toFixed(2)}|${date}|6|20123456789|`,
    legend_text: 'VISTA PREVIA DEL DISEÑO',
    client: {
      doc_type: '6',
      doc_number: '20123456789',
      business_name: 'CLIENTE DE EJEMPLO S.A.C.',
      address: 'AV. EJEMPLO 123, LIMA',
    },
    company: {
      ruc: cfg.ruc,
      business_name: cfg.business_name,
      trade_name: cfg.trade_name || undefined,
      address: cfg.address || undefined,
      phone: cfg.phone || undefined,
      email: cfg.email || undefined,
      website: cfg.website || undefined,
      logo_url: getCompanyLogoForPrint() ?? undefined,
      additional_notes: cfg.additional_notes?.trim() || undefined,
      logo_size_a4: cfg.logo_size_a4,
      pdf_a4_design: designSlug,
    },
    branch: { name: 'Principal' },
    items,
    subtotal,
    tax_amount: tax,
    total,
    totals_by_affectation: {
      '10': { code: '10', description: 'Gravado', subtotal, tax_amount: tax, total },
    },
    payments: [{ method: 'efectivo', amount: total }],
    payment_condition: 'Contado',
    seller_name: 'Vendedor',
    fiscal: terms ? { show_terms_conditions: true, terms_text: terms } : undefined,
  }
}
