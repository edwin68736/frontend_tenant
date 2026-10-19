import type { PrintData, PrintItem } from '@/types/printData'

/**
 * PrintData de ejemplo para el banco de pruebas del PDF A4 (ver run.mjs).
 * Cubre los tipos de documento y combinaciones fiscales que los diseños deben dibujar.
 */

function item(n: number, over: Partial<PrintItem> = {}): PrintItem {
  const unit = 10 + n
  const sub = unit * 2
  return {
    code: `P${String(n).padStart(3, '0')}`,
    description: `Producto de prueba número ${n} con descripción algo larga para forzar el ajuste de línea`,
    unit: 'NIU',
    quantity: 2,
    unit_price: unit,
    discount: 0,
    subtotal: sub / 1.18,
    tax_amount: sub - sub / 1.18,
    total: sub,
    igv_affectation_type: '10',
    ...over,
  }
}

function totalsOf(items: PrintItem[]) {
  const total = items.reduce((s, i) => s + i.total, 0)
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0)
  const tax = total - subtotal
  return {
    subtotal: +subtotal.toFixed(2),
    tax_amount: +tax.toFixed(2),
    total: +total.toFixed(2),
    totals_by_affectation: {
      '10': {
        code: '10',
        description: 'Gravado',
        subtotal: +subtotal.toFixed(2),
        tax_amount: +tax.toFixed(2),
        total: +total.toFixed(2),
      },
    },
  }
}

function base(code: string, series: string, items: PrintItem[], over: Partial<PrintData> = {}): PrintData {
  const t = totalsOf(items)
  return {
    doc_type: code,
    sunat_code: code,
    series,
    number: '00000123',
    issue_date: '2026-10-17',
    issue_time: '13:07:20',
    currency: 'PEN',
    exchange_rate: null,
    sunat_hash: 'jMyoQzCO/kC4M9IdzJYlb/ldg6o=',
    qr_data: '20612257320|01|F002|00000123|3.05|20.00|2026-10-17|6|10296564040|',
    legend_text: 'VEINTE CON 00/100 SOLES',
    client: {
      doc_type: '6',
      doc_number: '20614741351',
      business_name: 'PILARES TALLER AUTOMOTRIZ E.I.R.L.',
      address: 'OTR. ZONA 3 COM. 2 MZ. V LT. 4 ASC. CIUDAD DE DIOS',
    },
    company: {
      ruc: '20612257320',
      business_name: 'NEGOCIOS DIGITALES TUKIFAC S.A.C.',
      trade_name: 'TUKIFAC',
      address: 'CAL. SANTO DOMINGO NRO. 113 CC GALERIAS GAMESA PISO6',
      phone: '916996847 - 935986519',
      email: 'tukifac@gmail.com',
      website: 'www.tukifac.com',
      additional_notes: 'SERVICIOS DE FACTURACIÓN ELECTRÓNICA Y VENTA DE EQUIPOS PARA PUNTO DE VENTA',
      logo_size_a4: 'mediano',
    },
    branch: { name: 'Principal' },
    items,
    ...t,
    payments: [{ method: 'efectivo', amount: t.total }],
    payment_condition: 'Contado',
    seller_name: 'Rosymar',
    bank_accounts: [
      { bank_name: 'BCP', account_number: '2157113601071', cci: '00221500711360107155', currency: 'PEN' },
    ],
    fiscal: {
      show_terms_conditions: true,
      terms_text:
        '1.- Revisión: verifica el producto al recibirlo.\n2.- Cambios: solo dentro de las 24 horas.\n3.- Garantía: solo fallas de fábrica.',
    },
    ...over,
  }
}

const many = (n: number) => Array.from({ length: n }, (_, i) => item(i + 1))

export const FIXTURES: Record<string, PrintData> = {
  factura_contado: base('01', 'F002', [item(1)]),
  factura_8_items: base('01', 'F002', many(8)),
  factura_40_items: base('01', 'F002', many(40)),
  factura_descuento: base('01', 'F002', [item(1, { discount: 3, line_discount_subtotal: 2.54 }), item(2)], {
    line_discount_total: 2.54,
  }),
  factura_credito: base('01', 'F002', many(2), {
    payment_condition: 'Crédito',
    payments: [],
    credit_installments: [
      { installment_no: 1, due_date: '2026-11-17', amount: 20, status: 'pending' },
      { installment_no: 2, due_date: '2026-12-17', amount: 20, status: 'paid' },
    ],
  }),
  factura_detraccion: base(
    '01',
    'F002',
    [item(1, { unit_price: 800, total: 1600, subtotal: 1355.93, tax_amount: 244.07 })],
    {
      payments: [
        { method: 'detraccion_bn', amount: 160 },
        { method: 'efectivo', amount: 1440 },
      ],
      fiscal: {
        show_terms_conditions: true,
        terms_text: 'Términos de prueba.',
        has_detraccion: true,
        detraccion_good_code: '027',
        detraccion_good_label: 'Servicio de transporte de carga',
        detraccion_rate_percent: 4,
        detraccion_amount: 64.6,
        detraccion_net_payable: 1535.4,
        detraccion_bank_account: '00-123-456789',
        detraccion_payment_method_code: '001',
        detraccion_payment_method_label: 'Depósito en cuenta',
        detraccion_legend_text: 'Operación sujeta al Sistema de Pago de Obligaciones Tributarias',
        detraccion_pay_constancy_number: '123456789',
        purchase_order_number: 'OC-777',
        guias: [{ kind: 'guia_remitente', number: 'T001-45' }],
      },
    },
  ),
  factura_retencion: base(
    '01',
    'F002',
    [item(5, { unit_price: 3000, total: 6000, subtotal: 5084.75, tax_amount: 915.25 })],
    { fiscal: { retention_applied: true, igv_retention_amount: 180, net_collectible: 5820, show_terms_conditions: false } },
  ),
  factura_anticipo: base('01', 'F002', many(1), {
    fiscal: {
      show_terms_conditions: false,
      prepayment_deductions: [{ document_number: 'F002-00000010', related_doc_type: '01', amount: 10, total: 11.8 }],
      fiscal_observations: 'Observación fiscal de prueba',
    },
  }),
  factura_usd: base('01', 'F002', many(2), {
    currency: 'USD',
    exchange_rate: 3.75,
    legend_text: 'CUARENTA CON 00/100 DÓLARES AMERICANOS',
  }),
  boleta_varios: base('03', 'B002', [item(1)], {
    client: null,
    qr_data: '20612257320|03|B002|00000123|3.05|20.00|2026-10-17|1|00000000|',
  }),
  boleta_dni: base('03', 'B002', [item(1)], {
    client: { doc_type: '1', doc_number: '45678912', business_name: 'JUAN PEREZ', address: '' },
  }),
  nota_credito: base('07', 'FC02', [item(1)], {
    affected_doc_sunat_code: '01',
    affected_doc_number: 'F002-00000100',
    credit_note_reason: 'Error en el precio',
    note_type_code: '01',
    note_type_label: '01 - Anulación de la operación',
  }),
  nota_debito: base('08', 'FD02', [item(1)], {
    affected_doc_sunat_code: '01',
    affected_doc_number: 'F002-00000100',
    credit_note_reason: 'Intereses por mora',
    note_type_code: '02',
    note_type_label: '02 - Intereses por mora',
  }),
  nota_venta: base('00', 'NV02', [item(1)], { qr_data: '', sunat_hash: '' }),
  cotizacion: base('QT', 'COT', [item(1)], {
    qr_data: '',
    sunat_hash: '',
    payments: [],
    reference_payments: [{ method: 'yape', amount: 0, reference: 'a coordinar' }],
  }),
  pago_mixto_vuelto: base('03', 'B002', [item(2)], {
    payments: [
      { method: 'efectivo', amount: 10 },
      { method: 'yape', amount: 20 },
      { method: 'tarjeta', amount: 20 },
    ],
    change_amount: 7.8,
  }),
  guia: {
    ...base('09', 'T001', [item(1)], { qr_data: '', sunat_hash: '', client: null }),
    despatch: {
      destinatario: {
        doc_type: '6',
        doc_number: '20614741351',
        name: 'PILARES TALLER AUTOMOTRIZ E.I.R.L.',
        address: 'Ciudad de Dios',
      },
      motivo_traslado: 'Venta',
      modalidad: 'Transporte privado',
      fecha_traslado: '2026-10-17',
      peso_total: 12,
      und_peso: 'KGM',
      num_bultos: 2,
      partida: { ubigueo: '040101', address: 'Av. Siempre Viva 123' },
      llegada: { ubigueo: '040102', address: 'Calle Falsa 456' },
      vehiculo: { placa: 'ABC-123' },
      choferes: [{ doc_type: '1', doc_number: '12345678', name: 'Chofer Prueba', licencia: 'Q12345678' }],
    },
  },
}
