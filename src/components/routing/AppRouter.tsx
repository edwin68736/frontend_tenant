import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantBinding } from '@/contexts/TenantBindingContext'
import MainLayout from '@/layouts/MainLayout'
import LoginPage from '@/pages/auth/LoginPage'
import SsoPage from '@/pages/auth/SsoPage'
import RucPage from '@/pages/auth/RucPage'
import { isNativeShell } from '@/lib/platform/detect'

const EcommerceStorePage = lazy(() => import('@/pages/ecommerce/store/EcommerceStorePage'))

const HomePage = lazy(() => import('@/pages/home/HomePage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'))
const CombosPage = lazy(() => import('@/pages/products/CombosPage'))
const ServicesCatalogPage = lazy(() => import('@/pages/products/ServicesCatalogPage'))
const CategoriesPage = lazy(() => import('@/pages/products/CategoriesPage'))
const BrandsPage = lazy(() => import('@/pages/products/BrandsPage'))
const UnitsPage = lazy(() => import('@/pages/products/UnitsPage'))
const ContactsPage = lazy(() => import('@/pages/contacts/ContactsPage'))
const SalesPage = lazy(() => import('@/pages/sales/SalesPage'))
const SalesRegisterLegacyRedirect = lazy(() => import('@/pages/sales/SalesRegisterLegacyRedirect'))
const NotaVentaRegisterPage = lazy(() => import('@/pages/sales/NotaVentaRegisterPage'))
const QuotationsPage = lazy(() => import('@/pages/quotations/QuotationsPage'))
const QuotationRegisterPage = lazy(() => import('@/pages/quotations/QuotationRegisterPage'))
const POSPage = lazy(() => import('@/pages/pos/POSPage'))
const PurchasesPage = lazy(() => import('@/pages/purchases/PurchasesPage'))
const PurchaseRegisterPage = lazy(() => import('@/pages/purchases/PurchaseRegisterPage'))
const SuppliersPage = lazy(() => import('@/pages/contacts/SuppliersPage'))
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'))
const InventoryTransfersPage = lazy(() => import('@/pages/inventory/InventoryTransfersPage'))
const InventoryTransferHistoryPage = lazy(() => import('@/pages/inventory/InventoryTransferHistoryPage'))
const InventoryKardexPage = lazy(() => import('@/pages/inventory/InventoryKardexPage'))
const InventoryIngressPage = lazy(() => import('@/pages/inventory/InventoryIngressPage'))
const InventoryEgressPage = lazy(() => import('@/pages/inventory/InventoryEgressPage'))
const InventoryImportAdjustmentPage = lazy(() => import('@/pages/inventory/InventoryImportAdjustmentPage'))
const CashPage = lazy(() => import('@/pages/cash/CashPage'))
const CashIncomePage = lazy(() => import('@/pages/cash/CashIncomePage'))
const CashExpensePage = lazy(() => import('@/pages/cash/CashExpensePage'))
const CashSessionDetailPage = lazy(() => import('@/pages/cash/CashSessionDetailPage'))
const CashReportsPage = lazy(() => import('@/pages/cash/CashReportsPage'))
const ReceivablesPage = lazy(() => import('@/pages/receivables/ReceivablesPage'))
const PayablesPage = lazy(() => import('@/pages/payables/PayablesPage'))
const BankPage = lazy(() => import('@/pages/bank/BankPage'))
const PaymentMethodsPage = lazy(() => import('@/pages/cashbank/PaymentMethodsPage'))
const UsersPage = lazy(() => import('@/pages/users/UsersPage'))
const RolesPage = lazy(() => import('@/pages/users/RolesPage'))
const CompanyConfigPage = lazy(() => import('@/pages/company/CompanyConfigPage'))
const ErpSettingsRedirect = lazy(() =>
  import('@/components/settings/ErpSettingsRedirect').then((m) => ({ default: m.ErpSettingsRedirect })),
)
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'))
const SunatDocsPage = lazy(() => import('@/pages/billing/SunatDocsPage'))
const GuiaRemisionCreatePage = lazy(() => import('@/pages/billing/GuiaRemisionCreatePage'))
const GuiaListPage = lazy(() => import('@/pages/billing/GuiaListPage'))
const IndependentNoteCreatePage = lazy(() => import('@/pages/billing/IndependentNoteCreatePage'))
const TransportistasPage = lazy(() => import('@/pages/fleet/TransportistasPage'))
const ConductoresPage = lazy(() => import('@/pages/fleet/ConductoresPage'))
const VehiculosPage = lazy(() => import('@/pages/fleet/VehiculosPage'))
const ModulesPage = lazy(() => import('@/pages/modules/ModulesPage'))
const MembershipsPage = lazy(() => import('@/pages/memberships/MembershipsPage'))
const PedidosWebPage = lazy(() => import('@/pages/ecommerce/PedidosWebPage'))
const ReportsLayout = lazy(() => import('@/pages/reports/ReportsLayout'))
const SalesReportPage = lazy(() => import('@/pages/reports/SalesReportPage'))
const ProductsReportPage = lazy(() => import('@/pages/reports/ProductsReportPage'))
const SalesByProductReportPage = lazy(() => import('@/pages/reports/SalesByProductReportPage'))
const NotesReportPage = lazy(() => import('@/pages/reports/NotesReportPage'))
const PurchasesReportPage = lazy(() => import('@/pages/reports/PurchasesReportPage'))
const KardexReportPage = lazy(() => import('@/pages/reports/KardexReportPage'))
const CashReportPage = lazy(() => import('@/pages/reports/CashReportPage'))
const RestaurantTablesPage = lazy(() => import('@/pages/restaurant/RestaurantTablesPage'))
const RestaurantFloorsPage = lazy(() => import('@/pages/restaurant/RestaurantFloorsPage'))
const RestaurantProductsPage = lazy(() => import('@/pages/restaurant/RestaurantProductsPage'))
const RestaurantSettingsPage = lazy(() => import('@/pages/restaurant/RestaurantSettingsPage'))
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'))
const SubscriptionPage = lazy(() => import('@/pages/subscription/SubscriptionPage'))
const AjustesPage = lazy(() => import('@/pages/settings/AjustesPage'))

function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
    </div>
  )
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

function FallbackRedirect() {
  if (!isNativeShell()) return <Navigate to="/login" replace />
  const { isBound } = useTenantBinding()
  return <Navigate to={isBound ? '/login' : '/ruc'} replace />
}

function RequireNativeBinding({ children }: { children: ReactNode }) {
  if (!isNativeShell()) return <>{children}</>
  const { isBound } = useTenantBinding()
  if (!isBound) return <Navigate to="/ruc" replace />
  return <>{children}</>
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isNativeShell()) {
    const { isBound } = useTenantBinding()
    if (!isBound) return <Navigate to="/ruc" replace />
  }
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
      </div>
    )
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

/**
 * Bloquea la VISTA en sí, no solo el link del menú: el Sidebar oculta lo que el usuario no puede
 * usar, pero antes de esto cualquiera podía llegar a cualquier página tecleando la URL a mano
 * (RequireAuth solo comprobaba sesión iniciada). Cada ruta protegida abajo declara el permiso
 * "module.action" que ya exige su endpoint en el backend (ver pkg/middleware/permissions.go) —
 * mismo criterio que el Sidebar usa para decidir qué mostrar, para que "ocultar" y "bloquear"
 * nunca queden desincronizados.
 */
function Protected({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { hasPermission } = useAuth()
  // Un array exige CUALQUIERA de los permisos (ej. nota independiente: crédito O débito según
  // el body) — mismo criterio que RequireAnyPermission en el backend.
  const allowed = Array.isArray(perm) ? perm.some(hasPermission) : hasPermission(perm)
  if (!allowed) return <Navigate to="/home" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/ruc" element={<RucPage />} />
      <Route path="/auth/sso" element={<SsoPage />} />
      {/* Tienda pública (Catálogo Digital): sin login, layout propio, fuera de RequireAuth/MainLayout.
          "/*" además cubre "/ecommerce/" (slash final) y futuras subrutas sin caer en FallbackRedirect. */}
      <Route path="/ecommerce/*" element={<Lazy><EcommerceStorePage /></Lazy>} />
      <Route
        path="/login"
        element={
          <RequireNativeBinding>
            <LoginPage />
          </RequireNativeBinding>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<Lazy><HomePage /></Lazy>} />
        <Route path="dashboard" element={<Lazy><Protected perm="dashboard.view"><DashboardPage /></Protected></Lazy>} />
        <Route path="sales" element={<Lazy><Protected perm="sales.view"><SalesPage /></Protected></Lazy>} />
        <Route path="sales/register" element={<Lazy><Protected perm="sales.create"><SalesRegisterLegacyRedirect /></Protected></Lazy>} />
        <Route path="sales/nota-venta" element={<Lazy><Protected perm="sales.create"><NotaVentaRegisterPage /></Protected></Lazy>} />
        <Route path="sales/pos" element={<Lazy><Protected perm="sales.pos"><POSPage /></Protected></Lazy>} />
        <Route path="sales/receivables" element={<Lazy><Protected perm="receivables.view"><ReceivablesPage /></Protected></Lazy>} />
        <Route path="quotations" element={<Lazy><Protected perm="quotations.view"><QuotationsPage /></Protected></Lazy>} />
        <Route path="quotations/new" element={<Lazy><Protected perm="quotations.create"><QuotationRegisterPage /></Protected></Lazy>} />
        <Route path="quotations/:id/edit" element={<Lazy><Protected perm="quotations.edit"><QuotationRegisterPage /></Protected></Lazy>} />
        <Route path="purchases/register" element={<Lazy><Protected perm="purchases.create"><PurchaseRegisterPage /></Protected></Lazy>} />
        <Route path="purchases/suppliers" element={<Lazy><Protected perm="contacts.view"><SuppliersPage /></Protected></Lazy>} />
        <Route path="purchases/payables" element={<Lazy><Protected perm="payables.view"><PayablesPage /></Protected></Lazy>} />
        <Route path="purchases" element={<Lazy><Protected perm="purchases.view"><PurchasesPage /></Protected></Lazy>} />
        <Route path="products" element={<Lazy><Protected perm="products.view"><ProductsPage /></Protected></Lazy>} />
        <Route path="products/combos" element={<Lazy><Protected perm="products.view"><CombosPage /></Protected></Lazy>} />
        <Route path="products/services" element={<Lazy><Protected perm="products.view"><ServicesCatalogPage /></Protected></Lazy>} />
        <Route path="products/categories" element={<Lazy><Protected perm="products.view"><CategoriesPage /></Protected></Lazy>} />
        <Route path="products/brands" element={<Lazy><Protected perm="products.view"><BrandsPage /></Protected></Lazy>} />
        <Route path="products/units" element={<Lazy><Protected perm="products.view"><UnitsPage /></Protected></Lazy>} />
        <Route path="contacts" element={<Lazy><Protected perm="contacts.view"><ContactsPage /></Protected></Lazy>} />
        <Route path="inventory" element={<Lazy><Protected perm="inventory.view"><InventoryPage /></Protected></Lazy>} />
        <Route path="inventory/services" element={<Navigate to="/products/services" replace />} />
        <Route path="inventory/transfers" element={<Lazy><Protected perm="inventory.manage"><InventoryTransfersPage /></Protected></Lazy>} />
        <Route path="inventory/transfers/history" element={<Lazy><Protected perm="inventory.manage"><InventoryTransferHistoryPage /></Protected></Lazy>} />
        <Route path="inventory/ingress" element={<Lazy><Protected perm="inventory.manage"><InventoryIngressPage /></Protected></Lazy>} />
        <Route path="inventory/ingress/new" element={<Lazy><Protected perm="inventory.manage"><InventoryIngressPage /></Protected></Lazy>} />
        <Route path="inventory/ingress/:id/edit" element={<Lazy><Protected perm="inventory.manage"><InventoryIngressPage /></Protected></Lazy>} />
        <Route path="inventory/egress" element={<Lazy><Protected perm="inventory.manage"><InventoryEgressPage /></Protected></Lazy>} />
        <Route path="inventory/egress/new" element={<Lazy><Protected perm="inventory.manage"><InventoryEgressPage /></Protected></Lazy>} />
        <Route path="inventory/egress/:id/edit" element={<Lazy><Protected perm="inventory.manage"><InventoryEgressPage /></Protected></Lazy>} />
        <Route path="inventory/kardex" element={<Lazy><Protected perm="inventory.view"><InventoryKardexPage /></Protected></Lazy>} />
        <Route path="inventory/import-adjustment" element={<Lazy><Protected perm="inventory.manage"><InventoryImportAdjustmentPage /></Protected></Lazy>} />
        <Route path="cashbank/cash" element={<Lazy><Protected perm="cashbank.view"><CashPage /></Protected></Lazy>} />
        <Route path="cashbank/income" element={<Lazy><Protected perm="cashbank.view"><CashIncomePage /></Protected></Lazy>} />
        <Route path="cashbank/expenses" element={<Lazy><Protected perm="cashbank.view"><CashExpensePage /></Protected></Lazy>} />
        <Route path="cashbank/cash/:id" element={<Lazy><Protected perm="cashbank.view"><CashSessionDetailPage /></Protected></Lazy>} />
        <Route path="cashbank/reports" element={<Lazy><Protected perm="cashbank.view"><CashReportsPage /></Protected></Lazy>} />
        <Route path="cashbank/receivables" element={<Navigate to="/sales/receivables" replace />} />
        <Route path="cashbank/bank" element={<Lazy><Protected perm="cashbank.view"><BankPage /></Protected></Lazy>} />
        <Route path="cashbank/payment-methods" element={<Lazy><Protected perm="cashbank.manage"><PaymentMethodsPage /></Protected></Lazy>} />
        <Route path="billing" element={<Lazy><Protected perm="billing.send"><BillingPage /></Protected></Lazy>} />
        {/* Nota de crédito/débito independiente (Fase 3): sin venta local, documento afectado a mano.
            Un solo formulario sirve ambos tipos según lo que elija el usuario — exige cualquiera
            de los dos permisos, igual que el backend (RequireAnyPermission). */}
        <Route path="billing/notes/new" element={<Lazy><Protected perm={['billing.credit_note', 'billing.debit_note']}><IndependentNoteCreatePage /></Protected></Lazy>} />
        {/* Guías de remisión: vistas independientes por tipo (remitente 09 / transportista 31). */}
        <Route path="billing/docs/despatches/:guiaTipo/new" element={<Lazy><Protected perm="billing.despatch"><GuiaRemisionCreatePage /></Protected></Lazy>} />
        <Route path="billing/docs/despatches/:guiaTipo" element={<Lazy><Protected perm="billing.despatch"><GuiaListPage /></Protected></Lazy>} />
        {/* Compatibilidad con enlaces viejos a la vista combinada. */}
        <Route path="billing/docs/despatches/new" element={<Navigate to="/billing/docs/despatches/remitente/new" replace />} />
        <Route path="billing/docs/despatches" element={<Navigate to="/billing/docs/despatches/remitente" replace />} />
        <Route path="billing/docs" element={<Navigate to="/billing/docs/retentions" replace />} />
        <Route path="billing/docs/:docType" element={<Lazy><Protected perm="billing.advanced_docs"><SunatDocsPage /></Protected></Lazy>} />
        <Route path="fleet/carriers" element={<Lazy><Protected perm="fleet.view"><TransportistasPage /></Protected></Lazy>} />
        <Route path="fleet/drivers" element={<Lazy><Protected perm="fleet.view"><ConductoresPage /></Protected></Lazy>} />
        <Route path="fleet/vehicles" element={<Lazy><Protected perm="fleet.view"><VehiculosPage /></Protected></Lazy>} />
        <Route path="modules" element={<Lazy><Protected perm="modules.manage"><ModulesPage /></Protected></Lazy>} />
        <Route path="memberships" element={<Lazy><Protected perm="memberships.view"><MembershipsPage /></Protected></Lazy>} />
        <Route path="sales/pedidos-web" element={<Lazy><Protected perm="ecommerce.orders"><PedidosWebPage /></Protected></Lazy>} />
        <Route path="reports" element={<Lazy><ReportsLayout /></Lazy>}>
          <Route index element={<Navigate to="/reports/sales" replace />} />
          <Route path="sales" element={<Lazy><Protected perm="sales.view"><SalesReportPage /></Protected></Lazy>} />
          <Route path="products" element={<Lazy><Protected perm="products.view"><ProductsReportPage /></Protected></Lazy>} />
          <Route path="sales-by-product" element={<Lazy><Protected perm="sales.view"><SalesByProductReportPage /></Protected></Lazy>} />
          <Route path="notes" element={<Lazy><Protected perm="sales.view"><NotesReportPage /></Protected></Lazy>} />
          <Route path="purchases" element={<Lazy><Protected perm="purchases.view"><PurchasesReportPage /></Protected></Lazy>} />
          <Route path="kardex" element={<Lazy><Protected perm="inventory.view"><KardexReportPage /></Protected></Lazy>} />
          <Route path="cash" element={<Lazy><Protected perm="cashbank.view"><CashReportPage /></Protected></Lazy>} />
        </Route>
        {/* Restaurant (Tukichef ERP-side): autorización propia vía pkg/restaurantperm en el
            backend (EmployeeType/PIN, no TenantPermission genérico) — no se gatea aquí para no
            mezclar los dos sistemas de permisos; cada endpoint ya valida del lado del servidor. */}
        <Route path="restaurant" element={<Lazy><RestaurantTablesPage /></Lazy>} />
        <Route path="restaurant/floors" element={<Lazy><RestaurantFloorsPage /></Lazy>} />
        <Route path="restaurant/products" element={<Lazy><RestaurantProductsPage /></Lazy>} />
        <Route path="restaurant/settings" element={<Lazy><RestaurantSettingsPage /></Lazy>} />
        <Route path="users" element={<Lazy><Protected perm="users.view"><UsersPage /></Protected></Lazy>} />
        <Route path="roles" element={<Lazy><Protected perm="roles.view"><RolesPage /></Protected></Lazy>} />
        <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
        <Route path="ajustes" element={<Lazy><AjustesPage /></Lazy>} />
        <Route path="subscription" element={<Lazy><Protected perm="subscription.view"><SubscriptionPage /></Protected></Lazy>} />
        <Route path="company/config" element={<Lazy><Protected perm="company.view"><CompanyConfigPage /></Protected></Lazy>} />
        <Route path="company/sunat" element={<Lazy><Protected perm="company.view"><ErpSettingsRedirect companyTab="impuestos" /></Protected></Lazy>} />
        <Route path="company/branches" element={<Lazy><Protected perm="company.view"><ErpSettingsRedirect companyTab="sucursales" /></Protected></Lazy>} />
        <Route path="company/series" element={<Lazy><Protected perm="company.view"><ErpSettingsRedirect companyTab="series" /></Protected></Lazy>} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
      <Route path="*" element={<FallbackRedirect />} />
    </Routes>
  )
}

export default function AppRouter() {
  const Router = isNativeShell() ? HashRouter : BrowserRouter
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}
