import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantBinding } from '@/contexts/TenantBindingContext'
import MainLayout from '@/layouts/MainLayout'
import LoginPage from '@/pages/auth/LoginPage'
import RucPage from '@/pages/auth/RucPage'
import { isNativeShell } from '@/lib/platform/detect'

const HomePage = lazy(() => import('@/pages/home/HomePage'))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage'))
const ProductsPage = lazy(() => import('@/pages/products/ProductsPage'))
const ServicesCatalogPage = lazy(() => import('@/pages/products/ServicesCatalogPage'))
const CategoriesPage = lazy(() => import('@/pages/products/CategoriesPage'))
const BrandsPage = lazy(() => import('@/pages/products/BrandsPage'))
const ContactsPage = lazy(() => import('@/pages/contacts/ContactsPage'))
const SalesPage = lazy(() => import('@/pages/sales/SalesPage'))
const SalesRegisterLegacyRedirect = lazy(() => import('@/pages/sales/SalesRegisterLegacyRedirect'))
const NotaVentaRegisterPage = lazy(() => import('@/pages/sales/NotaVentaRegisterPage'))
const QuotationsPage = lazy(() => import('@/pages/quotations/QuotationsPage'))
const QuotationRegisterPage = lazy(() => import('@/pages/quotations/QuotationRegisterPage'))
const POSPage = lazy(() => import('@/pages/pos/POSPage'))
const PurchasesPage = lazy(() => import('@/pages/purchases/PurchasesPage'))
const InventoryPage = lazy(() => import('@/pages/inventory/InventoryPage'))
const InventoryTransfersPage = lazy(() => import('@/pages/inventory/InventoryTransfersPage'))
const InventoryKardexPage = lazy(() => import('@/pages/inventory/InventoryKardexPage'))
const CashPage = lazy(() => import('@/pages/cash/CashPage'))
const CashReportsPage = lazy(() => import('@/pages/cash/CashReportsPage'))
const ReceivablesPage = lazy(() => import('@/pages/receivables/ReceivablesPage'))
const BankPage = lazy(() => import('@/pages/bank/BankPage'))
const PaymentMethodsPage = lazy(() => import('@/pages/cashbank/PaymentMethodsPage'))
const UsersPage = lazy(() => import('@/pages/users/UsersPage'))
const RolesPage = lazy(() => import('@/pages/users/RolesPage'))
const CompanyConfigPage = lazy(() => import('@/pages/company/CompanyConfigPage'))
const CompanySunatPage = lazy(() => import('@/pages/company/CompanySunatPage'))
const CompanyBranchesPage = lazy(() => import('@/pages/company/CompanyBranchesPage'))
const CompanySeriesPage = lazy(() => import('@/pages/company/CompanySeriesPage'))
const BillingPage = lazy(() => import('@/pages/billing/BillingPage'))
const SunatDocsPage = lazy(() => import('@/pages/billing/SunatDocsPage'))
const GuiaRemisionCreatePage = lazy(() => import('@/pages/billing/GuiaRemisionCreatePage'))
const TransportistasPage = lazy(() => import('@/pages/fleet/TransportistasPage'))
const ConductoresPage = lazy(() => import('@/pages/fleet/ConductoresPage'))
const VehiculosPage = lazy(() => import('@/pages/fleet/VehiculosPage'))
const ModulesPage = lazy(() => import('@/pages/modules/ModulesPage'))
const MembershipsPage = lazy(() => import('@/pages/memberships/MembershipsPage'))
const ReportsLayout = lazy(() => import('@/pages/reports/ReportsLayout'))
const SalesReportPage = lazy(() => import('@/pages/reports/SalesReportPage'))
const ProductsReportPage = lazy(() => import('@/pages/reports/ProductsReportPage'))
const SalesByProductReportPage = lazy(() => import('@/pages/reports/SalesByProductReportPage'))
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/ruc" element={<RucPage />} />
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
        <Route path="dashboard" element={<Lazy><DashboardPage /></Lazy>} />
        <Route path="sales" element={<Lazy><SalesPage /></Lazy>} />
        <Route path="sales/register" element={<Lazy><SalesRegisterLegacyRedirect /></Lazy>} />
        <Route path="sales/nota-venta" element={<Lazy><NotaVentaRegisterPage /></Lazy>} />
        <Route path="sales/pos" element={<Lazy><POSPage /></Lazy>} />
        <Route path="quotations" element={<Lazy><QuotationsPage /></Lazy>} />
        <Route path="quotations/new" element={<Lazy><QuotationRegisterPage /></Lazy>} />
        <Route path="quotations/:id/edit" element={<Lazy><QuotationRegisterPage /></Lazy>} />
        <Route path="purchases" element={<Lazy><PurchasesPage /></Lazy>} />
        <Route path="products" element={<Lazy><ProductsPage /></Lazy>} />
        <Route path="products/services" element={<Lazy><ServicesCatalogPage /></Lazy>} />
        <Route path="products/categories" element={<Lazy><CategoriesPage /></Lazy>} />
        <Route path="products/brands" element={<Lazy><BrandsPage /></Lazy>} />
        <Route path="contacts" element={<Lazy><ContactsPage /></Lazy>} />
        <Route path="inventory" element={<Lazy><InventoryPage /></Lazy>} />
        <Route path="inventory/services" element={<Navigate to="/products/services" replace />} />
        <Route path="inventory/transfers" element={<Lazy><InventoryTransfersPage /></Lazy>} />
        <Route path="inventory/kardex" element={<Lazy><InventoryKardexPage /></Lazy>} />
        <Route path="cashbank/cash" element={<Lazy><CashPage /></Lazy>} />
        <Route path="cashbank/reports" element={<Lazy><CashReportsPage /></Lazy>} />
        <Route path="cashbank/receivables" element={<Lazy><ReceivablesPage /></Lazy>} />
        <Route path="cashbank/bank" element={<Lazy><BankPage /></Lazy>} />
        <Route path="cashbank/payment-methods" element={<Lazy><PaymentMethodsPage /></Lazy>} />
        <Route path="billing" element={<Lazy><BillingPage /></Lazy>} />
        <Route path="billing/docs/despatches/new" element={<Lazy><GuiaRemisionCreatePage /></Lazy>} />
        <Route path="billing/docs" element={<Navigate to="/billing/docs/despatches" replace />} />
        <Route path="billing/docs/:docType" element={<Lazy><SunatDocsPage /></Lazy>} />
        <Route path="fleet/carriers" element={<Lazy><TransportistasPage /></Lazy>} />
        <Route path="fleet/drivers" element={<Lazy><ConductoresPage /></Lazy>} />
        <Route path="fleet/vehicles" element={<Lazy><VehiculosPage /></Lazy>} />
        <Route path="modules" element={<Lazy><ModulesPage /></Lazy>} />
        <Route path="memberships" element={<Lazy><MembershipsPage /></Lazy>} />
        <Route path="reports" element={<Lazy><ReportsLayout /></Lazy>}>
          <Route index element={<Navigate to="/reports/sales" replace />} />
          <Route path="sales" element={<Lazy><SalesReportPage /></Lazy>} />
          <Route path="products" element={<Lazy><ProductsReportPage /></Lazy>} />
          <Route path="sales-by-product" element={<Lazy><SalesByProductReportPage /></Lazy>} />
          <Route path="purchases" element={<Lazy><PurchasesReportPage /></Lazy>} />
          <Route path="kardex" element={<Lazy><KardexReportPage /></Lazy>} />
          <Route path="cash" element={<Lazy><CashReportPage /></Lazy>} />
        </Route>
        <Route path="restaurant" element={<Lazy><RestaurantTablesPage /></Lazy>} />
        <Route path="restaurant/floors" element={<Lazy><RestaurantFloorsPage /></Lazy>} />
        <Route path="restaurant/products" element={<Lazy><RestaurantProductsPage /></Lazy>} />
        <Route path="restaurant/settings" element={<Lazy><RestaurantSettingsPage /></Lazy>} />
        <Route path="users" element={<Lazy><UsersPage /></Lazy>} />
        <Route path="roles" element={<Lazy><RolesPage /></Lazy>} />
        <Route path="profile" element={<Lazy><ProfilePage /></Lazy>} />
        <Route path="ajustes" element={<Lazy><AjustesPage /></Lazy>} />
        <Route path="subscription" element={<Lazy><SubscriptionPage /></Lazy>} />
        <Route path="company/config" element={<Lazy><CompanyConfigPage /></Lazy>} />
        <Route path="company/sunat" element={<Lazy><CompanySunatPage /></Lazy>} />
        <Route path="company/branches" element={<Lazy><CompanyBranchesPage /></Lazy>} />
        <Route path="company/series" element={<Lazy><CompanySeriesPage /></Lazy>} />
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
