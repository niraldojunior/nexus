import { useLayoutEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const TOOLTIP_WIDTH = 260;
const VIEWPORT_GUTTER = 12;

export function Tooltip({
  anchorRect,
  open,
  children,
}: {
  anchorRect: DOMRect | null;
  open: boolean;
  children: ReactNode;
}) {
  const [height, setHeight] = useState(0);
  const [element, setElement] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    setHeight(element.offsetHeight);
    return () => observer.disconnect();
  }, [element, children]);

  if (!open || !anchorRect) return null;

  const left = Math.max(
    VIEWPORT_GUTTER,
    Math.min(anchorRect.left, window.innerWidth - TOOLTIP_WIDTH - VIEWPORT_GUTTER),
  );
  const below = anchorRect.bottom + 8;
  const top =
    height > 0 && below + height > window.innerHeight - VIEWPORT_GUTTER
      ? Math.max(VIEWPORT_GUTTER, anchorRect.top - height - 8)
      : below;

  return createPortal(
    <div
      ref={setElement}
      style={{ top, left, width: TOOLTIP_WIDTH }}
      className="pointer-events-none fixed z-50 rounded-[14px] border border-app-border bg-white px-3 py-2.5 text-[0.8rem] shadow-soft-lg"
      role="tooltip"
    >
      {children}
    </div>,
    document.body,
  );
}
