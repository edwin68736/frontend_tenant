import { getApiBaseUrl } from '@/config/apiBaseUrl'
import { isNativeShell } from '@/lib/platform/detect'
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

/**
 * Descarga la imagen como data URL probando estrategias que sortean CORS.
 * El logo es un asset público (se muestra a clientes), por eso se prioriza
 * la petición SIN credenciales: así funciona con `Access-Control-Allow-Origin: *`.
 * Con `credentials: 'include'` el navegador rechaza respuestas con ACAO `*`.
 */
async function fetchImageAsDataUrl(url: string): Promise<{ dataUrl: string; type: string } | null> {
  const attempts: RequestInit[] = [
    { credentials: 'omit', mode: 'cors' },
    { credentials: 'include', mode: 'cors' },
  ]
  for (const init of attempts) {
    try {
      const res = await fetch(url, init)
      if (!res.ok) continue
      const blob = await res.blob()
      if (blob.size === 0) continue
      if (blob.type && !blob.type.startsWith('image/')) continue
      const dataUrl = await blobToDataUrl(blob)
      if (dataUrl.startsWith('data:image/')) return { dataUrl, type: blob.type }
    } catch {
      /* siguiente estrategia */
    }
  }
  return null
}

/**
 * Candidatos de URL para el logo, en orden de preferencia.
 * 1) API del tenant (getApiBaseUrl): la app ya hace peticiones ahí, así que su
 *    CORS ya permite este origen → es la vía más fiable para leer los bytes.
 * 2) Same-origin del SPA en web (por si el host del tenant sirve /uploads).
 * 3) La URL absoluta original (servidor central de assets), como último recurso.
 */
function logoUrlCandidates(absolute: string): string[] {
  const out: string[] = []
  const add = (u?: string) => {
    const v = u?.trim()
    if (v && !out.includes(v)) out.push(v)
  }
  try {
    const parsed = new URL(absolute)
    const pathAndQuery = `${parsed.pathname}${parsed.search}`
    const apiBase = getApiBaseUrl()
    if (apiBase) add(`${apiBase.replace(/\/$/, '')}${pathAndQuery}`)
    if (!isNativeShell() && typeof window !== 'undefined') {
      add(`${window.location.origin}${pathAndQuery}`)
    }
    add(absolute)
  } catch {
    add(absolute)
  }
  return out
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
  const candidates = logoUrlCandidates(absolute)

  // 1) Descarga por fetch (data URL directo). Prueba same-origin y luego cruzado, sin/con credenciales.
  for (const candidate of candidates) {
    const fetched = await fetchImageAsDataUrl(candidate)
    if (fetched) {
      const size = await naturalSizeFromDataUrl(fetched.dataUrl)
      if (size) {
        return upscaleLogoForPrint({
          dataUrl: fetched.dataUrl,
          format: detectImageFormat(fetched.dataUrl, fetched.type),
          naturalW: size.w,
          naturalH: size.h,
        })
      }
    }
  }

  // 2) Fallback: <img crossOrigin="anonymous"> + canvas (requiere cabeceras CORS en el asset).
  for (const candidate of candidates) {
    try {
      const img = await loadImageElement(candidate)
      return upscaleLogoForPrint(imageToDataUrl(img))
    } catch {
      /* siguiente candidato */
    }
  }

  console.warn(
    `[receipt-logo] No se pudo cargar el logo para el PDF desde ${absolute}. ` +
      'Probable bloqueo CORS del servidor de assets (falta Access-Control-Allow-Origin).',
  )
  return null
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
