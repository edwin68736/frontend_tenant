import QRCode from 'qrcode'
import { scaleLogoDimension } from '@/services/printers/logoPrintSize'

/** Ancho imprimible en puntos (58 mm ≈ 384, 80 mm ≈ 576). */
export function escposPrintWidthPx(paperWidthMm: 58 | 80): number {
  return paperWidthMm === 58 ? 384 : 576
}

// Caché en memoria del raster de imágenes ESTABLES (logo de empresa, QR de wallet).
// Evita re-descargar y re-ditherizar la imagen en CADA impresión. Clave por URL + tamaño,
// así un cambio de URL (logo nuevo) usa otra entrada. El QR SUNAT NO pasa por aquí (cambia
// por venta), por lo que nunca se cachea contenido dinámico.
const imageRasterCache = new Map<string, Uint8Array>()

/** Limpia la caché de rasters de imagen (llamar al cambiar el logo o el QR de wallet). */
export function clearEscPosImageRasterCache(): void {
  imageRasterCache.clear()
}

// Tamaño base = «mediano»; el ajuste local lo escala. El ancho se topa al imprimible del
// papel (escposPrintWidthPx) para que «grande» nunca corte la imagen.
function escposLogoMaxWidthPx(paperWidthMm: 58 | 80): number {
  const base = paperWidthMm === 58 ? 320 : 420
  return Math.min(scaleLogoDimension(base), escposPrintWidthPx(paperWidthMm))
}

function escposLogoMaxHeightPx(paperWidthMm: 58 | 80): number {
  return scaleLogoDimension(paperWidthMm === 58 ? 96 : 120)
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

type Bounds = { left: number; top: number; right: number; bottom: number }

/** Recorta márgenes blancos o transparentes alrededor del contenido visible. */
function findContentBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  whiteThreshold = 245,
): Bounds | null {
  let top = height
  let bottom = -1
  let left = width
  let right = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const a = data[i + 3]!
      const r = data[i]!
      const g = data[i + 1]!
      const b = data[i + 2]!
      const transparent = a < 20
      const white = r >= whiteThreshold && g >= whiteThreshold && b >= whiteThreshold
      if (transparent || white) continue
      if (y < top) top = y
      if (y > bottom) bottom = y
      if (x < left) left = x
      if (x > right) right = x
    }
  }

  if (bottom < top || right < left) return null
  return { left, top, right, bottom }
}

function toGrayscaleWithLogoDither(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const threshold = 105
  const grayscale = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!
    const g = data[i + 1]!
    const b = data[i + 2]!
    grayscale[i / 4] = Math.round(r * 0.299 + g * 0.587 + b * 0.114)
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const oldPixel = grayscale[idx]!
      const newPixel = oldPixel < threshold ? 0 : 255
      grayscale[idx] = newPixel
      const quantError = oldPixel - newPixel
      const errorFactor = 0.5
      if (x + 1 < width) grayscale[idx + 1]! += (quantError * 7) / 16 * errorFactor
      if (x - 1 >= 0 && y + 1 < height) grayscale[idx + width - 1]! += (quantError * 3) / 16 * errorFactor
      if (y + 1 < height) grayscale[idx + width]! += (quantError * 5) / 16 * errorFactor
      if (x + 1 < width && y + 1 < height) grayscale[idx + width + 1]! += (quantError * 1) / 16 * errorFactor
    }
  }
  return grayscale
}

function trimEmptyRows(grayscale: Uint8Array, width: number, height: number): { gray: Uint8Array; h: number } {
  let top = 0
  let bottom = height - 1
  const rowHasInk = (y: number) => {
    for (let x = 0; x < width; x++) {
      if (grayscale[y * width + x] === 0) return true
    }
    return false
  }
  while (top < height && !rowHasInk(top)) top++
  while (bottom > top && !rowHasInk(bottom)) bottom--
  const h = bottom - top + 1
  if (h <= 0) return { gray: grayscale, h: height }
  const trimmed = new Uint8Array(width * h)
  for (let y = 0; y < h; y++) {
    trimmed.set(grayscale.subarray((top + y) * width, (top + y + 1) * width), y * width)
  }
  return { gray: trimmed, h }
}

/** Centra el bitmap en el ancho imprimible (varias ticketeras ignoran ESC a en GS v 0). */
function padCenterGrayscale(
  gray: Uint8Array,
  srcW: number,
  srcH: number,
  targetW: number,
): { gray: Uint8Array; w: number; h: number } {
  const w = Math.ceil(targetW / 8) * 8
  if (srcW >= w) return { gray, w: srcW, h: srcH }
  const padLeft = Math.floor((w - srcW) / 2)
  const padded = new Uint8Array(w * srcH)
  padded.fill(255)
  for (let y = 0; y < srcH; y++) {
    padded.set(gray.subarray(y * srcW, (y + 1) * srcW), y * w + padLeft)
  }
  return { gray: padded, w, h: srcH }
}

function grayscaleToEscPosRaster(grayscale: Uint8Array, width: number, height: number): Uint8Array {
  const bitmapWidthBytes = width / 8
  const xL = bitmapWidthBytes & 0xff
  const xH = (bitmapWidthBytes >> 8) & 0xff
  const yL = height & 0xff
  const yH = (height >> 8) & 0xff
  const headerLen = 8
  const dataLen = bitmapWidthBytes * height
  const out = new Uint8Array(headerLen + dataLen)
  out[0] = 0x1d
  out[1] = 0x76
  out[2] = 0x30
  out[3] = 0
  out[4] = xL
  out[5] = xH
  out[6] = yL
  out[7] = yH
  let offset = headerLen
  for (let i = 0; i < grayscale.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) {
      if (i + j < grayscale.length && grayscale[i + j] === 0) {
        byte |= 1 << (7 - j)
      }
    }
    out[offset++] = byte
  }
  return out
}

/** Raster ESC/POS (GS v 0) con recorte de márgenes blancos. */
export async function buildEscPosImageRaster(
  imageUrl: string,
  paperWidthMm: 58 | 80,
  maxW: number,
  maxH: number,
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') return null
  const src = String(imageUrl ?? '').trim()
  if (!src) return null

  const cacheKey = `${paperWidthMm}|${maxW}x${maxH}|${src}`
  const cachedRaster = imageRasterCache.get(cacheKey)
  if (cachedRaster) return cachedRaster

  try {
    const img = await loadImageElement(src)
    const printW = escposPrintWidthPx(paperWidthMm)

    const srcW = img.naturalWidth || img.width
    const srcH = img.naturalHeight || img.height
    if (srcW < 1 || srcH < 1) return null

    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = srcW
    srcCanvas.height = srcH
    const srcCtx = srcCanvas.getContext('2d')
    if (!srcCtx) return null
    srcCtx.fillStyle = '#ffffff'
    srcCtx.fillRect(0, 0, srcW, srcH)
    srcCtx.drawImage(img, 0, 0)

    const srcData = srcCtx.getImageData(0, 0, srcW, srcH)
    const bounds = findContentBounds(srcData.data, srcW, srcH)
    if (!bounds) return null

    const cropW = bounds.right - bounds.left + 1
    const cropH = bounds.bottom - bounds.top + 1

    const scale = Math.min(maxW / cropW, maxH / cropH, printW / cropW, 1)
    let w = Math.max(8, Math.round(cropW * scale))
    let h = Math.max(8, Math.round(cropH * scale))
    w = Math.ceil(w / 8) * 8

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(
      srcCanvas,
      bounds.left,
      bounds.top,
      cropW,
      cropH,
      0,
      0,
      w,
      h,
    )

    const imageData = ctx.getImageData(0, 0, w, h)
    let gray = toGrayscaleWithLogoDither(imageData.data, w, h)
    const trimmed = trimEmptyRows(gray, w, h)
    gray = trimmed.gray
    h = trimmed.h
    if (h < 1) return null

    const centered = padCenterGrayscale(gray, w, h, printW)
    gray = centered.gray
    w = centered.w
    h = centered.h

    const raster = grayscaleToEscPosRaster(gray, w, h)
    imageRasterCache.set(cacheKey, raster) // solo se cachea el resultado exitoso
    return raster
  } catch {
    return null
  }
}

/**
 * Texto centrado como raster, para tamaños intermedios que el ESC/POS nativo no
 * permite (solo múltiplos enteros 1×/2×). Útil para el nombre comercial "un poco
 * más grande" (p. ej. 1.3× del cuerpo). Devuelve null si no puede rasterizar.
 */
export async function buildEscPosCenteredTextRaster(
  text: string,
  paperWidthMm: 58 | 80,
  opts?: { fontScale?: number; bold?: boolean },
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null
  const t = String(text ?? '').trim()
  if (!t) return null
  try {
    const printW = escposPrintWidthPx(paperWidthMm)
    const { fontSize: bodyFont } = ticketBodyFontPx(paperWidthMm)
    const fontSize = Math.max(8, Math.round(bodyFont * (opts?.fontScale ?? 1.3)))
    const lineH = Math.round(fontSize * 1.18)
    const weight = opts?.bold ? 'bold' : 'normal'
    const font = `${weight} ${fontSize}px Arial, Helvetica, sans-serif`
    const pad = 4

    const measureCtx = document.createElement('canvas').getContext('2d')
    if (!measureCtx) return null
    measureCtx.font = font
    const lines = expandWrappedCanvasLines(measureCtx, [t], printW - pad * 2)

    const canvas = document.createElement('canvas')
    canvas.width = printW // 384/576, múltiplos de 8 (requisito del raster)
    canvas.height = Math.max(1, lines.length * lineH + pad * 2)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#000000'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'center'
    ctx.font = font
    lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, pad + i * lineH))

    return canvasToEscPosRasterPlain(canvas)
  } catch {
    return null
  }
}

/** Logo recortado y centrado en el ancho del ticket (compatible con ticketeras que ignoran ESC a en raster). */
export async function buildEscPosLogoRaster(
  logoUrl: string,
  paperWidthMm: 58 | 80,
): Promise<Uint8Array | null> {
  return buildEscPosImageRaster(
    logoUrl,
    paperWidthMm,
    escposLogoMaxWidthPx(paperWidthMm),
    escposLogoMaxHeightPx(paperWidthMm),
  )
}

/** QR Yape/Plin en ticket térmico (cuadrado, más grande que el logo). */
export async function buildEscPosWalletQrRaster(
  qrUrl: string,
  paperWidthMm: 58 | 80,
): Promise<Uint8Array | null> {
  const side = paperWidthMm === 58 ? 220 : 280
  return buildEscPosImageRaster(qrUrl, paperWidthMm, side, side)
}

/** Umbral fijo (sin dither): el texto pequeño no se convierte en manchas negras. */
function canvasToEscPosRasterPlain(canvas: HTMLCanvasElement): Uint8Array | null {
  const w = canvas.width
  const h = canvas.height
  if (w % 8 !== 0 || h < 1) return null
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const { data } = ctx.getImageData(0, 0, w, h)
  const gray = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const a = data[o + 3]!
    if (a < 48) {
      gray[i] = 255
      continue
    }
    const lum = data[o]! * 0.299 + data[o + 1]! * 0.587 + data[o + 2]! * 0.114
    gray[i] = lum < 190 ? 0 : 255
  }
  return grayscaleToEscPosRaster(gray, w, h)
}

function ticketBodyFontPx(paperWidthMm: 58 | 80): { fontSize: number; lineH: number } {
  return paperWidthMm === 58
    ? { fontSize: 24, lineH: 24 }
    : { fontSize: 26, lineH: 26 }
}

/** Reparto ancho: texto ~50%, QR SUNAT lo más grande posible en la derecha. */
export function ticketPaySunatLayout(paperWidthMm: 58 | 80): {
  printW: number
  qrSide: number
  maxTextW: number
  pad: number
  fontSize: number
  lineH: number
} {
  const printW = escposPrintWidthPx(paperWidthMm)
  const pad = 4
  const { fontSize, lineH } = ticketBodyFontPx(paperWidthMm)
  const qrSide = paperWidthMm === 58 ? 172 : 216
  const maxTextW = printW - qrSide - pad * 3
  return { printW, qrSide, maxTextW, pad, fontSize, lineH }
}

function wrapCanvasLine(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const t = String(text ?? '').trim()
  if (!t) return ['']
  if (ctx.measureText(t).width <= maxWidth) return [t]
  const words = t.split(/\s+/)
  const lines: string[] = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current)
      current = word
    } else {
      current = next
    }
  }
  if (current) lines.push(current)
  return lines.length ? lines : [t]
}

function expandWrappedCanvasLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  maxWidth: number,
): string[] {
  const out: string[] = []
  for (const line of lines) {
    wrapCanvasLine(ctx, line, maxWidth).forEach((l) => out.push(l))
  }
  return out
}

/**
 * Ticket: condición de pago (izq) + QR SUNAT (der) en un raster.
 * Funciona igual en cualquier impresora térmica (sin retroceso de papel).
 */
export async function buildEscPosPayConditionSunatRowRaster(
  leftTextLines: string[],
  sunatQrPayload: string,
  paperWidthMm: 58 | 80,
): Promise<Uint8Array | null> {
  if (typeof document === 'undefined') return null
  const payload = String(sunatQrPayload ?? '').trim()
  if (!payload) return null

  const { printW, qrSide, maxTextW, pad, fontSize, lineH } = ticketPaySunatLayout(paperWidthMm)

  try {
    const gen = Math.round(qrSide * 2)
    const qrDataUrl = await QRCode.toDataURL(payload, {
      width: gen,
      margin: 1,
      errorCorrectionLevel: 'M',
    })
    const qrImg = await loadImageElement(qrDataUrl)

    const measureCanvas = document.createElement('canvas')
    const measureCtx = measureCanvas.getContext('2d')
    if (!measureCtx) return null
    measureCtx.font = `normal ${fontSize}px Arial, Helvetica, sans-serif`
    const wrappedLeft = expandWrappedCanvasLines(measureCtx, leftTextLines, maxTextW)

    const textH = Math.max(lineH, wrappedLeft.length * lineH + pad + 2)
    const totalH = Math.max(textH, qrSide + pad * 2)

    const canvas = document.createElement('canvas')
    canvas.width = printW
    canvas.height = totalH
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, printW, totalH)
    ctx.fillStyle = '#000000'
    ctx.textBaseline = 'top'
    ctx.font = `normal ${fontSize}px Arial, Helvetica, sans-serif`
    wrappedLeft.forEach((line, i) => {
      ctx.fillText(line, pad, pad + i * lineH)
    })
    const qrX = printW - qrSide - pad
    const qrY = Math.max(pad, Math.floor((totalH - qrSide) / 2))
    ctx.drawImage(qrImg, qrX, qrY, qrSide, qrSide)

    return canvasToEscPosRasterPlain(canvas)
  } catch {
    return null
  }
}
