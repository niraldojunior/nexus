import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';

type Snap = 'peek' | 'mid' | 'full';

// Altura de cada ponto de encaixe, em fração da viewport — mesmo espírito do
// bottom sheet do Google Maps: nasce no meio, arrasta pra ver mais ou menos.
const SNAP_RATIO: Record<Snap, number> = {
  peek: 0.12,
  mid: 0.48,
  full: 0.92,
};

// Ordem dos encaixes, de baixo para cima — o encaixe na soltura anda um passo por
// vez nesta ordem, no sentido do arraste (ver endSheetDrag).
const SNAPS: Snap[] = ['peek', 'mid', 'full'];

// Movimento mínimo (px) antes de um toque no corpo virar arraste da folha — abaixo
// disto é toque/clique (ou rolagem do conteúdo), e a folha não se mexe.
const DRAG_COMMIT_THRESHOLD = 6;

// Deslocamento mínimo (px) para a soltura confirmar a troca de encaixe. Abaixo disto,
// a folha volta ao encaixe de onde saiu; acima, anda um passo no sentido do arraste.
const SNAP_CONFIRM_PX = 24;

const snapUp = (snap: Snap): Snap => SNAPS[Math.min(SNAPS.indexOf(snap) + 1, SNAPS.length - 1)];
const snapDown = (snap: Snap): Snap => SNAPS[Math.max(SNAPS.indexOf(snap) - 1, 0)];

/**
 * Painel inferior arrastável (mobile), com pontos de encaixe peek/mid/full.
 *
 * Gesto no estilo "Google Maps puro": arrastar o corpo para cima expande a folha
 * encaixe a encaixe até `full`; só a partir de `full` é que o conteúdo rola. Ao
 * atingir `full` no meio de um arraste para cima, o gesto é entregue ao conteúdo
 * sem soltar o dedo. Em `full`, um puxão para baixo com o conteúdo no topo recolhe a
 * folha; arrastar abaixo do `peek` fecha. A alça no topo sempre arrasta a folha, em
 * qualquer encaixe. Sem véu escuro sobre o mapa — o Google Maps também não escurece o
 * mapa ao abrir o detalhe. Todo o conteúdo (foto, título e corpo) mora no `children`.
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
  // Modo do gesto em curso: `idle` = toque ainda indeciso (pode virar arraste da folha
  // ou rolagem do conteúdo); `sheet` = arrastando a folha; `content` = a folha chegou
  // ao topo e o gesto virou rolagem do conteúdo (rolada à mão, ver onContentPointerMove).
  const modeRef = useRef<'idle' | 'sheet' | 'content'>('idle');
  // Y do ponteiro no início do gesto (âncora do arraste) e no último move (base do
  // incremento ao rolar o conteúdo à mão). Altura da folha em px no início do arraste.
  const startYRef = useRef(0);
  const lastYRef = useRef(0);
  const sheetStartHeightRef = useRef(0);
  const dragOffsetRef = useRef(0);
  // Espelho do encaixe atual, legível de dentro dos handlers sem esperar o re-render —
  // preciso porque um mesmo `pointermove` pode trocar o encaixe e agir sobre o novo.
  const snapRef = useRef<Snap>(initialSnap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  const commitSnap = (next: Snap) => {
    snapRef.current = next;
    setSnap(next);
  };

  // Move a folha acompanhando o dedo. Se a altura atingir o teto de `full`, entrega o
  // gesto ao conteúdo (passa a `content`) em vez de "estourar" o topo — é o "expandir
  // até full, depois rolar" do Google Maps.
  const moveSheet = (clientY: number, pointerId: number, cancelable: boolean, preventDefault: () => void) => {
    const offset = clientY - startYRef.current;
    const height = sheetStartHeightRef.current - offset;
    const fullHeight = window.innerHeight * SNAP_RATIO.full;
    if (height >= fullHeight) {
      commitSnap('full');
      setDragOffset(0);
      dragOffsetRef.current = 0;
      setDragging(false);
      modeRef.current = 'content';
      lastYRef.current = clientY;
      // Mantém o ponteiro capturado no conteúdo para o move seguinte já rolar à mão.
      contentRef.current?.setPointerCapture?.(pointerId);
      if (cancelable) preventDefault();
      return;
    }
    dragOffsetRef.current = offset;
    setDragOffset(offset);
    if (cancelable) preventDefault();
  };

  // Fim de um arraste da folha: encaixa por DIREÇÃO (não por distância) — acima do
  // limiar de confirmação anda um passo no sentido do arraste, abaixo volta ao encaixe
  // atual. É isto que faz um arrasto curto para cima em `mid` chegar a `full` (antes,
  // o encaixe por proximidade puxava de volta para `mid`).
  const endSheetDrag = () => {
    const offset = dragOffsetRef.current;
    const finalHeight = sheetStartHeightRef.current - offset;
    const ratio = finalHeight / window.innerHeight;
    dragOffsetRef.current = 0;
    setDragOffset(0);
    setDragging(false);

    // Arrastar bem abaixo do peek fecha a folha, como puxar o card pra fora da tela.
    if (ratio < SNAP_RATIO.peek * 0.5) {
      onClose();
      return;
    }
    const current = snapRef.current;
    if (offset < -SNAP_CONFIRM_PX) commitSnap(snapUp(current));
    else if (offset > SNAP_CONFIRM_PX) commitSnap(snapDown(current));
    else commitSnap(current);
  };

  // Alça no topo: sempre arrasta a folha, em qualquer encaixe.
  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    modeRef.current = 'sheet';
    startYRef.current = event.clientY;
    sheetStartHeightRef.current = window.innerHeight * SNAP_RATIO[snapRef.current];
    dragOffsetRef.current = 0;
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (modeRef.current === 'sheet') {
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
    }
  };
  const onHandlePointerEnd = () => {
    if (modeRef.current === 'sheet') endSheetDrag();
    modeRef.current = 'idle';
  };

  // Corpo: um toque começa indeciso (`idle`). Em peek/mid, passar do limiar em qualquer
  // direção arrasta a folha. Em full, só um puxão para baixo com o conteúdo no topo
  // arrasta (recolhe) — todo o resto é rolagem nativa do conteúdo (touch-action: pan-y).
  const onContentPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    modeRef.current = 'idle';
    startYRef.current = event.clientY;
    lastYRef.current = event.clientY;
    sheetStartHeightRef.current = window.innerHeight * SNAP_RATIO[snapRef.current];
    dragOffsetRef.current = 0;
  };
  const onContentPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const mode = modeRef.current;
    if (mode === 'content') {
      // Ponteiro capturado: a rolagem nativa não assume no meio do gesto, então rolamos
      // o conteúdo à mão pelo incremento desde o último move.
      const el = contentRef.current;
      if (el) el.scrollTop -= event.clientY - lastYRef.current;
      lastYRef.current = event.clientY;
      if (event.cancelable) event.preventDefault();
      return;
    }
    if (mode === 'sheet') {
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
      return;
    }
    // mode === 'idle': decidir para onde o gesto vai.
    const delta = event.clientY - startYRef.current;
    const atTop = (contentRef.current?.scrollTop ?? 0) <= 0;
    if (snapRef.current === 'full') {
      if (atTop && delta > DRAG_COMMIT_THRESHOLD) {
        modeRef.current = 'sheet';
        setDragging(true);
        contentRef.current?.setPointerCapture?.(event.pointerId);
        moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
      }
      return;
    }
    if (Math.abs(delta) > DRAG_COMMIT_THRESHOLD) {
      modeRef.current = 'sheet';
      setDragging(true);
      contentRef.current?.setPointerCapture?.(event.pointerId);
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
    }
  };
  const onContentPointerEnd = () => {
    if (modeRef.current === 'sheet') endSheetDrag();
    modeRef.current = 'idle';
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
