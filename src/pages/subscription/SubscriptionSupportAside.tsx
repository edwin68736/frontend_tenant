import { Headphones } from 'lucide-react'
import type { SupportConfig } from '@/services/subscription.service'
import SupportCard from './SupportCard'

type Props = { support: SupportConfig }

/** Columna de soporte junto a «Suscripción actual» (estrecha en desktop, fila en móvil). */
export default function SubscriptionSupportAside({ support }: Props) {
  return (
    <aside className="rounded-2xl border border-gray-100 bg-gray-50/90 shadow-sm p-3 flex flex-col min-h-0 md:min-h-full">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5 mb-2 shrink-0">
        <Headphones size={12} />
        Soporte
      </p>
      <div className="hidden md:flex flex-col flex-1 min-h-0">
        <SupportCard support={support} variant="column" />
      </div>
      <div className="md:hidden">
        <SupportCard support={support} variant="compact" />
      </div>
    </aside>
  )
}
