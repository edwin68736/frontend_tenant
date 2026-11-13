/**
 * Reduce una imagen subida por el usuario a un icono pequeño (data URL) para guardarlo junto al registro.
 * Se dibuja centrada dentro de un cuadrado `size`×`size` (sin deformar, fondo transparente) y se exporta en WEBP
 * (o PNG si el navegador no lo soporta). Si aún pesa más de `maxBytes` se baja la calidad / el tamaño.
 */
export const ICON_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif'
export const ICON_MAX_INPUT_BYTES = 5 * 1024 * 1024

/** Tamaño final de un data URL en bytes (la cadena completa es lo que viaja al API). */
export function dataUrlBytes(dataUrl: string): number {
  return dataUrl.length
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen')) }
    img.src = url
  })
}

function render(img: HTMLImageElement, size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('El navegador no permite procesar imágenes')
  ctx.imageSmoothingQuality = 'high'
  const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight)
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h)
  return canvas
}

export async function fileToIconDataUrl(file: File, size = 96, maxBytes = 40 * 1024): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen (PNG, JPG o WEBP)')
  if (file.size > ICON_MAX_INPUT_BYTES) throw new Error('La imagen es demasiado grande (máximo 5 MB)')
  const img = await loadImage(file)
  if (!img.naturalWidth || !img.naturalHeight) throw new Error('La imagen no es válida')

  let s = size
  for (let attempt = 0; attempt < 4; attempt++) {
    const canvas = render(img, s)
    for (const q of [0.9, 0.75, 0.6]) {
      let out = canvas.toDataURL('image/webp', q)
      if (!out.startsWith('data:image/webp')) out = canvas.toDataURL('image/png')
      if (dataUrlBytes(out) <= maxBytes) return out
      if (out.startsWith('data:image/png')) break // PNG ignora la calidad: probar con menos píxeles
    }
    s = Math.round(s * 0.75)
  }
  throw new Error('No se pudo reducir la imagen lo suficiente; pruebe con otra más simple')
}
