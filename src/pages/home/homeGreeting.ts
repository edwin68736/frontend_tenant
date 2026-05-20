/** Saludo según hora del día (solo presentación; sin lógica de negocio). */
export function getTimeGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

/** Fecha larga en español, ej. "martes, 17 de mayo de 2026". */
export function formatHomeDate(): string {
  const formatted = new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date())
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}
