import { TUKIFAC_VERSION, TUKIFAC_VERSION_LABEL } from '@/lib/appVersion'

type Props = {
  className?: string
  /** En menú compacto solo muestra "v1.1.4". */
  compact?: boolean
}

export function AppVersionBadge({ className = '', compact = false }: Props) {
  return (
    <p
      className={`text-xs text-gray-500 tabular-nums ${className}`}
      title={TUKIFAC_VERSION_LABEL}
    >
      {compact ? `v${TUKIFAC_VERSION}` : TUKIFAC_VERSION_LABEL}
    </p>
  )
}
