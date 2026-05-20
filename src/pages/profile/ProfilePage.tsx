import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { User, Mail, Phone, Shield, Building2, Lock, Save } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { profileService, type UserProfile } from '@/services/profile.service'

const inputClass =
  'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 bg-white'

function formatDate(value?: string): string {
  if (!value) return '—'
  try {
    return new Intl.DateTimeFormat('es-PE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

export default function ProfilePage() {
  const { user, updateSessionUser } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingPass, setSavingPass] = useState(false)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    let cancelled = false
    profileService
      .getMe()
      .then((data) => {
        if (cancelled) return
        setProfile(data)
        setName(data.name)
        setEmail(data.email)
        setPhone(data.phone ?? '')
      })
      .catch(() => {
        if (!cancelled) toast.error('No se pudo cargar tu perfil')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleSaveProfile = async () => {
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName || !trimmedEmail) {
      toast.error('Nombre y email son obligatorios')
      return
    }
    setSaving(true)
    try {
      const { user: updated } = await profileService.updateMe({
        name: trimmedName,
        email: trimmedEmail,
        phone: phone.trim(),
      })
      updateSessionUser(updated)
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              name: trimmedName,
              email: trimmedEmail,
              phone: phone.trim(),
              role_name: updated.role || prev.role_name,
            }
          : prev,
      )
      toast.success('Perfil actualizado')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'No se pudo guardar el perfil')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async () => {
    const current = currentPassword.trim()
    const next = newPassword.trim()
    const confirm = confirmPassword.trim()
    if (!current || !next) {
      toast.error('Ingresa tu contraseña actual y la nueva')
      return
    }
    if (next.length < 8) {
      toast.error('La nueva contraseña debe tener mínimo 8 caracteres')
      return
    }
    if (next !== confirm) {
      toast.error('La confirmación de contraseña no coincide')
      return
    }
    setSavingPass(true)
    try {
      await profileService.changePassword({
        current_password: current,
        new_password: next,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Contraseña actualizada')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } }
      toast.error(err.response?.data?.error ?? 'No se pudo actualizar la contraseña')
    } finally {
      setSavingPass(false)
    }
  }

  const initials = (profile?.name || user?.name || '?').charAt(0).toUpperCase()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[280px]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">Mi perfil</h1>
        <p className="text-sm text-gray-500 mt-1">Consulta y actualiza la información de tu cuenta</p>
      </div>

      {/* Cabecera con avatar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-2xl border border-gray-200 bg-gradient-to-br from-slate-50 via-white to-primary-50/30 shadow-sm">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white shadow-md shrink-0"
          style={{ background: 'rgb(var(--p600))' }}
        >
          {initials}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-semibold text-gray-900 truncate">{profile?.name ?? user?.name}</p>
          <p className="text-sm text-gray-500 truncate">{profile?.email ?? user?.email}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {profile?.role_name && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-primary-50 text-primary-700 border border-primary-100">
                <Shield size={12} />
                {profile.role_name}
              </span>
            )}
            <span
              className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${
                profile?.active !== false
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}
            >
              {profile?.active !== false ? 'Cuenta activa' : 'Cuenta inactiva'}
            </span>
          </div>
        </div>
      </div>

      {/* Datos personales */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <User size={16} className="text-primary-600" />
            Información personal
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Puedes editar tu nombre, correo y teléfono</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nombre completo</label>
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputClass} pl-9`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Tu nombre"
                autoComplete="name"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Correo electrónico</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                className={`${inputClass} pl-9`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@empresa.com"
                autoComplete="email"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Teléfono (opcional)</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                className={`${inputClass} pl-9`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="999 999 999"
                autoComplete="tel"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Rol asignado</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5 flex items-center gap-1.5">
                <Shield size={14} className="text-gray-400 shrink-0" />
                {profile?.role_name || user?.role || '—'}
              </p>
            </div>
            <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-medium">Sucursal</p>
              <p className="text-sm font-medium text-gray-800 mt-0.5 flex items-center gap-1.5">
                <Building2 size={14} className="text-gray-400 shrink-0" />
                {profile?.branch_name || 'Sin sucursal asignada'}
              </p>
            </div>
          </div>

          {profile?.created_at && (
            <p className="text-xs text-gray-400">Miembro desde {formatDate(profile.created_at)}</p>
          )}

          <div className="pt-2">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </section>

      {/* Seguridad */}
      <section className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/80">
          <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
            <Lock size={16} className="text-primary-600" />
            Seguridad
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Cambia tu contraseña de acceso al panel</p>
        </div>
        <div className="p-5 space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Contraseña actual</label>
            <input
              type="password"
              className={inputClass}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Tu contraseña actual"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Nueva contraseña</label>
            <input
              type="password"
              className={inputClass}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Mínimo 8 caracteres"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Confirmar nueva contraseña</label>
            <input
              type="password"
              className={inputClass}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="Repite la nueva contraseña"
            />
          </div>
          <div className="pt-1">
            <button
              type="button"
              onClick={handleChangePassword}
              disabled={savingPass}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:border-primary-200 hover:text-primary-700 disabled:opacity-50 transition-colors"
            >
              <Lock size={16} />
              {savingPass ? 'Actualizando...' : 'Actualizar contraseña'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
