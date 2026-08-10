import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type TransitionEvent,
} from 'react';

export type BottomSheetSnap = 'peek' | 'mid' | 'full';
export type BottomSheetSnapState = { snap: BottomSheetSnap; heightPx: number };

// Comando externo de encaixe da folha. `seq` é um contador monotônico: a folha reage
// só quando ele muda (nunca aplica o valor inicial no mount), então o mesmo encaixe
// pode ser pedido de novo bastando um `seq` novo. Ver useSheetSnapCommand.
export type SheetSnapCommand = { snap: BottomSheetSnap; seq: number };

// Altura de cada ponto de encaixe, em fração da viewport — mesmo espírito do
// bottom sheet do Google Maps: nasce no meio, arrasta pra ver mais ou menos.
const SNAP_RATIO: Record<BottomSheetSnap, number> = {
  peek: 0.12,
  mid: 0.48,
  full: 0.92,
};

// Ordem dos encaixes, de baixo para cima — o encaixe na soltura anda um passo por
// vez nesta ordem, no sentido do arraste (ver endSheetDrag).
const SNAPS: BottomSheetSnap[] = ['peek', 'mid', 'full'];

// Movimento mínimo (px) antes de um toque no corpo virar arraste da folha — abaixo
// disto é toque/clique (ou rolagem do conteúdo), e a folha não se mexe.
const DRAG_COMMIT_THRESHOLD = 6;

// Deslocamento mínimo (px) para a soltura confirmar a troca de encaixe. Abaixo disto,
// a folha volta ao encaixe de onde saiu; acima, anda um passo no sentido do arraste.
const SNAP_CONFIRM_PX = 24;
const RESIZE_SETTLE_MS = 250;
const CLICK_SUPPRESSION_MS = 500;

type PendingClickSuppression = {
  pointerId: number;
  target: EventTarget | null;
};

const snapUp = (snap: BottomSheetSnap): BottomSheetSnap =>
  SNAPS[Math.min(SNAPS.indexOf(snap) + 1, SNAPS.length - 1)];
const snapDown = (snap: BottomSheetSnap): BottomSheetSnap =>
  SNAPS[Math.max(SNAPS.indexOf(snap) - 1, 0)];

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
  onSnapChange,
  snapCommand,
  initialSnap = 'mid',
}: {
  children: ReactNode;
  onClose: () => void;
  onSnapChange?: (state: BottomSheetSnapState) => void;
  // Comando externo de encaixe (ver SheetSnapCommand): a folha salta para `snap` a cada
  // `seq` novo. Cobre tanto o "encolher para peek" quando o usuário navega o mapa à mão
  // (issue #19) quanto pedidos do próprio painel (ex.: a aba Viabilidade pedindo `mid`).
  // Montar o comando é papel do useSheetSnapCommand, no painel.
  snapCommand?: SheetSnapCommand;
  initialSnap?: BottomSheetSnap;
}) {
  const [snap, setSnap] = useState<BottomSheetSnap>(initialSnap);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  const sheetRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const onSnapChangeRef = useRef(onSnapChange);
  const gestureTargetRef = useRef<EventTarget | null>(null);
  const pendingClickSuppressionRef = useRef<PendingClickSuppression | null>(null);
  const clickSuppressionTimerRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const capturedByRef = useRef<EventTarget | null>(null);
  const pointerLifecycleCleanupRef = useRef<(() => void) | null>(null);
  // Modo do gesto em curso: `idle` = toque ainda indeciso (pode virar arraste da folha
  // ou rolagem do conteúdo); `sheet` = arrastando a folha; `content` = a folha chegou
  // ao topo e o gesto virou rolagem do conteúdo; `horizontal` = gesto reservado ao
  // descendente (abas, carrossel ou Street View), que a folha não deve sequestrar.
  const modeRef = useRef<'idle' | 'sheet' | 'content' | 'horizontal'>('idle');
  // Y do ponteiro no início do gesto (âncora do arraste) e no último move (base do
  // incremento ao rolar o conteúdo à mão). Altura da folha em px no início do arraste.
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const lastYRef = useRef(0);
  const sheetStartHeightRef = useRef(0);
  const dragOffsetRef = useRef(0);
  const gestureStartSnapRef = useRef<BottomSheetSnap>(initialSnap);
  const gestureStartScrollTopRef = useRef(0);
  // Espelho do encaixe atual, legível de dentro dos handlers sem esperar o re-render —
  // preciso porque um mesmo `pointermove` pode trocar o encaixe e agir sobre o novo.
  const snapRef = useRef<BottomSheetSnap>(initialSnap);
  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  // Comando externo de encaixe (ver prop `snapCommand`). Guardamos o último `seq` visto
  // para reagir só quando ele muda — nunca ao valor inicial. Se a folha já está no encaixe
  // pedido, é um no-op; a transição publica o novo snap pelo `transitionend`.
  const lastSnapCommandSeqRef = useRef(snapCommand?.seq);
  useEffect(() => {
    if (snapCommand === undefined || snapCommand.seq === lastSnapCommandSeqRef.current) return;
    lastSnapCommandSeqRef.current = snapCommand.seq;
    if (snapRef.current !== snapCommand.snap) {
      snapRef.current = snapCommand.snap;
      setSnap(snapCommand.snap);
    }
  }, [snapCommand]);

  onSnapChangeRef.current = onSnapChange;

  const reportStableSnap = useCallback(() => {
    const measuredHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;
    const currentSnap = snapRef.current;
    onSnapChangeRef.current?.({
      snap: currentSnap,
      heightPx: measuredHeight || window.innerHeight * SNAP_RATIO[currentSnap],
    });
  }, []);

  // Publica a geometria inicial — e republica quando muda o painel/callback sem trocar
  // de snap (ex.: Site → Recurso). Mudanças de snap são publicadas no `transitionend`.
  useEffect(() => {
    reportStableSnap();
  }, [onSnapChange, reportStableSnap]);

  useEffect(() => {
    let resizeTimer: number | undefined;
    const reportAfterResizeSettles = () => {
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(reportStableSnap, RESIZE_SETTLE_MS);
    };
    window.addEventListener('resize', reportAfterResizeSettles);
    return () => {
      window.removeEventListener('resize', reportAfterResizeSettles);
      if (resizeTimer !== undefined) window.clearTimeout(resizeTimer);
    };
  }, [reportStableSnap]);

  const onSheetTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === 'height') {
      reportStableSnap();
    }
  };

  const commitSnap = (next: BottomSheetSnap) => {
    snapRef.current = next;
    setSnap(next);
  };

  // Move a folha acompanhando o dedo. Se a altura atingir o teto de `full`, entrega o
  // gesto ao conteúdo (passa a `content`) em vez de "estourar" o topo — é o "expandir
  // até full, depois rolar" do Google Maps.
  const moveSheet = (
    clientY: number,
    pointerId: number,
    cancelable: boolean,
    preventDefault: () => void,
  ) => {
    const offset = clientY - startYRef.current;
    const height = sheetStartHeightRef.current - offset;
    const fullHeight = window.innerHeight * SNAP_RATIO.full;
    if (height >= fullHeight) {
      // A parcela do gesto que ultrapassou a altura de `full` já pertence à lista.
      // Consumi-la neste mesmo pointermove evita perder movimento na fronteira entre
      // expansão e scroll (principalmente quando o usuário faz um swipe único e solta).
      const contentOverflow = height - fullHeight;
      if (contentOverflow > 0 && contentRef.current) {
        contentRef.current.scrollTop += contentOverflow;
      }
      commitSnap('full');
      setDragOffset(0);
      dragOffsetRef.current = 0;
      setDragging(false);
      modeRef.current = 'content';
      lastYRef.current = clientY;
      // Mantém o ponteiro capturado no conteúdo para o move seguinte já rolar à mão.
      capturedByRef.current = contentRef.current;
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
    setDragOffset(0);
    setDragging(false);
  };

  const clearPointerLifecycle = () => {
    pointerLifecycleCleanupRef.current?.();
    pointerLifecycleCleanupRef.current = null;
  };

  const clearClickSuppression = () => {
    pendingClickSuppressionRef.current = null;
    if (clickSuppressionTimerRef.current !== null) {
      window.clearTimeout(clickSuppressionTimerRef.current);
      clickSuppressionTimerRef.current = null;
    }
  };

  const suppressGestureClick = (pointerId: number) => {
    clearClickSuppression();
    pendingClickSuppressionRef.current = {
      pointerId,
      target: gestureTargetRef.current,
    };
    clickSuppressionTimerRef.current = window.setTimeout(
      clearClickSuppression,
      CLICK_SUPPRESSION_MS,
    );
  };

  const finishActivePointer = (pointerId: number, cancelled: boolean) => {
    if (activePointerIdRef.current !== pointerId) return;
    activePointerIdRef.current = null;
    capturedByRef.current = null;
    if (cancelled) {
      if (modeRef.current === 'sheet' || modeRef.current === 'content') {
        commitSnap(gestureStartSnapRef.current);
        if (contentRef.current) contentRef.current.scrollTop = gestureStartScrollTopRef.current;
      }
      setDragOffset(0);
      setDragging(false);
      clearClickSuppression();
    } else if (modeRef.current === 'sheet') {
      endSheetDrag();
    }
    modeRef.current = 'idle';
    clearPointerLifecycle();
  };

  const armPointerLifecycle = () => {
    clearPointerLifecycle();
    const onGlobalPointerUp = (event: globalThis.PointerEvent) => {
      finishActivePointer(event.pointerId, false);
    };
    const onGlobalPointerCancel = (event: globalThis.PointerEvent) => {
      finishActivePointer(event.pointerId, true);
    };
    const onGlobalLostPointerCapture = (event: globalThis.PointerEvent) => {
      if (event.target === capturedByRef.current) finishActivePointer(event.pointerId, true);
    };
    window.addEventListener('pointerup', onGlobalPointerUp, true);
    window.addEventListener('pointercancel', onGlobalPointerCancel, true);
    window.addEventListener('lostpointercapture', onGlobalLostPointerCapture, true);
    pointerLifecycleCleanupRef.current = () => {
      window.removeEventListener('pointerup', onGlobalPointerUp, true);
      window.removeEventListener('pointercancel', onGlobalPointerCancel, true);
      window.removeEventListener('lostpointercapture', onGlobalLostPointerCapture, true);
    };
  };

  useEffect(
    () => () => {
      pointerLifecycleCleanupRef.current?.();
      if (clickSuppressionTimerRef.current !== null) {
        window.clearTimeout(clickSuppressionTimerRef.current);
      }
    },
    [],
  );

  // Alça no topo: sempre arrasta a folha, em qualquer encaixe.
  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    activePointerIdRef.current = event.pointerId;
    armPointerLifecycle();
    modeRef.current = 'sheet';
    gestureStartSnapRef.current = snapRef.current;
    gestureStartScrollTopRef.current = contentRef.current?.scrollTop ?? 0;
    startYRef.current = event.clientY;
    sheetStartHeightRef.current = window.innerHeight * SNAP_RATIO[snapRef.current];
    dragOffsetRef.current = 0;
    setDragging(true);
    capturedByRef.current = event.currentTarget;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    if (modeRef.current === 'sheet') {
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
    }
  };
  const onHandlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    finishActivePointer(event.pointerId, false);
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    finishActivePointer(event.pointerId, true);
  };

  // Corpo: um toque começa indeciso (`idle`). Em peek/mid, passar do limiar em qualquer
  // direção arrasta a folha. Em full, o scroll vertical acompanha o ponteiro; quando um
  // gesto descendente consome o restante do scroll e chega ao topo, o excedente continua
  // no arraste da folha. `pan-x` fica reservado ao navegador/descendentes.
  const onContentPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;
    clearClickSuppression();
    activePointerIdRef.current = event.pointerId;
    gestureTargetRef.current = event.target;
    armPointerLifecycle();
    modeRef.current = 'idle';
    gestureStartSnapRef.current = snapRef.current;
    gestureStartScrollTopRef.current = contentRef.current?.scrollTop ?? 0;
    startXRef.current = event.clientX;
    startYRef.current = event.clientY;
    lastYRef.current = event.clientY;
    sheetStartHeightRef.current = window.innerHeight * SNAP_RATIO[snapRef.current];
    dragOffsetRef.current = 0;
  };

  const moveScrollableContent = (event: PointerEvent<HTMLDivElement>) => {
    const el = contentRef.current;
    if (!el) return;
    const movement = event.clientY - lastYRef.current;

    if (movement > 0 && el.scrollTop <= movement) {
      const sheetMovement = movement - el.scrollTop;
      el.scrollTop = 0;
      modeRef.current = 'sheet';
      sheetStartHeightRef.current = window.innerHeight * SNAP_RATIO.full;
      startYRef.current = event.clientY - sheetMovement;
      dragOffsetRef.current = 0;
      setDragging(true);
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
      return;
    }

    el.scrollTop -= movement;
    lastYRef.current = event.clientY;
    if (event.cancelable) event.preventDefault();
  };

  const onContentPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;
    const mode = modeRef.current;
    if (mode === 'horizontal') return;
    if (mode === 'content') {
      moveScrollableContent(event);
      return;
    }
    if (mode === 'sheet') {
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
      return;
    }
    // mode === 'idle': decidir para onde o gesto vai.
    const delta = event.clientY - startYRef.current;
    const horizontalDelta = event.clientX - startXRef.current;
    if (
      Math.abs(horizontalDelta) > DRAG_COMMIT_THRESHOLD &&
      Math.abs(horizontalDelta) > Math.abs(delta)
    ) {
      modeRef.current = 'horizontal';
      return;
    }
    const atTop = (contentRef.current?.scrollTop ?? 0) <= 0;
    if (snapRef.current === 'full') {
      if (atTop && delta > DRAG_COMMIT_THRESHOLD) {
        modeRef.current = 'sheet';
        suppressGestureClick(event.pointerId);
        setDragging(true);
        capturedByRef.current = contentRef.current;
        contentRef.current?.setPointerCapture?.(event.pointerId);
        moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
      } else if (Math.abs(delta) > DRAG_COMMIT_THRESHOLD) {
        modeRef.current = 'content';
        suppressGestureClick(event.pointerId);
        capturedByRef.current = contentRef.current;
        contentRef.current?.setPointerCapture?.(event.pointerId);
        moveScrollableContent(event);
      }
      return;
    }
    if (Math.abs(delta) > DRAG_COMMIT_THRESHOLD) {
      modeRef.current = 'sheet';
      suppressGestureClick(event.pointerId);
      setDragging(true);
      capturedByRef.current = contentRef.current;
      contentRef.current?.setPointerCapture?.(event.pointerId);
      moveSheet(event.clientY, event.pointerId, event.cancelable, () => event.preventDefault());
    }
  };
  const onContentPointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    finishActivePointer(event.pointerId, false);
  };
  const onContentClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    const pending = pendingClickSuppressionRef.current;
    if (!pending || event.detail === 0) return;
    const origin = pending.target;
    const target = event.target;
    const sameTargetPath =
      origin === target ||
      (origin instanceof Node &&
        target instanceof Node &&
        (origin.contains(target) || target.contains(origin)));
    if (!sameTargetPath) return;
    const clickPointerId = (event.nativeEvent as globalThis.PointerEvent).pointerId;
    if (typeof clickPointerId === 'number' && clickPointerId >= 0) {
      if (clickPointerId !== pending.pointerId) return;
    }
    clearClickSuppression();
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={sheetRef}
      data-testid="bottom-sheet"
      className={`fixed inset-x-0 bottom-0 z-40 flex flex-col overflow-hidden rounded-t-[20px] bg-app-panel shadow-soft-lg ${
        dragging ? '' : 'transition-[height] duration-200 ease-out'
      }`}
      style={{ height: `calc(${SNAP_RATIO[snap] * 100}vh - ${dragOffset}px)`, maxHeight: '92vh' }}
      onTransitionEnd={onSheetTransitionEnd}
    >
      <div
        className="flex shrink-0 cursor-grab touch-none select-none flex-col items-center pb-2 pt-3 active:cursor-grabbing"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerEnd}
        onPointerCancel={onPointerCancel}
      >
        <span className="h-1.5 w-12 rounded-full bg-app-border" />
      </div>
      <div
        ref={contentRef}
        data-testid="bottom-sheet-content"
        className={`min-h-0 flex-1 ${snap === 'full' ? 'overflow-y-auto' : 'overflow-hidden'}`}
        style={{
          touchAction: 'pan-x',
          overscrollBehavior: 'contain',
        }}
        onPointerDownCapture={onContentPointerDown}
        onPointerMoveCapture={onContentPointerMove}
        onPointerUpCapture={onContentPointerEnd}
        onPointerCancelCapture={onPointerCancel}
        onClickCapture={onContentClickCapture}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * Traduz pedidos de encaixe em comandos para a folha (ver SheetSnapCommand). `minimizeSignal`
 * é o contador vindo do GeoPage (navegação manual do mapa → peek); `requestSnap` é o pedido
 * próprio do painel (ex.: a aba Viabilidade pedindo `mid`). Os dois compartilham um único
 * contador (`seq`), então o último pedido é sempre o que a folha aplica. O comando inicial
 * nunca dispara no mount — só mudanças posteriores do sinal ou chamadas a `requestSnap`.
 */
export function useSheetSnapCommand(minimizeSignal?: number): {
  snapCommand: SheetSnapCommand | undefined;
  requestSnap: (snap: BottomSheetSnap) => void;
} {
  const [snapCommand, setSnapCommand] = useState<SheetSnapCommand | undefined>(undefined);
  const seqRef = useRef(0);

  const requestSnap = useCallback((snap: BottomSheetSnap) => {
    seqRef.current += 1;
    setSnapCommand({ snap, seq: seqRef.current });
  }, []);

  // Cada incremento do `minimizeSignal` pede peek. `lastMinimizeRef` guarda o valor
  // recebido no mount, para o primeiro efeito não disparar um peek indevido.
  const lastMinimizeRef = useRef(minimizeSignal);
  useEffect(() => {
    if (minimizeSignal === undefined || minimizeSignal === lastMinimizeRef.current) return;
    lastMinimizeRef.current = minimizeSignal;
    requestSnap('peek');
  }, [minimizeSignal, requestSnap]);

  return { snapCommand, requestSnap };
}
