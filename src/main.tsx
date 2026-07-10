import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppToaster } from '@/components/AppToaster'
import { AuthProvider } from './contexts/AuthContext'
import { BranchProvider } from './contexts/BranchContext'
import { BranchCheckoutSeriesProvider } from './contexts/BranchCheckoutSeriesContext'
import { FeatureProvider } from './contexts/FeatureContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { NativeShellProvider } from '@/providers/NativeShellProvider'
import { TenantBindingProvider } from '@/contexts/TenantBindingContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <NativeShellProvider>
      <TenantBindingProvider>
      <AuthProvider>
        <FeatureProvider>
          <BranchProvider>
            <BranchCheckoutSeriesProvider>
              <ThemeProvider>
                <App />
                <AppToaster />
              </ThemeProvider>
            </BranchCheckoutSeriesProvider>
          </BranchProvider>
        </FeatureProvider>
      </AuthProvider>
      </TenantBindingProvider>
    </NativeShellProvider>
  </React.StrictMode>,
)
