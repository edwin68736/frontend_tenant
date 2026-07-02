import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useTenantBinding } from '@/contexts/TenantBindingContext'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Building2 } from 'lucide-react'
import { useState } from 'react'
import { isNativeShell } from '@/lib/platform/detect'
import { replaceRoute } from '@/lib/platform/shellNavigation'
import { getTenantSlug } from '@/config/apiBaseUrl'

function isSlugFromSubdomain(): boolean {
  if (typeof window === 'undefined') return false
  const hostname = window.location.hostname
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace(/\.localhost$/i, '')
    return sub.length > 0 && sub !== 'localhost'
  }
  if (hostname === 'localhost') return false
  const parts = hostname.split('.')
  return parts.length > 2 && parts[0] !== 'www' && parts[0] !== 'api'
}

/** Web: slug por subdominio o localhost. Nativo: vinculación RUC (sin campo slug). */
const showSlugField = !isNativeShell() && !isSlugFromSubdomain()

const schema = z.object({
  slug: z.union([z.string().min(1, 'Ingresa el identificador de tu empresa'), z.literal('')]).optional(),
  email: z.string().email('Email inválido'),
  password: z.string().min(4, 'Contraseña muy corta'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth()
  const { stored: boundTenant } = useTenantBinding()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      slug: localStorage.getItem('tenantSlug') ?? import.meta.env.VITE_TENANT_SLUG ?? '',
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/home" replace />
  }

  const onSubmit = async (data: FormData) => {
    if (!isNativeShell()) {
      let slug = data.slug?.trim() ?? ''
      if (!slug && typeof window !== 'undefined') {
        const host = window.location.hostname
        if (host.endsWith('.localhost')) {
          slug = host.replace(/\.localhost$/i, '')
        }
      }
      if (!slug) slug = import.meta.env.VITE_TENANT_SLUG ?? ''
      if (!slug) slug = getTenantSlug()
      if (slug) localStorage.setItem('tenantSlug', slug)
    }

    try {
      await login({ email: data.email, password: data.password })
      replaceRoute('/home', navigate)
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: { error?: string } } }
      const msg = apiErr?.response?.data?.error ?? 'Error al iniciar sesión'

      if (msg.includes('Empresa no encontrada') || msg.includes('contexto de empresa')) {
        toast.error('No se encontró la empresa. Verifica el identificador.')
      } else {
        toast.error(msg)
      }
    }
  }

  return (
    <div className="flex min-h-screen min-h-screen-safe items-center justify-center bg-gray-100 px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <img src="/logo.png" alt="Tukifac" className="mx-auto mb-3 h-auto w-20" />
          <h1 className="text-2xl font-bold text-gray-800">Tukifac</h1>
          <p className="mt-1 text-sm text-gray-500">Inicia sesión en tu empresa</p>
          {isNativeShell() && boundTenant?.name && (
            <p className="mt-2 text-xs font-medium text-green-800">
              {boundTenant.name}
              {boundTenant.ruc ? ` · RUC ${boundTenant.ruc}` : ''}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-7 shadow-sm">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {showSlugField && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Identificador de empresa
                </label>
                <div className="relative">
                  <Building2
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    {...register('slug')}
                    type="text"
                    autoComplete="off"
                    placeholder="mi-empresa"
                    className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3.5 font-mono text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                  />
                </div>
                {errors.slug && <p className="mt-1 text-xs text-red-500">{errors.slug.message}</p>}
                <p className="mt-1 text-xs text-gray-400">
                  Solo en desarrollo local; en producción web usa el subdominio de tu empresa.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Correo electrónico</label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                className="w-full rounded-xl border border-gray-200 px-3.5 py-2.5 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Contraseña</label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-gray-200 py-2.5 pl-3.5 pr-10 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2"
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-2 flex w-full touch-target items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: 'rgb(var(--p600, 37 99 235))' }}
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="mt-5 text-center text-xs text-gray-400">
          Tukifac SaaS © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
