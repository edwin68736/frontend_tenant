import { normalizePreparationAreaKey } from '@/constants/preparationAreas'
import { loadStoredPrinterSettings, normalizeSlot } from './storage'
import { isPrinterConfigReady, resolvePrinterConfig } from './resolve'
import type { PrinterConfig } from './types'

/** Impresora por defecto para comandas (sin área o fallback). */
export function getConfiguredComandaDefaultPrinter(): PrinterConfig | null {
  return resolvePrinterConfig(loadStoredPrinterSettings().comandasDefault)
}

/**
 * Impresora para un área de preparación.
 * Sin área o sin config dedicada válida → impresora por defecto.
 */
export function getConfiguredComandaPrinter(preparationArea?: string | null): PrinterConfig | null {
  const settings = loadStoredPrinterSettings()
  const defaultResolved = resolvePrinterConfig(settings.comandasDefault)
  const areaKey = normalizePreparationAreaKey(preparationArea)

  if (!areaKey) {
    return defaultResolved
  }

  const areaRaw = settings.comandasByArea[areaKey]
  if (!areaRaw) {
    return defaultResolved
  }

  const areaResolved = resolvePrinterConfig(normalizeSlot(areaRaw))
  return areaResolved ?? defaultResolved
}

export function isComandaAutoPrintEnabled(): boolean {
  return loadStoredPrinterSettings().comandasDefault.autoPrint !== false
}

export function hasAnyComandaPrinterConfigured(): boolean {
  if (getConfiguredComandaDefaultPrinter()) return true
  const byArea = loadStoredPrinterSettings().comandasByArea
  return Object.values(byArea).some((c) => isPrinterConfigReady(c))
}
