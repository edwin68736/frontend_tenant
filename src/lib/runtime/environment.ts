/** Entorno de compilación / ejecución (no confundir con runtime Capacitor/Tauri). */
export type AppEnvironment = 'development' | 'production'

export function getAppEnvironment(): AppEnvironment {
  return import.meta.env.DEV ? 'development' : 'production'
}

export function isDevelopmentMode(): boolean {
  return getAppEnvironment() === 'development'
}

export function isProductionMode(): boolean {
  return !isDevelopmentMode()
}
