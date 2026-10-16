import { useCallback, useRef } from 'react'

/** Arrastrar con el mouse para desplazar una fila horizontal (el touch ya scrollea nativamente). */
export function useDragScroll<T extends HTMLElement>() {
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((el: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!el) return

    let down = false
    let dragging = false
    let justDragged = false
    let startX = 0
    let startLeft = 0

    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      down = true
      dragging = false
      startX = e.clientX
      startLeft = el.scrollLeft
    }
    const onMove = (e: PointerEvent) => {
      if (!down) return
      const dx = e.clientX - startX
      if (!dragging && Math.abs(dx) > 5) {
        dragging = true
        el.setPointerCapture(e.pointerId)
        el.style.scrollSnapType = 'none'
        el.style.cursor = 'grabbing'
        el.style.userSelect = 'none'
      }
      if (dragging) el.scrollLeft = startLeft - dx
    }
    const onUp = (e: PointerEvent) => {
      if (!down) return
      down = false
      if (dragging) {
        dragging = false
        justDragged = true
        setTimeout(() => { justDragged = false }, 0)
        if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId)
        el.style.scrollSnapType = ''
        el.style.cursor = ''
        el.style.userSelect = ''
      }
    }
    const onClickCapture = (e: MouseEvent) => {
      if (justDragged) {
        e.preventDefault()
        e.stopPropagation()
      }
    }
    const onDragStart = (e: DragEvent) => e.preventDefault()

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('click', onClickCapture, true)
    el.addEventListener('dragstart', onDragStart)
    cleanupRef.current = () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('click', onClickCapture, true)
      el.removeEventListener('dragstart', onDragStart)
    }
  }, [])
}
