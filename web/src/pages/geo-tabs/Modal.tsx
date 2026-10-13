import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useFocusTrap } from '../../hooks/useFocusTrap';

export type ModalProps = {
  children: ReactNode;
  title: string;
  eyebrow: string;
  onClose: () => void;
  wide?: boolean;
};

// Modal genérico centralizado, usado pelos diálogos da página Locais (erro de busca de
// endereço, gestão de tipos de site, confirmação de exclusão de projeto…). Extraído de
// GeoPage para ser reusado pelos painéis de Projetos (REQ-MOD01-015).
export function Modal({ children, title, eyebrow, onClose, wide }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef);

  // Foco previsível: entra no painel ao abrir e volta ao gatilho ao fechar.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`max-h-[90vh] overflow-auto rounded-[26px] border border-app-border bg-white p-5 shadow-modal outline-none ${wide ? 'w-full max-w-[920px]' : 'w-full max-w-[720px]'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-app-border pb-4">
          <div>
            <div className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
              {eyebrow}
            </div>
            <h3 className="mt-1 font-display text-[1.35rem] font-semibold text-app-text">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-2 text-app-muted hover:bg-app-accent-soft"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
