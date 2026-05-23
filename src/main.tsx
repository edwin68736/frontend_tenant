import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { BranchProvider } from './contexts/BranchContext'
import { FeatureProvider } from './contexts/FeatureContext'
import { ThemeProvider } from './contexts/ThemeContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <FeatureProvider>
        <BranchProvider>
          <ThemeProvider>
            <App />
            <Toaster position="top-right" richColors closeButton />
          </ThemeProvider>
        </BranchProvider>
        </FeatureProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
