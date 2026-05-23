import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'
import { Eye, EyeOff, Loader2, Building2 } from 'lucide-react'
import { useState, useEffect } from 'react'

const DEV_MODE = !import.meta.env.VITE_TENANT_SLUG && window.location.hostname === 'localhost'

// En producción el slug viene del subdominio (demo.app.tukifac.cloud → demo).
// Solo en localhost mostramos el campo; en producción no se muestra y el login usa el slug de la URL.
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
// Ocultar campo slug solo cuando el slug se toma del subdominio (producción).
const showSlugField = !isSlugFromSubdomain()

const schema = z.object({
  // Cuando el slug viene del subdominio (producción) el campo está oculto y puede ser ''.
  slug: z.union([z.string().min(1, 'Ingresa el identificador de tu empresa'), z.literal('')]).optional(),
  email: z.string().email('Email inválido'),
  password: z.string().min(4, 'Contraseña muy corta'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [showPass, setShowPass] = useState(false)

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isAuthenticated) navigate('/dashboard', { replace: true })
  }, [isAuthenticated, navigate])

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

  const onSubmit = async (data: FormData) => {
    // Slug: subdominio (*.localhost / producción) o campo manual en localhost
    let slug = data.slug?.trim() ?? ''
    if (!slug && typeof window !== 'undefined') {
      const host = window.location.hostname
      if (host.endsWith('.localhost')) {
        slug = host.replace(/\.localhost$/i, '')
      }
    }
    if (!slug) slug = import.meta.env.VITE_TENANT_SLUG ?? ''
    if (slug) localStorage.setItem('tenantSlug', slug)

    try {
      await login({ email: data.email, password: data.password })
      // El useEffect de isAuthenticated maneja la navegación
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
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img
            src="/logo.png"
            alt="Tukifac"
            className="w-20 h-auto mx-auto mb-3"
          />
          <h1 className="text-2xl font-bold text-gray-800">Tukifac</h1>
          <p className="text-gray-500 text-sm mt-1">Inicia sesión en tu empresa</p>
        </div>

        {/* Formulario */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>

            {/* Slug del tenant — solo si no está en .env */}
            {showSlugField && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Identificador de empresa
                </label>
                <div className="relative">
                  <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    {...register('slug')}
                    type="text"
                    autoComplete="off"
                    placeholder="mi-empresa"
                    className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all font-mono"
                  />
                </div>
                {errors.slug && (
                  <p className="text-xs text-red-500 mt-1">{errors.slug.message}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">
                  El slug corto que identifica tu empresa en el sistema
                </p>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Correo electrónico
              </label>
              <input
                {...register('email')}
                type="email"
                autoComplete="email"
                placeholder="usuario@empresa.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all"
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Contraseña
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-red-500 mt-1">{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              style={{ background: 'rgb(var(--p600, 37 99 235))' }}
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-5">
          Tukifac SaaS © {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
