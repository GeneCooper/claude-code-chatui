/**
 * Auto-Scroll Hook
 *
 * Provides smart auto-scrolling behavior that scrolls to new content
 * only when the user is near the bottom of the container.
 *
 * @module hooks/useAutoScroll
 */

import { useRef, useCallback, useEffect, useState, type RefObject } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface UseAutoScrollOptions {
  /** Threshold in pixels from bottom to consider "near bottom" (default: 100) */
  threshold?: number
  /** Whether auto-scroll is enabled (default: true) */
  enabled?: boolean
  /** Scroll behavior (default: 'smooth') */
  behavior?: ScrollBehavior
  /** Dependencies that trigger scroll check */
  dependencies?: unknown[]
  /** Callback when user scrolls away from bottom */
  onScrollAway?: () => void
  /** Callback when user scrolls to bottom */
  onScrollToBottom?: () => void
}

export interface UseAutoScrollReturn<T extends HTMLElement> {
  /** Ref to attach to the scrollable container */
  containerRef: RefObject<T>
  /** Whether the user is currently near the bottom */
  isNearBottom: boolean
  /** Whether auto-scroll is currently active */
  isAutoScrollEnabled: boolean
  /** Scroll to the bottom of the container */
  scrollToBottom: (options?: { behavior?: ScrollBehavior }) => void
  /** Enable auto-scroll */
  enableAutoScroll: () => void
  /** Disable auto-scroll */
  disableAutoScroll: () => void
  /** Toggle auto-scroll */
  toggleAutoScroll: () => void
  /** Check if currently at bottom */
  checkIsAtBottom: () => boolean
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAutoScroll<T extends HTMLElement = HTMLDivElement>(
  options: UseAutoScrollOptions = {},
): UseAutoScrollReturn<T> {
  const {
    threshold = 100,
    enabled = true,
    behavior = 'smooth',
    dependencies = [],
    onScrollAway,
    onScrollToBottom,
  } = options

  const containerRef = useRef<T>(null)
  const [isNearBottom, setIsNearBottom] = useState(true)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(enabled)
  const isScrollingRef = useRef(false)
  const lastScrollTopRef = useRef(0)

  const checkIsAtBottom = useCallback((): boolean => {
    const container = containerRef.current
    if (!container) return true

    const { scrollTop, scrollHeight, clientHeight } = container
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight
    return distanceFromBottom <= threshold
  }, [threshold])

  const scrollToBottom = useCallback(
    (scrollOptions?: { behavior?: ScrollBehavior }): void => {
      const container = containerRef.current
      if (!container) return

      isScrollingRef.current = true

      container.scrollTo({
        top: container.scrollHeight,
        behavior: scrollOptions?.behavior ?? behavior,
      })

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          isScrollingRef.current = false
          setIsNearBottom(true)
        })
      })
    },
    [behavior],
  )

  const enableAutoScroll = useCallback((): void => {
    setIsAutoScrollEnabled(true)
  }, [])

  const disableAutoScroll = useCallback((): void => {
    setIsAutoScrollEnabled(false)
  }, [])

  const toggleAutoScroll = useCallback((): void => {
    setIsAutoScrollEnabled((prev) => !prev)
  }, [])

  const handleScroll = useCallback((): void => {
    if (isScrollingRef.current) return

    const container = containerRef.current
    if (!container) return

    const { scrollTop } = container
    const wasNearBottom = isNearBottom
    const nowNearBottom = checkIsAtBottom()

    const isScrollingUp = scrollTop < lastScrollTopRef.current
    lastScrollTopRef.current = scrollTop

    setIsNearBottom(nowNearBottom)

    if (wasNearBottom && !nowNearBottom && isScrollingUp) {
      onScrollAway?.()
    } else if (!wasNearBottom && nowNearBottom) {
      onScrollToBottom?.()
    }
  }, [isNearBottom, checkIsAtBottom, onScrollAway, onScrollToBottom])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  useEffect(() => {
    if (isAutoScrollEnabled && isNearBottom) {
      requestAnimationFrame(() => {
        scrollToBottom({ behavior })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, isAutoScrollEnabled, isNearBottom])

  useEffect(() => {
    if (isAutoScrollEnabled) {
      scrollToBottom({ behavior: 'instant' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    containerRef,
    isNearBottom,
    isAutoScrollEnabled,
    scrollToBottom,
    enableAutoScroll,
    disableAutoScroll,
    toggleAutoScroll,
    checkIsAtBottom,
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

export function scrollElementToBottom(
  element: HTMLElement,
  options?: { behavior?: ScrollBehavior },
): void {
  element.scrollTo({
    top: element.scrollHeight,
    behavior: options?.behavior ?? 'smooth',
  })
}

export function isElementAtBottom(element: HTMLElement, threshold: number = 100): boolean {
  const { scrollTop, scrollHeight, clientHeight } = element
  const distanceFromBottom = scrollHeight - scrollTop - clientHeight
  return distanceFromBottom <= threshold
}
