/** Resumen mostrado en la celda de perfil por módulo (tabla de usuarios). */
export type ModuleProfileSummary = {
  configured: boolean
  /** Texto principal, ej. "Mozo" o "Sin perfil" */
  primary: string
  /** Detalle opcional, ej. "PIN configurado" */
  secondary?: string
}

export type RestaurantStaffState = {
  employeeType: string
  hasPin: boolean
}
