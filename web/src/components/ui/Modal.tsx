import type { ReactNode } from 'react';

/**
 * V.tal Nexus — Modal. Generaliza o `ArchiveConfirmModal` de
 * `pages/ResearchHistoryPage.tsx` para reuso fora da família de conversa:
 * scrim escuro, `.vt-popover` (hairline + `--shadow-lg`), `--radius-xl`.
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
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30"
      onClick={closeOnClickOutside ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
    >
      <div
        className="vt-popover"
        style={{ borderRadius: 'var(--radius-xl)', width, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100vh - 64px)', overflowY: 'auto' }}
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
