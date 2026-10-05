/**
 * Mensaje para un cobro que falló. Sin respuesta HTTP (red lenta, timeout) el servidor pudo haber
 * guardado la venta igualmente: se avisa que reintentar es seguro (el cobro lleva una clave de
 * idempotencia, ver utils/idempotencyKey.ts) para que el cajero no la dé por perdida ni la rehaga
 * cambiando el carrito.
 */
export function checkoutErrorMessage(err: unknown, fallback = 'Error procesando venta'): string {
  const e = err as { response?: unknown; code?: string; message?: string }
  const noResponse = !e?.response && (e?.code === 'ERR_NETWORK' || e?.code === 'ECONNABORTED' || e?.code === 'ETIMEDOUT' || e?.message === 'Network Error')
  if (noResponse) {
    return 'No se recibió respuesta del servidor. Es posible que el cobro sí se haya registrado: vuelve a pulsar el botón de cobrar (no se duplicará) o revisa en Consulta de comprobantes.'
  }
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback
}
