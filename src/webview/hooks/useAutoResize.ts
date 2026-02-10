import { useCallback, useEffect, useRef } from 'react'

/**
 * Hook for auto-resizing a textarea based on its content.
 * Returns a ref to attach to the textarea and a resize function.
 */
export function useAutoResize(minHeight: number = 40, maxHeight: number = 200) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const resize = useCallback(() => {
    const el = ref.current
    if (!el) return

    el.style.height = `${minHeight}px`
    const scrollHeight = el.scrollHeight
    el.style.height = `${Math.min(Math.max(scrollHeight, minHeight), maxHeight)}px`
  }, [minHeight, maxHeight])

  useEffect(() => {
    resize()
  }, [resize])

  return { ref, resize }
}
