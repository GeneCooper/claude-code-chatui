import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * Hook for auto-scrolling to bottom of a container when new content is added.
 * Stops auto-scrolling when user scrolls up, resumes when they scroll to bottom.
 */
export function useAutoScroll<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const scrollToBottom = useCallback(() => {
    if (ref.current && !userScrolledUp) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [userScrolledUp]);

  // Handle scroll events to detect user scrolling up
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setUserScrolledUp(!isAtBottom);
    };

    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll when deps change
  useEffect(() => {
    scrollToBottom();
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return ref;
}
