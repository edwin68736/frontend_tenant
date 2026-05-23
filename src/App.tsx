import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import MainLayout from '@/layouts/MainLayout'
import LoginPage from '@/pages/auth/LoginPage'
import HomePage from '@/pages/home/HomePage'
import DashboardPage from '@/pages/dashboard/DashboardPage'
import ProductsPage from '@/pages/products/ProductsPage'
import ContactsPage from '@/pages/contacts/ContactsPage'
import SalesPage from '@/pages/sales/SalesPage'
import SalesRegisterPage from '@/pages/sales/SalesRegisterPage'
import POSPage from '@/pages/pos/POSPage'
import PurchasesPage from '@/pages/purchases/PurchasesPage'
import InventoryPage from '@/pages/inventory/InventoryPage'
import InventoryTransfersPage from '@/pages/inventory/InventoryTransfersPage'
import InventoryKardexPage from '@/pages/inventory/InventoryKardexPage'
import ServicesPage from '@/pages/inventory/ServicesPage'
import CashPage from '@/pages/cash/CashPage'
import CashReportsPage from '@/pages/cash/CashReportsPage'
import BankPage from '@/pages/bank/BankPage'
import PaymentMethodsPage from '@/pages/cashbank/PaymentMethodsPage'
import UsersPage from '@/pages/users/UsersPage'
import RolesPage from '@/pages/users/RolesPage'
import CompanyConfigPage from '@/pages/company/CompanyConfigPage'
import CompanySunatPage from '@/pages/company/CompanySunatPage'
import CompanyBranchesPage from '@/pages/company/CompanyBranchesPage'
import CompanySeriesPage from '@/pages/company/CompanySeriesPage'
import BillingPage from '@/pages/billing/BillingPage'
import SunatDocsPage from '@/pages/billing/SunatDocsPage'
import ModulesPage from '@/pages/modules/ModulesPage'
import MembershipsPage from '@/pages/memberships/MembershipsPage'
import ReportsLayout from '@/pages/reports/ReportsLayout'
import SalesReportPage from '@/pages/reports/SalesReportPage'
import ProductsReportPage from '@/pages/reports/ProductsReportPage'
import SalesByProductReportPage from '@/pages/reports/SalesByProductReportPage'
import PurchasesReportPage from '@/pages/reports/PurchasesReportPage'
import KardexReportPage from '@/pages/reports/KardexReportPage'
import CashReportPage from '@/pages/reports/CashReportPage'
import RestaurantTablesPage from '@/pages/restaurant/RestaurantTablesPage'
import RestaurantFloorsPage from '@/pages/restaurant/RestaurantFloorsPage'
import RestaurantProductsPage from '@/pages/restaurant/RestaurantProductsPage'
import RestaurantSettingsPage from '@/pages/restaurant/RestaurantSettingsPage'
import ProfilePage from '@/pages/profile/ProfilePage'
import SubscriptionPage from '@/pages/subscription/SubscriptionPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Cargando...</p>
        </div>
      </div>
    )
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="dashboard" element={<DashboardPage />} />

        {/* Ventas */}
        <Route path="sales" element={<SalesPage />} />
        <Route path="sales/register" element={<SalesRegisterPage />} />
        <Route path="sales/pos" element={<POSPage />} />

        {/* Compras */}
        <Route path="purchases" element={<PurchasesPage />} />

        {/* Productos */}
        <Route path="products" element={<ProductsPage />} />

        {/* Contactos */}
        <Route path="contacts" element={<ContactsPage />} />

        {/* Inventario */}
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/transfers" element={<InventoryTransfersPage />} />
        <Route path="inventory/kardex" element={<InventoryKardexPage />} />
        <Route path="inventory/services" element={<ServicesPage />} />

        {/* Caja y Bancos */}
        <Route path="cashbank/cash" element={<CashPage />} />
        <Route path="cashbank/reports" element={<CashReportsPage />} />
        <Route path="cashbank/bank" element={<BankPage />} />
        <Route path="cashbank/payment-methods" element={<PaymentMethodsPage />} />

        {/* Facturación */}
        <Route path="billing" element={<BillingPage />} />
        <Route path="billing/docs" element={<Navigate to="/billing/docs/despatches" replace />} />
        <Route path="billing/docs/:docType" element={<SunatDocsPage />} />

        {/* Módulos (marketplace de módulos) */}
        <Route path="modules" element={<ModulesPage />} />

        <Route path="memberships" element={<MembershipsPage />} />

        {/* Reportes */}
        <Route path="reports" element={<ReportsLayout />}>
          <Route index element={<Navigate to="/reports/sales" replace />} />
          <Route path="sales" element={<SalesReportPage />} />
          <Route path="products" element={<ProductsReportPage />} />
          <Route path="sales-by-product" element={<SalesByProductReportPage />} />
          <Route path="purchases" element={<PurchasesReportPage />} />
          <Route path="kardex" element={<KardexReportPage />} />
          <Route path="cash" element={<CashReportPage />} />
        </Route>

        {/* Restaurante */}
        <Route path="restaurant" element={<RestaurantTablesPage />} />
        <Route path="restaurant/floors"   element={<RestaurantFloorsPage />} />
        <Route path="restaurant/products" element={<RestaurantProductsPage />} />
        <Route path="restaurant/settings" element={<RestaurantSettingsPage />} />

        {/* Usuarios */}
        <Route path="users" element={<UsersPage />} />
        <Route path="roles" element={<RolesPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="subscription" element={<SubscriptionPage />} />

        {/* Empresa */}
        <Route path="company/config"    element={<CompanyConfigPage />} />
        <Route path="company/sunat"     element={<CompanySunatPage />} />
        <Route path="company/branches"  element={<CompanyBranchesPage />} />
        <Route path="company/series"    element={<CompanySeriesPage />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  )
}
