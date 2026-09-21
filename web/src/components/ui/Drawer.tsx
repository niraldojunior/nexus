import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * V.tal Nexus — Drawer lateral (issue #275).
 * Reutiliza os mesmos primitivos de acessibilidade e estilo de `Modal.tsx`:
 * - Renderizado no `document.body` via `createPortal`
 * - Scrim escuro `bg-black/30`
 * - Painel estilizado com `.vt-popover`
 * - Gerenciamento de foco: foco inicial no painel, restauração para o elemento anterior ao fechar
 * - Tecla Escape fecha
 * - Ancorado à direita, altura total (h-full), largura customizável por prop
 */
export default function Drawer({
  title,
  subtitle,
  children,
  footer,
  onClose,
  width = 480,
  ariaLabel,
  closeOnClickOutside = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  width?: number | string;
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

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex justify-end bg-black/30"
      onClick={closeOnClickOutside ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="vt-popover flex h-full flex-col border-l border-app-border bg-app-panel shadow-2xl"
        style={{
          width,
          maxWidth: '100vw',
          outline: 'none',
          borderRadius: 0,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-app-border p-5">
          <div className="min-w-0 flex-1 pr-3">
            {title && (
              <h3
                className="truncate text-app-text"
                style={{ font: 'var(--text-h3)', letterSpacing: 'var(--tracking-snug)' }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-0.5 truncate text-xs text-app-muted">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-app-muted transition-colors hover:bg-app-hover-muted hover:text-app-text"
            aria-label="Fechar gaveta"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-app-border p-4">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
