import { getApiBaseUrl } from '@/config/apiBaseUrl'
import { RECEIPT_LOGO_MIN_PX } from '@/utils/receiptPdfRaster'

export type ReceiptLogoPdfAsset = {
  dataUrl: string
  format: 'PNG' | 'JPEG'
  naturalW: number
  naturalH: number
}

function detectImageFormat(dataUrl: string, mimeHint?: string): 'PNG' | 'JPEG' {
  const lower = `${dataUrl} ${mimeHint ?? ''}`.toLowerCase()
  if (/jpe?g/.test(lower)) return 'JPEG'
  return 'PNG'
}

function resolveAssetUrl(url: string): string {
  const u = url.trim()
  if (!u) return ''
  if (/^data:/i.test(u) || /^https?:\/\//i.test(u)) return u
  if (u.startsWith('//')) return `${window.location.protocol}${u}`
  const base = getApiBaseUrl() || window.location.origin
  return u.startsWith('/') ? `${base}${u}` : `${base}/${u}`
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

function imageToDataUrl(img: HTMLImageElement): ReceiptLogoPdfAsset {
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  const ctx = canvas.getContext('2d')
  if (!ctx || canvas.width <= 0 || canvas.height <= 0) {
    throw new Error('Canvas inválido')
  }
  ctx.drawImage(img, 0, 0)
  const dataUrl = canvas.toDataURL('image/png')
  return {
    dataUrl,
    format: 'PNG',
    naturalW: canvas.width,
    naturalH: canvas.height,
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(blob)
  })
}

async function naturalSizeFromDataUrl(dataUrl: string): Promise<{ w: number; h: number } | null> {
  try {
    const img = await loadImageElement(dataUrl)
    return { w: img.naturalWidth, h: img.naturalHeight }
  } catch {
    return null
  }
}

async function upscaleLogoForPrint(asset: ReceiptLogoPdfAsset): Promise<ReceiptLogoPdfAsset> {
  const maxSide = Math.max(asset.naturalW, asset.naturalH)
  if (maxSide >= RECEIPT_LOGO_MIN_PX) return asset
  try {
    const img = await loadImageElement(asset.dataUrl)
    const scale = RECEIPT_LOGO_MIN_PX / maxSide
    const w = Math.max(1, Math.round(asset.naturalW * scale))
    const h = Math.max(1, Math.round(asset.naturalH * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return asset
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    return {
      dataUrl: canvas.toDataURL('image/png'),
      format: 'PNG',
      naturalW: w,
      naturalH: h,
    }
  } catch {
    return asset
  }
}

/** Convierte logo (data URL, ruta relativa o URL absoluta) a data URL usable por jsPDF. */
export async function resolveReceiptLogoForPdf(
  rawUrl?: string | null,
): Promise<ReceiptLogoPdfAsset | null> {
  const url = String(rawUrl ?? '').trim()
  if (!url) return null

  if (/^data:image\//i.test(url)) {
    const size = await naturalSizeFromDataUrl(url)
    if (!size) return null
    return upscaleLogoForPrint({
      dataUrl: url,
      format: detectImageFormat(url),
      naturalW: size.w,
      naturalH: size.h,
    })
  }

  const absolute = resolveAssetUrl(url)

  try {
    const res = await fetch(absolute, { credentials: 'include' })
    if (res.ok) {
      const blob = await res.blob()
      const dataUrl = await blobToDataUrl(blob)
      const size = await naturalSizeFromDataUrl(dataUrl)
      if (size) {
        return upscaleLogoForPrint({
          dataUrl,
          format: detectImageFormat(dataUrl, blob.type),
          naturalW: size.w,
          naturalH: size.h,
        })
      }
    }
  } catch {
    /* fallback canvas */
  }

  try {
    const img = await loadImageElement(absolute)
    return upscaleLogoForPrint(imageToDataUrl(img))
  } catch {
    return null
  }
}

export function fitReceiptLogoMm(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  if (naturalW <= 0 || naturalH <= 0) return { w: maxW, h: maxH }
  const ratio = naturalW / naturalH
  let w = maxW
  let h = w / ratio
  if (h > maxH) {
    h = maxH
    w = h * ratio
  }
  return { w, h }
}
