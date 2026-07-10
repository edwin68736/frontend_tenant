import { toast } from 'sonner'
import { isCapacitorAndroid } from '@/lib/platform/detect'

const ANDROID_DOWNLOAD_DIR = 'Tukifac'

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('No se pudo leer el archivo'))
        return
      }
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('No se pudo convertir el archivo'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Error al leer el archivo'))
    reader.readAsDataURL(blob)
  })
}

function downloadViaAnchor(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2500)
}

async function saveBlobOnAndroid(blob: Blob, fileName: string): Promise<void> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const safeName = fileName.replace(/[/\\?%*:|"<>]/g, '_')
  const path = `${ANDROID_DOWNLOAD_DIR}/${safeName}`
  const base64 = await blobToBase64(blob)
  await Filesystem.writeFile({
    path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  })
  toast.success(`Archivo guardado en Documentos/${path}`)
}

/** Descarga o guarda un blob según la plataforma (web/Tauri o Capacitor Android). */
export async function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  if (isCapacitorAndroid()) {
    await saveBlobOnAndroid(blob, fileName)
    return
  }
  downloadViaAnchor(blob, fileName)
}

/** Guarda un jsPDF usando downloadBlob (compatible con Android). */
export async function downloadJsPdf(doc: { output(type: 'blob'): Blob }, fileName: string): Promise<void> {
  const blob = doc.output('blob')
  await downloadBlob(blob, fileName)
}
