/** Cómo se listan los productos en el POS: tarjetas (por defecto) o lista compacta. */
export type PosProductViewMode = 'grid' | 'list'

const STORAGE_KEY = 'tukifac_pos_product_view_mode_v1'

/** Grid por defecto: es como se ha visto siempre. */
export function readPosProductViewMode(): PosProductViewMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'list' ? 'list' : 'grid'
  } catch {
    return 'grid'
  }
}

export function savePosProductViewMode(mode: PosProductViewMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  } catch {
    /* quota */
  }
}
