import { useRef, useState, type PointerEvent, type ReactNode } from 'react';

type Snap = 'peek' | 'mid' | 'full';

// Altura de cada ponto de encaixe, em fração da viewport — mesmo espírito do
// bottom sheet do Google Maps: nasce no meio, arrasta pra ver mais ou menos.
const SNAP_RATIO: Record<Snap, number> = {
  peek: 0.12,
  mid: 0.48,
  full: 0.92,
};

const SNAPS: Snap[] = ['peek', 'mid', 'full'];

/**
 * Painel inferior arrastável (mobile), com pontos de encaixe peek/mid/full.
 * Arrastar a alça abaixo do peek fecha o painel. Sem véu escuro sobre o mapa —
 * o Google Maps também não escurece o mapa ao abrir o detalhe.
 */
export function BottomSheet({
  header,
  children,
  onClose,
  initialSnap = 'mid',
}: {
  header?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  initialSnap?: Snap;
}) {
  const [snap, setSnap] = useState<Snap>(initialSnap);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    dragStartY.current = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null) return;
    setDragOffset(event.clientY - dragStartY.current);
  };

  const onPointerUp = () => {
    if (dragStartY.current === null) return;
    const finalHeightPx = window.innerHeight * SNAP_RATIO[snap] - dragOffset;
    const ratio = finalHeightPx / window.innerHeight;
    dragStartY.current = null;
    setDragOffset(0);
    setDragging(false);

    // Arrastar bem abaixo do peek fecha o painel, como puxar o card pra fora da tela.
    if (ratio < SNAP_RATIO.peek * 0.5) {
      onClose();
      return;
    }

    let closest: Snap = snap;
    let bestDiff = Infinity;
    for (const candidate of SNAPS) {
      const diff = Math.abs(SNAP_RATIO[candidate] - ratio);
      if (diff < bestDiff) {
        bestDiff = diff;
        closest = candidate;
      }
    }
    setSnap(closest);
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[20px] bg-app-panel shadow-soft-lg ${
        dragging ? '' : 'transition-[height] duration-200 ease-out'
      }`}
      style={{ height: `calc(${SNAP_RATIO[snap] * 100}vh - ${dragOffset}px)`, maxHeight: '92vh' }}
    >
      <div
        className="flex shrink-0 touch-none flex-col items-center pb-1 pt-2"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <span className="h-1.5 w-10 rounded-full bg-app-border" />
      </div>
      {header}
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
