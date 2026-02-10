import { useEffect, useCallback } from 'react'

type KeyHandler = (e: KeyboardEvent) => void

interface KeyBinding {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  meta?: boolean
  handler: KeyHandler
}

/**
 * Hook for registering global keyboard shortcuts.
 */
export function useKeyboard(bindings: KeyBinding[]) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    for (const binding of bindings) {
      const keyMatch = e.key.toLowerCase() === binding.key.toLowerCase()
      const ctrlMatch = binding.ctrl ? (e.ctrlKey || e.metaKey) : true
      const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey
      const altMatch = binding.alt ? e.altKey : !e.altKey

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault()
        binding.handler(e)
        return
      }
    }
  }, [bindings])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
