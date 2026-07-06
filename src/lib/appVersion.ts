import manifest from '../../tukifac-tenant.version.json'

/** Nombre visible de la app (Tukifac). */
export const TUKIFAC_APP_NAME = manifest.displayName || 'Tukifac'

/** Versión semver mostrada al usuario (ej. 1.1.4). */
export const TUKIFAC_VERSION = manifest.version

/** Código entero para Android (Play Store / APK). */
export const TUKIFAC_VERSION_CODE = manifest.versionCode

/** Etiqueta lista para UI: "Tukifac 1.1.4". */
export const TUKIFAC_VERSION_LABEL = `${TUKIFAC_APP_NAME} ${TUKIFAC_VERSION}`
