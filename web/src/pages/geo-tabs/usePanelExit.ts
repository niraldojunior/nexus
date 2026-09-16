import { useCallback, useEffect, useRef, useState } from 'react';

const PANEL_EXIT_MS = 280;

/**
 * Mantém a doca desktop visível até a animação de saída terminar. A folha mobile já
 * controla seu próprio ciclo por gesto/altura, portanto fecha imediatamente.
 */
export function usePanelExit(isMobile: boolean) {
  const [isClosing, setIsClosing] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const requestExit = useCallback(
    (onComplete: () => void) => {
      if (isMobile || reducedMotion || isClosing) {
        onComplete();
        return;
      }
      setIsClosing(true);
      timerRef.current = window.setTimeout(onComplete, PANEL_EXIT_MS);
    },
    [isClosing, isMobile, reducedMotion],
  );

  return { isClosing, requestExit };
}
