import { useState, useEffect } from 'react'

export type VSCodeTheme = 'light' | 'dark' | 'high-contrast'

/**
 * Hook that detects the current VS Code theme (light/dark/high-contrast).
 * Reads from the body element's data-vscode-theme-kind attribute.
 */
export function useTheme(): VSCodeTheme {
  const [theme, setTheme] = useState<VSCodeTheme>(() => detectTheme())

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(detectTheme())
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-vscode-theme-kind', 'class'],
    })

    return () => observer.disconnect()
  }, [])

  return theme
}

function detectTheme(): VSCodeTheme {
  const kind = document.body.getAttribute('data-vscode-theme-kind')
  if (kind?.includes('high-contrast')) return 'high-contrast'
  if (kind?.includes('light')) return 'light'
  return 'dark'
}
