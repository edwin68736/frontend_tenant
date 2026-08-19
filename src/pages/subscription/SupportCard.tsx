import { Mail, Phone } from 'lucide-react'
import type { SupportConfig } from '@/services/subscription.service'
import { buildSupportWhatsAppHref, openExternalUrl } from '@/utils/supportWhatsApp'
import { WhatsAppGlyph } from '@/components/icons/WhatsAppGlyph'

type Channel = {
  key: string
  label: string
  text: string
  href: string
  external?: boolean
  icon: React.ReactNode
  cardClass: string
  iconWrapClass: string
}

function buildChannels(support: SupportConfig): Channel[] {
  const channels: Channel[] = []
  const waHref = buildSupportWhatsAppHref(support)
  if (waHref) {
    channels.push({
      key: 'whatsapp',
      label: 'WhatsApp',
      text: support.whatsapp ?? '',
      href: waHref,
      external: true,
      icon: <WhatsAppGlyph className="w-5 h-5" />,
      cardClass: 'border-emerald-200 bg-emerald-50/80 hover:bg-emerald-50',
      iconWrapClass: 'bg-emerald-500 text-white',
    })
  }
  if (support.email) {
    channels.push({
      key: 'email',
      label: 'Correo',
      text: support.email,
      href: `mailto:${support.email}`,
      icon: <Mail size={20} />,
      cardClass: 'border-blue-200 bg-blue-50/80 hover:bg-blue-50',
      iconWrapClass: 'bg-blue-600 text-white',
    })
  }
  if (support.phone) {
    channels.push({
      key: 'phone',
      label: 'Teléfono',
      text: support.phone,
      href: `tel:${support.phone}`,
      icon: <Phone size={20} />,
      cardClass: 'border-violet-200 bg-violet-50/80 hover:bg-violet-50',
      iconWrapClass: 'bg-violet-600 text-white',
    })
  }
  return channels
}

type Props = {
  support: SupportConfig
  variant?: 'default' | 'compact' | 'column'
}

export default function SupportCard({ support, variant = 'default' }: Props) {
  const channels = buildChannels(support)

  if (channels.length === 0) {
    return <p className="text-xs text-gray-500">Contacte a soporte Tukifac.</p>
  }

  if (variant === 'compact') {
    return (
      <div className="flex flex-wrap justify-center sm:justify-start gap-2">
        {channels.map(ch => (
          <a
            key={ch.key}
            href={ch.href}
            target={ch.external ? '_blank' : undefined}
            rel={ch.external ? 'noreferrer' : undefined}
            onClick={e => {
              if (!ch.external) return
              e.preventDefault()
              void openExternalUrl(ch.href)
            }}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors touch-manipulation ${ch.cardClass}`}
            title={ch.text}
          >
            <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ch.iconWrapClass}`}>
              {ch.icon}
            </span>
            <span className="text-gray-800">{ch.label}</span>
          </a>
        ))}
      </div>
    )
  }

  if (variant === 'column') {
    return (
      <div className="flex flex-col gap-1.5 w-full flex-1 justify-center">
        {channels.map(ch => (
          <a
            key={ch.key}
            href={ch.href}
            target={ch.external ? '_blank' : undefined}
            rel={ch.external ? 'noreferrer' : undefined}
            onClick={e => {
              if (!ch.external) return
              e.preventDefault()
              void openExternalUrl(ch.href)
            }}
            className={`flex flex-col items-center justify-center gap-1 px-2 py-2.5 rounded-xl border text-center transition-colors touch-manipulation ${ch.cardClass}`}
            title={ch.text}
          >
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ch.iconWrapClass}`}>
              {ch.icon}
            </span>
            <span className="text-[10px] font-bold leading-tight text-gray-800">{ch.label}</span>
          </a>
        ))}
      </div>
    )
  }

  return (
    <ul className="space-y-2">
      {channels.map(ch => (
        <li key={ch.key}>
          <a
            href={ch.href}
            target={ch.external ? '_blank' : undefined}
            rel={ch.external ? 'noreferrer' : undefined}
            onClick={e => {
              if (!ch.external) return
              e.preventDefault()
              void openExternalUrl(ch.href)
            }}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${ch.cardClass}`}
          >
            <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${ch.iconWrapClass}`}>
              {ch.icon}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-gray-800">{ch.label}</span>
              <span className="block text-xs text-gray-600 truncate">{ch.text}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}
