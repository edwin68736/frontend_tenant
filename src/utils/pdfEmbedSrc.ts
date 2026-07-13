/**
 * URL para iframe/object: visor PDF nativo del navegador con barra (imprimir, descargar, zoom).
 *
 * `fit` controla el zoom inicial:
 * - 'page'  → ajusta la página completa al visor (ideal A4: se ve todo sin bajar el zoom).
 * - 'width' → ajusta al ancho (scroll vertical).
 * - undefined → 100% (tamaño real; adecuado para ticket angosto).
 *
 * Se emiten los parámetros estándar (`view=Fit`/`FitH`) y los del visor pdf.js
 * (`zoom=page-fit`/`page-width`) para máxima compatibilidad entre motores.
 */
export function pdfEmbedSrc(blobUrl: string, opts?: { fit?: 'page' | 'width' }): string {
  const base = blobUrl.split('#')[0]
  const parts = ['toolbar=1', 'navpanes=0', 'scrollbar=1']
  if (opts?.fit === 'page') parts.push('view=Fit', 'zoom=page-fit')
  else if (opts?.fit === 'width') parts.push('view=FitH', 'zoom=page-width')
  else parts.push('zoom=100')
  return `${base}#${parts.join('&')}`
}
