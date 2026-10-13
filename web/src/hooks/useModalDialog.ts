import { useEffect, useRef, type RefObject } from 'react';
import { useFocusTrap } from './useFocusTrap';

/**
 * Foco previsível para diálogos com markup próprio (editores de Local e de Recurso): prende o
 * Tab no painel, leva o foco ao painel ao abrir e o devolve a quem o tinha ao fechar.
 * O painel precisa de `tabIndex={-1}`. Com `trapped=false` (ex.: confirmação aberta por cima)
 * o trap se cala, para não disputar o foco com o diálogo empilhado.
 */
export function useModalDialog(panelRef: RefObject<HTMLElement>, trapped = true) {
  const trappedRef = useRef(trapped);
  trappedRef.current = trapped;
  // O trap compartilhado lê `panelRef.current`; devolvemos null enquanto suspenso.
  const gatedRef = useRef({
    get current() {
      return trappedRef.current ? panelRef.current : null;
    },
  } as RefObject<HTMLElement>).current;
  useFocusTrap(gatedRef);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previous?.focus?.();
    };
  }, [panelRef]);
}
