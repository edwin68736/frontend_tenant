/** Monto en letras (formato SUNAT: "VEINTE CON 00/100 SOLES"). */

const UNIDADES = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE']
const DIEZ = ['', 'DIEZ', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA']
const ESPECIAL = [
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
]
const VEINTI = [
  '', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS', 'VEINTISIETE',
  'VEINTIOCHO', 'VEINTINUEVE',
]
const CIENTOS = [
  '', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS',
  'OCHOCIENTOS', 'NOVECIENTOS',
]

function decenas(n: number): string {
  if (n < 10) return UNIDADES[n]
  if (n < 20) return ESPECIAL[n - 10]
  if (n === 20) return 'VEINTE'
  if (n < 30) return VEINTI[n - 20]
  const d = Math.floor(n / 10)
  const u = n % 10
  if (u === 0) return DIEZ[d]
  return `${DIEZ[d]} Y ${UNIDADES[u]}`
}

function centenas(n: number): string {
  if (n === 0) return ''
  if (n === 100) return 'CIEN'
  if (n < 100) return decenas(n)
  const c = Math.floor(n / 100)
  const r = n % 100
  if (r === 0) return CIENTOS[c]
  return `${CIENTOS[c]} ${decenas(r)}`.trim()
}

function centenasMil(n: number): string {
  if (n === 1) return 'UN'
  return centenas(n)
}

function centenasMillones(n: number): string {
  return centenas(n)
}

function numeroALetras(n: number): string {
  let num = Math.trunc(Math.abs(n))
  if (num === 0) return 'CERO'
  if (num > 999_999_999) {
    return 'NOVECIENTOS NOVENTA Y NUEVE MILLONES NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE'
  }
  const parts: string[] = []
  if (num >= 1_000_000) {
    const mill = Math.floor(num / 1_000_000)
    num %= 1_000_000
    parts.push(mill === 1 ? 'UN MILLÓN' : `${centenasMillones(mill)} MILLONES`.trim())
  }
  if (num >= 1000) {
    const mil = Math.floor(num / 1000)
    num %= 1000
    parts.push(mil === 1 ? 'MIL' : `${centenasMil(mil)} MIL`.trim())
  }
  if (num > 0) parts.push(centenas(num))
  return parts.join(' ').trim()
}

function currencyName(code: string): string {
  switch (code.trim().toUpperCase()) {
    case 'USD':
      return 'DOLARES AMERICANOS'
    case 'EUR':
      return 'EUROS'
    default:
      return 'SOLES'
  }
}

export function amountInWords(amount: number, currency = 'PEN'): string {
  let monto = Math.round(amount * 100) / 100
  if (monto < 0) monto = 0
  let entero = Math.trunc(monto)
  let centavos = Math.round((monto - entero) * 100)
  if (centavos < 0) centavos = 0
  if (centavos > 99) {
    entero += Math.floor(centavos / 100)
    centavos %= 100
  }
  const parteEntera = numeroALetras(entero) || 'CERO'
  return `${parteEntera} CON ${String(centavos).padStart(2, '0')}/100 ${currencyName(currency)}`
}
