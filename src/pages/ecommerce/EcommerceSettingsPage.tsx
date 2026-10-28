import { NavLink, Navigate, useParams } from 'react-router-dom'
import { Settings2, Grid3x3, Image as ImageIcon } from 'lucide-react'
import { clsx } from 'clsx'
import EcommerceGeneralSettings from '@/pages/ecommerce/EcommerceGeneralSettings'
import EcommerceDesignSettings from '@/pages/ecommerce/EcommerceDesignSettings'
import EcommerceBannersSettings from '@/pages/ecommerce/EcommerceBannersSettings'

const SECTIONS = [
  { id: 'general', label: 'General', icon: <Settings2 size={13} /> },
  { id: 'design', label: 'Diseño', icon: <Grid3x3 size={13} /> },
  { id: 'banners', label: 'Banners', icon: <ImageIcon size={13} /> },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** Ajustes de la tienda virtual con acceso directo desde el sidebar (mismo contenido que Módulos > Tienda virtual). */
export default function EcommerceSettingsPage() {
  const { section } = useParams<{ section: string }>()
  const current = SECTIONS.find((s) => s.id === section)?.id as SectionId | undefined
  if (!current) return <Navigate to="/store-settings/general" replace />

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Tienda virtual · ajustes</h2>
        <p className="text-sm text-gray-500">Configura y diseña tu catálogo digital.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <NavLink
              key={s.id}
              to={`/store-settings/${s.id}`}
              className={clsx(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition',
                s.id === current
                  ? 'bg-[rgb(var(--p600))] border-[rgb(var(--p600))] text-white'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50',
              )}
            >
              {s.icon}
              <span>{s.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="p-4 md:p-5">
          {current === 'general' && <EcommerceGeneralSettings />}
          {current === 'design' && <EcommerceDesignSettings />}
          {current === 'banners' && <EcommerceBannersSettings />}
        </div>
      </div>
    </div>
  )
}
