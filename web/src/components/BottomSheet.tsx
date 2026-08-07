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

// Movimento mínimo (px) antes de um toque no corpo virar arraste da folha — abaixo
// disto é toque/clique (ou rolagem do conteúdo), e a folha não se mexe.
const DRAG_COMMIT_THRESHOLD = 6;

/**
 * Painel inferior arrastável (mobile), com pontos de encaixe peek/mid/full.
 *
 * Arrasta com o dedo em qualquer lugar da folha — não só na alça — igual ao app do
 * Google Maps: em peek/mid o conteúdo não rola e o gesto sobe/desce a folha livremente;
 * em full o conteúdo rola, e um puxão pra baixo com o texto no topo recolhe a folha.
 * Arrastar abaixo do peek fecha. Sem véu escuro sobre o mapa — o Google Maps também não
 * escurece o mapa ao abrir o detalhe. Todo o conteúdo (foto, título e corpo) mora no
 * `children` e rola junto quando em full.
 */
export function BottomSheet({
  children,
  onClose,
  initialSnap = 'mid',
}: {
  children: ReactNode;
  onClose: () => void;
  initialSnap?: Snap;
}) {
  const [snap, setSnap] = useState<Snap>(initialSnap);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  // Início do arraste já comprometido a mover a folha; null quando não há arraste ativo.
  const dragStartYRef = useRef<number | null>(null);
  const dragOffsetRef = useRef(0);
  const draggingRef = useRef(false);
  // Início de um toque no corpo ainda indeciso: só vira arraste da folha se passar do
  // limiar na direção certa — senão é rolagem (ou clique) do conteúdo.
  const pendingStartYRef = useRef<number | null>(null);

  const beginDrag = (clientY: number, pointerId: number, captureEl: Element | null) => {
    dragStartYRef.current = clientY;
    draggingRef.current = true;
    setDragging(true);
    captureEl?.setPointerCapture?.(pointerId);
  };

  const moveDrag = (clientY: number) => {
    if (dragStartYRef.current === null) return;
    const offset = clientY - dragStartYRef.current;
    dragOffsetRef.current = offset;
    setDragOffset(offset);
  };

  const endDrag = () => {
    if (!draggingRef.current) return;
    const finalHeightPx = window.innerHeight * SNAP_RATIO[snap] - dragOffsetRef.current;
    const ratio = finalHeightPx / window.innerHeight;
    dragStartYRef.current = null;
    dragOffsetRef.current = 0;
    draggingRef.current = false;
    pendingStartYRef.current = null;
    setDragOffset(0);
    setDragging(false);

    // Arrastar bem abaixo do peek fecha a folha, como puxar o card pra fora da tela.
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

  // Alça no topo: sempre arrasta a folha, em qualquer encaixe.
  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    beginDrag(event.clientY, event.pointerId, event.currentTarget);
  };
  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) moveDrag(event.clientY);
  };
  const onHandlePointerEnd = () => {
    if (draggingRef.current) endDrag();
  };

  // Corpo: arrasta a folha livremente em peek/mid (onde o conteúdo não rola); em full,
  // rola o conteúdo e só um puxão pra baixo com o texto no topo é que recolhe a folha.
  const onContentPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pendingStartYRef.current = event.clientY;
  };
  const onContentPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (draggingRef.current) {
      moveDrag(event.clientY);
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (pendingStartYRef.current === null) return;
    const delta = event.clientY - pendingStartYRef.current;
    const atTop = (contentRef.current?.scrollTop ?? 0) <= 0;
    const canDrag =
      snap === 'full'
        ? atTop && delta > DRAG_COMMIT_THRESHOLD
        : Math.abs(delta) > DRAG_COMMIT_THRESHOLD;
    if (!canDrag) return;
    beginDrag(pendingStartYRef.current, event.pointerId, contentRef.current);
    moveDrag(event.clientY);
  };
  const onContentPointerEnd = () => {
    pendingStartYRef.current = null;
    if (draggingRef.current) endDrag();
  };

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[20px] bg-app-panel shadow-soft-lg ${
        dragging ? '' : 'transition-[height] duration-200 ease-out'
      }`}
      style={{ height: `calc(${SNAP_RATIO[snap] * 100}vh - ${dragOffset}px)`, maxHeight: '92vh' }}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none select-none flex-col items-center pb-2 pt-3 active:cursor-grabbing"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerEnd}
        onPointerCancel={onHandlePointerEnd}
      >
        <span className="h-1.5 w-12 rounded-full bg-app-border" />
      </div>
      <div
        ref={contentRef}
        className={`min-h-0 flex-1 ${snap === 'full' ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{ touchAction: snap === 'full' ? 'pan-y' : 'none', overscrollBehavior: 'contain' }}
        onPointerDown={onContentPointerDown}
        onPointerMove={onContentPointerMove}
        onPointerUp={onContentPointerEnd}
        onPointerCancel={onContentPointerEnd}
      >
        {children}
      </div>
    </div>
  );
}
