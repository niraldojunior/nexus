import { useEffect, useRef, type ReactNode } from 'react';

/**
 * V.tal Nexus — Modal. Generaliza o `ArchiveConfirmModal` de
 * `pages/ResearchHistoryPage.tsx` para reuso fora da família de conversa:
 * scrim escuro, `.vt-popover` (hairline + `--shadow-lg`), `--radius-xl`.
 *
 * Foco previsível (issue #191, hardening de acessibilidade do Studio): ao abrir, o foco vai para
 * o painel do diálogo; ao fechar (Escape ou `onClose`), volta para o elemento que tinha foco antes
 * — sem isso, quem navega por teclado perde a posição ao publicar/errar no Governance.
 */
export default function Modal({
  title,
  children,
  footer,
  onClose,
  width = 480,
  ariaLabel,
  closeOnClickOutside = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
  ariaLabel?: string;
  closeOnClickOutside?: boolean;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30"
      onClick={closeOnClickOutside ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="vt-popover"
        style={{ borderRadius: 'var(--radius-xl)', width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto', outline: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div style={{ padding: '20px 20px 0' }}>
            <h3 className="text-app-text" style={{ font: 'var(--text-h3)', letterSpacing: 'var(--tracking-snug)' }}>
              {title}
            </h3>
          </div>
        )}
        <div style={{ padding: 20 }}>{children}</div>
        {footer && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '0 20px 20px',
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
