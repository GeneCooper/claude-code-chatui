import { useState, useCallback, useRef } from 'react'

/**
 * Hook for copying text to clipboard with a "copied" feedback state.
 */
export function useClipboard(resetDelay: number = 2000) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)

      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      timeoutRef.current = setTimeout(() => setCopied(false), resetDelay)

      return true
    } catch {
      return false
    }
  }, [resetDelay])

  return { copy, copied }
}
