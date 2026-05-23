import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/** Columnas de perfil por módulo activo en el tenant. Agregar entradas al habilitar nuevos módulos. */
export type ModuleProfileColumnDef = {
  key: string
  label: string
}

export function useModuleProfileColumns(): ModuleProfileColumnDef[] {
  const { hasModule } = useAuth()

  return useMemo(() => {
    const cols: ModuleProfileColumnDef[] = []
    if (hasModule('restaurant')) {
      cols.push({ key: 'restaurant', label: 'Restaurante' })
    }
    // Ejemplo futuro: if (hasModule('memberships')) cols.push({ key: 'memberships', label: 'Membresías' })
    return cols
  }, [hasModule])
}
