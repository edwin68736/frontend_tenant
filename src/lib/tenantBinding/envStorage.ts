import { getAppEnvironment, type AppEnvironment } from '@/lib/runtime/environment'

const DEV_LS_KEY = 'tukifac_tenant_binding_dev_v1'
const PROD_PREFS_KEY = 'tukifac_tenant_binding_v1'
const DEV_PREFS_KEY = 'tukifac_tenant_binding_dev_v1'

export function currentBindingEnvironment(): AppEnvironment {
  return getAppEnvironment()
}

export function prefsKeyForEnvironment(env: AppEnvironment = currentBindingEnvironment()): string {
  return env === 'development' ? DEV_PREFS_KEY : PROD_PREFS_KEY
}

export function localStorageKeyForEnvironment(env: AppEnvironment = currentBindingEnvironment()): string {
  return env === 'development' ? DEV_LS_KEY : 'tukifac_tenant_binding_prod_v1'
}

export { DEV_LS_KEY, PROD_PREFS_KEY, DEV_PREFS_KEY }
