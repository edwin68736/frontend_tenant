/** Píxeles por mm al rasterizar QR/logos (~300 DPI térmica). */
export const RECEIPT_RASTER_PX_PER_MM = 12

export const RECEIPT_QR_MIN_PX = 288

export function rasterPxForMm(sizeMm: number): number {
  return Math.max(RECEIPT_QR_MIN_PX, Math.round(sizeMm * RECEIPT_RASTER_PX_PER_MM))
}

/**
 * Mínimo de píxeles del lado largo del logo embebido en PDF. Subió de 320 a 640 al agrandar los
 * tamaños de logo (hasta ~64 mm en ticket y ~65 mm en A4): a 320 px un logo grande quedaba
 * pixelado.
 */
export const RECEIPT_LOGO_MIN_PX = 640
