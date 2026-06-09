import { PosPrintersSettings } from '@/components/settings/PosPrintersSettings'
import { DevServerSettings } from '@/components/settings/DevServerSettings'
import { isDevelopmentMode } from '@/lib/runtime/environment'

export default function AjustesPage() {
  return (
    <div className="w-full max-w-3xl mx-auto pb-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Ajustes</h1>
        <p className="mt-1 text-sm text-gray-600">
          Configure la impresora de comprobantes en este dispositivo (Windows o Android).
        </p>
      </div>

      {isDevelopmentMode() && <DevServerSettings />}

      <PosPrintersSettings />
    </div>
  )
}
