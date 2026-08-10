import type { BillingHub } from '@/services/subscription.service'
import type { PlanLimits } from '@/contexts/ModulesContext'

export type PlanNotificationTone = 'info' | 'warning' | 'danger'

export interface PlanNotification {
  id: string
  tone: PlanNotificationTone
  message: string
  /** Ruta a la que lleva el ítem del panel de notificaciones. */
  to: string
}

/**
 * Notificaciones del plan/suscripción para la campana del header.
 *
 * No se leen de `saas_notification_logs`: esa tabla es solo auditoría de la cola (el worker
 * las marca «sent» sin entregarlas a ningún canal). La fuente de verdad es el hub de cobro,
 * que el backend arma en cada request aplicando los ajustes del panel central
 * (reminder_days, gracia, auto-suspensión, strikes). Derivarlas del hub garantiza que lo que
 * ve el tenant coincide siempre con lo configurado, sin depender de que el cron haya corrido
 * el día exacto del recordatorio.
 */
export function buildPlanNotifications(
  hub: BillingHub | null,
  limits?: PlanLimits,
): PlanNotification[] {
  const out: PlanNotification[] = []
  if (!hub) return out

  // 1. Estado de la suscripción (recordatorio de vencimiento, gracia, mora, suspensión…).
  // El mensaje ya viene redactado por el backend con los días configurados en el panel central.
  const ctx = hub.billing_context
  const stateMessage = ctx?.status_banner_message || hub.status_banner?.message
  if (ctx?.show_status_banner && stateMessage) {
    out.push({
      id: `subscription:${ctx.urgency_tier}`,
      tone: bannerTone(ctx.status_banner_variant ?? hub.status_banner?.variant),
      message: stateMessage,
      to: '/subscription',
    })
  }

  // 2. Cupo de documentos electrónicos del plan (bajo, alto o agotado).
  const docs = hub.documents
  if (docs && !docs.is_unlimited && docs.warning_level !== 'none' && docs.warning_message) {
    out.push({
      id: `documents:${docs.warning_level}`,
      tone: docs.warning_level === 'exhausted' ? 'danger' : 'warning',
      message: docs.warning_message,
      to: '/subscription',
    })
  }

  // 3. Cuotas del plan (usuarios, sucursales, productos). `documents` ya se cubrió arriba con
  // el detalle real del hub, así que aquí se omite para no duplicar el aviso.
  if (limits) {
    for (const resource of QUOTA_RESOURCES) {
      const notif = quotaNotification(resource, limits[resource])
      if (notif) out.push(notif)
    }
  }

  return out
}

const QUOTA_RESOURCES = ['users', 'branches', 'products'] as const

const QUOTA_LABELS: Record<(typeof QUOTA_RESOURCES)[number], string> = {
  users: 'usuarios',
  branches: 'sucursales',
  products: 'productos',
}

/** Umbral de aviso proactivo, igual al de PlanLimitBanner. */
const QUOTA_WARN_RATIO = 0.8

function quotaNotification(
  resource: (typeof QUOTA_RESOURCES)[number],
  limit: PlanLimits[keyof PlanLimits] | undefined,
): PlanNotification | null {
  if (!limit || limit.unlimited || limit.max <= 0) return null
  if (limit.used / limit.max < QUOTA_WARN_RATIO) return null
  const label = QUOTA_LABELS[resource]
  const over = limit.used >= limit.max
  return {
    id: `quota:${resource}`,
    tone: over ? 'danger' : 'warning',
    message: over
      ? `Llegaste al límite de ${label} de tu plan (${limit.used}/${limit.max})`
      : `Estás cerca del límite de ${label} (${limit.used}/${limit.max})`,
    to: '/subscription',
  }
}

/**
 * Tiers que justifican interrumpir al tenant con un modal (dismisseable) al entrar.
 *
 * Quedan fuera `normal` (nada que avisar), `review` (ya envió su comprobante y está en
 * validación) y `provisional` (tiene acceso concedido): en esos dos el tenant ya hizo su
 * parte, interrumpirlo sería ruido. El aviso pasivo de la campana les basta.
 *
 * `overdue`/`suspended`/`blocked` también quedan fuera a propósito: esos tiers implican
 * `can_operate=false` en el backend (ver `pkg/saas/state.go: CanOperate`), y ya los cubre
 * `SubscriptionBlockedScreen`, una pantalla que no se puede cerrar mientras siga bloqueado.
 * Mostrar además este modal dismisseable-una-vez-al-día sobre esos tiers dejaba al tenant
 * cerrarlo y quedarse en pantallas que igual fallan en silencio contra el resto de la API.
 */
const MODAL_TIERS = new Set(['reminder', 'payment_due', 'grace'])

const MODAL_TITLES: Record<string, string> = {
  reminder: 'Tu plan está por vencer',
  payment_due: 'Tienes un pago pendiente',
  grace: 'Tu plan venció: estás en periodo de gracia',
  overdue: 'Tu suscripción está vencida',
  suspended: 'Tu cuenta está suspendida',
  blocked: 'Tu cuenta está bloqueada',
}

export function planReminderTitle(tier: string) {
  return MODAL_TITLES[tier] ?? 'Estado de tu suscripción'
}

/**
 * Clave de «ya se mostró» para el modal de recordatorio: suscripción + tier + día de Lima.
 *
 * Incluir el día hace que el aviso vuelva a salir en cada fecha configurada en reglas
 * globales (7, 5, 3 y 1 días antes son cuatro apariciones, no una). Incluir el tier hace que
 * un empeoramiento —de recordatorio a gracia, de gracia a suspensión— se avise en el acto
 * aunque ya se haya mostrado algo ese mismo día.
 *
 * Devuelve null cuando no corresponde ningún modal.
 */
export function planReminderModalKey(hub: BillingHub | null): string | null {
  const tier = hub?.billing_context?.urgency_tier
  if (!hub?.subscription?.has_subscription || !tier || !MODAL_TIERS.has(tier)) return null
  if (!(hub.billing_context?.status_banner_message || hub.status_banner?.message)) return null
  return `${hub.subscription.subscription_id ?? 0}:${tier}:${limaToday()}`
}

/** Fecha de hoy en America/Lima (YYYY-MM-DD), la misma zona con la que el backend vence planes. */
function limaToday(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Lima',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function bannerTone(variant?: string): PlanNotificationTone {
  if (variant === 'danger') return 'danger'
  if (variant === 'warning') return 'warning'
  return 'info'
}

const TONE_ICON_CLASS: Record<PlanNotificationTone, string> = {
  danger: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
}

export function planNotificationIconClass(tone: PlanNotificationTone) {
  return TONE_ICON_CLASS[tone]
}
