import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PaymentMethodIcon } from '@/components/pos/PaymentMethodIcon'

type PaymentMethodOption = {
  id: number
  code: string
  name: string
}

type Props = {
  methods: PaymentMethodOption[]
  value: string
  onChange: (code: string) => void
  disabled?: boolean
  className?: string
}

export function PaymentMethodSelect({ methods, value, onChange, disabled, className }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = methods.find((m) => m.code === value) ?? methods[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div ref={rootRef} className={className}>
      <button
        type="button"
        disabled={disabled || methods.length === 0}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-left hover:border-gray-300 disabled:opacity-60"
      >
        {selected ? (
          <PaymentMethodIcon code={selected.code} name={selected.name} className="h-5 w-5 shrink-0 object-contain" />
        ) : null}
        <span className="min-w-0 flex-1 truncate text-gray-800">{selected?.name ?? 'Método'}</span>
        <ChevronDown size={16} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && methods.length > 0 && (
        <div className="absolute z-50 mt-1 w-full min-w-[11rem] rounded-xl border border-gray-200 bg-white py-1 shadow-lg max-h-52 overflow-y-auto">
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onChange(m.code)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                m.code === value ? 'bg-[rgb(var(--p50))] text-[rgb(var(--p800))]' : 'text-gray-800'
              }`}
            >
              <PaymentMethodIcon code={m.code} name={m.name} className="h-5 w-5 shrink-0 object-contain" />
              <span className="truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
