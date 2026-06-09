import { useRef, useState, type InputHTMLAttributes } from 'react'
import { formatAmountDisplay, parseMoneyInput, roundDisplay } from '@/utils/money'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number
  onChange: (value: number) => void
  /** Si true, muestra vacío cuando el valor es 0 y el campo no tiene foco. */
  emptyWhenZero?: boolean
  /** Al enfocar limpia el campo; al salir sin escribir restaura el valor anterior. */
  clearOnFocus?: boolean
}

/**
 * Input monetario: muestra 2 decimales al usuario; persiste con precisión interna (6 dec).
 */
export function MoneyAmountInput({
  value,
  onChange,
  emptyWhenZero = false,
  clearOnFocus = false,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState('')
  const prevOnFocusRef = useRef(0)

  const blurredDisplay =
    emptyWhenZero && roundDisplay(value) === 0 ? '' : formatAmountDisplay(value)

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={focused ? draft : blurredDisplay}
      onFocus={(e) => {
        prevOnFocusRef.current = value
        setFocused(true)
        if (clearOnFocus) {
          setDraft('')
        } else {
          setDraft(emptyWhenZero && value === 0 ? '' : formatAmountDisplay(value))
        }
        onFocus?.(e)
      }}
      onBlur={(e) => {
        if (clearOnFocus && draft.trim() === '') {
          onChange(prevOnFocusRef.current)
        } else {
          onChange(parseMoneyInput(draft))
        }
        setFocused(false)
        onBlur?.(e)
      }}
      onChange={(e) => setDraft(e.target.value)}
    />
  )
}
