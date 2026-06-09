/** URL para iframe/object: visor PDF nativo del navegador con barra (imprimir, descargar, zoom). */
export function pdfEmbedSrc(blobUrl: string): string {
  const base = blobUrl.split('#')[0]
  return `${base}#toolbar=1&navpanes=0&scrollbar=1`
}
