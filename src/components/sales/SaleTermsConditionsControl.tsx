import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { CompanyTermsConditionsModal } from '@/components/sales/CompanyTermsConditionsModal'

type Props = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  termsText: string
  onTermsSaved: (terms: string) => void
  disabled?: boolean
  className?: string
}

export function SaleTermsConditionsControl({
  checked,
  onCheckedChange,
  termsText,
  onTermsSaved,
  disabled = false,
  className = '',
}: Props) {
  const [editOpen, setEditOpen] = useState(false)

  return (
    <>
      <div className={`flex items-center justify-between gap-3 ${className}`}>
        <div className="flex items-center gap-1 min-w-0">
          <div className="min-w-0">
            <span className="text-sm text-gray-700">Mostrar términos y condiciones</span>
            <p className="text-[11px] text-gray-400 leading-snug">
              Preferencia de la empresa: aplica a ventas futuras hasta desactivarla.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            disabled={disabled}
            className="p-1 rounded-lg text-amber-600 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-40 shrink-0"
            title="Editar términos y condiciones globales"
            aria-label="Editar términos y condiciones"
          >
            <Pencil size={14} />
          </button>
        </div>
        <input
          type="checkbox"
          className="rounded border-gray-300 text-[rgb(var(--p600))] focus:ring-[rgb(var(--p600))] h-4 w-4 shrink-0"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          disabled={disabled}
          aria-label="Mostrar términos y condiciones"
        />
      </div>
      {checked && !termsText.trim() && (
        <p className="text-[11px] text-amber-700 mt-1">
          No hay texto configurado. Use el lápiz para definir los términos globales.
        </p>
      )}
      <CompanyTermsConditionsModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        value={termsText}
        onSaved={onTermsSaved}
      />
    </>
  )
}
