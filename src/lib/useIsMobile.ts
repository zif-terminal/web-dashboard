import { useEffect, useState } from 'react';

const QUERY = '(max-width: 768px)';

/** Returns true when the viewport is ≤768 px wide (SSR-safe: defaults false). */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    // Modern browsers
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    // Legacy fallback
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  return mobile;
}
