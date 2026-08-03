import { useAuth } from '@/contexts/AuthContext'
import {
  ShoppingCart,
  Receipt,
  FileText,
  Truck,
  Tag,
  Wallet,
  LayoutDashboard,
  Grid3x3,
} from 'lucide-react'
import { HomeTutorialsPromoSection } from '@/components/home/HomeTutorialsPromoSection'
import { HomeKpiCards } from '@/components/home/HomeKpiCards'
import { HomeGreeting } from '@/components/home/HomeGreeting'
import { HomeQuickAccessGrid, type QuickLink } from '@/components/home/HomeQuickAccessGrid'
import { isCapacitorAndroid } from '@/lib/platform/detect'
import { useDesktopViewport, useTabletViewport } from '@/hooks/useMediaQuery'

export default function HomePage() {
  const { modules } = useAuth()

  // El hook va primero y sin condiciones: dentro de un `||` el short-circuit podría saltárselo.
  const isDesktop = useDesktopViewport()
  // Los tutoriales se muestran por TAMAÑO (tablet o mayor), no por plataforma: en teléfono
  // no hacen falta, desde tablet sí. Independiente del gate de los KPIs (compactHome).
  const showTutorials = useTabletViewport()
  // El home compacto (solo promociones + accesos rápidos) aplica en Android y también en
  // web con pantalla angosta: en móvil los totales empujan los accesos rápidos fuera de vista.
  const compactHome = isCapacitorAndroid() || !isDesktop

  const hasModule = (key: string) => modules.includes(key)

  const quickLinks: QuickLink[] = [
    hasModule('sales') && {
      to: '/sales/pos',
      icon: ShoppingCart,
      label: 'Punto de venta',
      description: 'Crear ventas rápidas desde POS',
    },
    hasModule('sales') && {
      to: '/sales',
      icon: Receipt,
      label: 'Notas de venta',
      description: 'Notas de venta internas (SUNAT 00), sin envío obligatorio',
      newTo: '/sales/nota-venta',
    },
    hasModule('sales') && {
      to: '/quotations',
      icon: FileText,
      label: 'Cotizaciones',
      description: 'Cotiza precios antes de emitir el comprobante',
      newTo: '/quotations/new',
    },
    hasModule('purchases') && {
      to: '/purchases',
      icon: Truck,
      label: 'Compras',
      description: 'Registra facturas y boletas de tus proveedores',
      newTo: '/purchases/register',
    },
    hasModule('products') && {
      to: '/products',
      icon: Tag,
      label: 'Productos',
      description: 'Gestiona tu catálogo y precios',
    },
    hasModule('cashbank') && {
      to: '/cashbank/cash',
      icon: Wallet,
      label: 'Caja',
      description: 'Abrir o revisar sesiones de caja',
    },
    {
      to: '/modules',
      icon: Grid3x3,
      label: 'Módulos',
      description: 'Explora módulos adicionales como Restaurante',
    },
    {
      to: '/dashboard',
      icon: LayoutDashboard,
      label: 'Dashboard',
      description: 'Ver resumen general del negocio',
    },
  ].filter(Boolean) as QuickLink[]

  return (
    <div className="-m-1 space-y-5 md:-m-2 md:space-y-8">
      <HomeGreeting />

      {/* Bienvenida + promociones */}
      <section aria-label="Promociones">
        <HomeTutorialsPromoSection withWelcomeCard={showTutorials} />
      </section>

      {!compactHome && (
        <section aria-label="Resumen de ventas y compras">
          <HomeKpiCards />
        </section>
      )}

      {/* Accesos rápidos */}
      {quickLinks.length > 0 && (
        <section className="space-y-3 pb-1">
          <div>
            <h2 className="text-base font-bold text-gray-900">Accesos rápidos</h2>
            <p className="mt-0.5 text-xs text-gray-500">Atajos a las secciones más usadas</p>
          </div>
          <HomeQuickAccessGrid links={quickLinks} />
        </section>
      )}
    </div>
  )
}
