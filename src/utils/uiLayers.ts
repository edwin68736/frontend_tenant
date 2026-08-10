/** Capas z-index para modales POS y dropdowns en portal. */
export const PORTAL_MODAL_Z = 'z-[300]'
export const PORTAL_MODAL_STACK_Z = 'z-[350]'
/** Drawer carrito POS móvil (encima del header y sidebar). */
export const POS_CART_DRAWER_Z = 'z-[320]'
/** Escáner con cámara (encima de modales de cobro). */
export const BARCODE_SCANNER_Z = 'z-[400]'
export const CAMERA_SCANNER_Z = BARCODE_SCANNER_Z
/** Modales que se abren DESDE SubscriptionBlockedScreen (bloqueo de suscripción, z-400): deben
 * quedar por encima de ese overlay, no debajo. */
export const SUBSCRIPTION_BLOCKED_MODAL_Z = 'z-[410]'
/** Lightbox de QR (zoom/descargar/compartir): siempre el elemento más al frente posible, sin
 * importar desde qué modal se abra (pago, picker de plan sobre el bloqueo, etc.). */
export const LIGHTBOX_Z = 'z-[420]'
export const DROPDOWN_Z_INDEX = 450
/** Drawer información adicional (Nuevo Comprobante) — portal en body. */
export const FISCAL_DRAWER_OVERLAY_Z = 'z-[280]'
export const FISCAL_DRAWER_PANEL_Z = 'z-[285]'
export const FISCAL_DRAWER_TAB_Z = 'z-[290]'
