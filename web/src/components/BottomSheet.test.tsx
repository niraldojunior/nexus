import { cleanup, fireEvent, render } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';

// A folha renderiza a altura em `vh` do encaixe atual, então basta checar o `vh` no
// style — independe do innerHeight. Mas a matemática do arraste é em px e usa
// innerHeight, então fixamos um valor estável para os limiares.
beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSheet(
  initialSnap?: 'peek' | 'mid' | 'full',
  children: ReactNode = <div>Conteudo do painel</div>,
  onSnapChange = vi.fn(),
) {
  const onClose = vi.fn();
  const { container } = render(
    <BottomSheet onClose={onClose} initialSnap={initialSnap} onSnapChange={onSnapChange}>
      {children}
    </BottomSheet>,
  );
  const outer = container.firstChild as HTMLElement;
  // Filhos da folha: [0] alça, [1] área de conteúdo (a que tem os handlers de ponteiro).
  const handle = outer.children[0] as HTMLElement;
  const content = outer.children[1] as HTMLElement;
  return { onClose, onSnapChange, outer, handle, content };
}

// Um arraste completo no corpo: pressiona, move até `toY` e solta.
function dragContent(content: HTMLElement, fromY: number, toY: number) {
  fireEvent.pointerDown(content, { clientY: fromY, pointerId: 1 });
  fireEvent.pointerMove(content, { clientY: toY, pointerId: 1 });
  fireEvent.pointerUp(content, { clientY: toY, pointerId: 1 });
}

describe('BottomSheet', () => {
  it('mantém ownership ao transferir o mesmo gesto da alça para o conteúdo em full', () => {
    const { outer, handle, content } = renderSheet('mid');

    fireEvent.pointerDown(handle, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 50, pointerId: 1 });
    fireEvent.pointerUp(content, { clientY: 50, pointerId: 1 });

    expect(outer.style.height).toContain('92vh');
    // 48px excedentes ao atingir full + 50px do movimento seguinte.
    expect(content.scrollTop).toBe(98);
  });

  it('consome no scroll da lista o excedente do gesto que alcança full', () => {
    const { outer, content } = renderSheet(
      'mid',
      <div style={{ height: 1600 }}>Lista longa de sub-recursos</div>,
    );

    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    // mid = 384px, full = 736px: 352px expandem a folha e os 48px restantes
    // precisam continuar no conteúdo sem exigir que o usuário solte o dedo.
    fireEvent.pointerMove(content, { clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(content, { clientY: 100, pointerId: 1 });

    expect(outer.style.height).toContain('92vh');
    expect(content.scrollTop).toBe(48);
  });

  it('não permite que um segundo ponteiro roube ou cancele o gesto ativo', () => {
    const { outer, content } = renderSheet('mid');

    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    fireEvent.pointerDown(content, { clientY: 700, pointerId: 2 });
    fireEvent.pointerMove(content, { clientY: 460, pointerId: 1 });
    fireEvent.pointerCancel(content, { pointerId: 2 });
    fireEvent.pointerUp(content, { clientY: 460, pointerId: 1 });

    expect(outer.style.height).toContain('92vh');
  });

  it('libera ownership quando o pointerup acontece fora do painel', () => {
    const { outer, content } = renderSheet('mid');

    fireEvent.pointerDown(content, { clientX: 100, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientX: 180, clientY: 505, pointerId: 1 });
    fireEvent.pointerUp(window, { clientX: 180, clientY: 505, pointerId: 1 });

    dragContent(content, 500, 460);
    expect(outer.style.height).toContain('92vh');
  });

  it('aborta e libera ownership quando a captura do ponteiro é perdida', () => {
    const { outer, content } = renderSheet('mid');

    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 460, pointerId: 1 });
    fireEvent.lostPointerCapture(content, { pointerId: 1 });

    expect(outer.style.height).toBe('calc(48vh - 0px)');
    dragContent(content, 500, 460);
    expect(outer.style.height).toContain('92vh');
  });

  it('ignora pointermove de hover quando nenhum gesto foi iniciado', () => {
    const { outer, content } = renderSheet('mid');

    fireEvent.pointerMove(content, { clientX: 100, clientY: 500, pointerId: 1 });

    expect(outer.style.height).toBe('calc(48vh - 0px)');
  });

  it('preserva o tap de um controle interno quando não há deslocamento vertical', () => {
    const onClick = vi.fn();
    const { content } = renderSheet('mid', <button onClick={onClick}>Abrir aba</button>);
    const button = content.querySelector('button') as HTMLButtonElement;

    fireEvent.pointerDown(button, { clientX: 100, clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(button, { clientX: 100, clientY: 500, pointerId: 1 });
    fireEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('recolhe com gesto descendente iniciado em um controle interno', () => {
    const stop = (event: ReactPointerEvent<HTMLButtonElement>) => event.stopPropagation();
    const { outer, content } = renderSheet(
      'full',
      <button onPointerDown={stop} onPointerMove={stop} onPointerUp={stop}>
        Visão geral
      </button>,
    );
    const button = content.querySelector('button') as HTMLButtonElement;

    fireEvent.pointerDown(button, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(button, { clientY: 540, pointerId: 1 });
    fireEvent.pointerUp(button, { clientY: 540, pointerId: 1 });

    expect(outer.style.height).toBe('calc(48vh - 0px)');
  });

  it('não sequestra um gesto predominantemente horizontal iniciado dentro do painel', () => {
    const { outer, content } = renderSheet('mid');

    fireEvent.pointerDown(content, { clientX: 200, clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientX: 100, clientY: 470, pointerId: 1 });
    fireEvent.pointerUp(content, { clientX: 100, clientY: 470, pointerId: 1 });

    expect(outer.style.height).toBe('calc(48vh - 0px)');
    expect(content.style.touchAction).toBe('pan-x');
  });

  it('republica a altura do snap atual quando a viewport muda', () => {
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
      configurable: true,
    });
    const { outer, onSnapChange } = renderSheet('mid');
    expect(onSnapChange).toHaveBeenLastCalledWith({ snap: 'mid', heightPx: 384 });

    window.innerHeight = 1000;
    fireEvent(window, new Event('resize'));
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    fireEvent.transitionEnd(outer, { propertyName: 'height' });

    expect(onSnapChange).toHaveBeenLastCalledWith({ snap: 'mid', heightPx: 480 });
  });

  it('publica o encaixe inicial e o novo encaixe somente com a altura estabilizada', () => {
    const { outer, content, onSnapChange } = renderSheet('mid');
    expect(onSnapChange).toHaveBeenLastCalledWith({ snap: 'mid', heightPx: 384 });

    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 460, pointerId: 1 });
    expect(onSnapChange).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(content, { clientY: 460, pointerId: 1 });

    expect(onSnapChange).toHaveBeenCalledTimes(1);
    fireEvent.transitionEnd(outer, { propertyName: 'height' });
    expect(onSnapChange).toHaveBeenCalledTimes(2);
    expect(onSnapChange).toHaveBeenLastCalledWith({ snap: 'full', heightPx: 736 });
  });

  it('aborta o arrasto no pointercancel e retorna ao encaixe original', () => {
    const { outer, content } = renderSheet('mid');

    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 460, pointerId: 1 });
    fireEvent.pointerCancel(content, { clientY: 460, pointerId: 1 });

    expect(outer.style.height).toContain('48vh');
  });

  it('restaura o scroll inicial quando pointercancel ocorre após transferir para a lista', () => {
    const { outer, content } = renderSheet(
      'mid',
      <div style={{ height: 1600 }}>Lista longa de sub-recursos</div>,
    );
    content.scrollTop = 12;

    fireEvent.pointerDown(content, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 100, pointerId: 1 });
    expect(content.scrollTop).toBe(60);
    fireEvent.pointerCancel(content, { clientY: 100, pointerId: 1 });

    expect(outer.style.height).toContain('48vh');
    expect(content.scrollTop).toBe(12);
  });

  it('expande mesmo quando o gesto começa em um controle interno que interrompe bubbling', () => {
    const onClick = vi.fn();
    const { outer } = renderSheet(
      'mid',
      <button
        type="button"
        data-testid="controle-interno"
        onClick={onClick}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
      >
        Aba Visão geral
      </button>,
    );
    const control = outer.querySelector('[data-testid="controle-interno"]') as HTMLElement;

    fireEvent.pointerDown(control, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(control, { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(control, { clientY: 460, pointerId: 1 });
    fireEvent(control, new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1 }));

    expect(outer.style.height).toContain('92vh');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('não bloqueia ativação por teclado depois de um arraste', () => {
    const onClick = vi.fn();
    const { content } = renderSheet('mid', <button onClick={onClick}>Abrir aba</button>);
    const button = content.querySelector('button') as HTMLButtonElement;

    fireEvent.pointerDown(button, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(button, { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(button, { clientY: 460, pointerId: 1 });
    fireEvent.click(button, { detail: 0 });

    expect(onClick).toHaveBeenCalledOnce();
  });

  it('não deixa outro ponteiro consumir a supressão do click derivado', () => {
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    const { content } = renderSheet(
      'mid',
      <>
        <button onClick={firstClick}>Primeiro</button>
        <button onClick={secondClick}>Segundo</button>
      </>,
    );
    const [first, second] = Array.from(content.querySelectorAll('button'));

    fireEvent.pointerDown(first, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(first, { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(first, { clientY: 460, pointerId: 1 });
    fireEvent(second, new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1 }));
    fireEvent(first, new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1 }));

    expect(secondClick).toHaveBeenCalledOnce();
    expect(firstClick).not.toHaveBeenCalled();
  });

  it('limpa a supressão anterior quando começa uma nova interação aceita', () => {
    const firstClick = vi.fn();
    const secondClick = vi.fn();
    const { content } = renderSheet(
      'mid',
      <>
        <button onClick={firstClick}>Primeiro</button>
        <button onClick={secondClick}>Segundo</button>
      </>,
    );
    const [first, second] = Array.from(content.querySelectorAll('button'));

    fireEvent.pointerDown(first, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(first, { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(first, { clientY: 460, pointerId: 1 });
    fireEvent.pointerDown(second, { clientY: 500, pointerId: 1 });
    fireEvent.pointerUp(second, { clientY: 500, pointerId: 1 });
    fireEvent(second, new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1 }));

    expect(firstClick).not.toHaveBeenCalled();
    expect(secondClick).toHaveBeenCalledOnce();
  });

  it('expira a supressão quando o navegador não produz click derivado', () => {
    vi.useFakeTimers();
    const onClick = vi.fn();
    const { content } = renderSheet('mid', <button onClick={onClick}>Abrir aba</button>);
    const button = content.querySelector('button') as HTMLButtonElement;

    fireEvent.pointerDown(button, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(button, { clientY: 460, pointerId: 1 });
    fireEvent.pointerUp(button, { clientY: 460, pointerId: 1 });
    vi.advanceTimersByTime(1000);
    fireEvent(button, new PointerEvent('click', { bubbles: true, detail: 1, pointerId: 1 }));

    expect(onClick).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('um arraste curto para cima em mid leva a folha a full (encaixe por direção)', () => {
    const { outer, content } = renderSheet('mid');
    expect(outer.style.height).toContain('48vh');
    dragContent(content, 500, 460); // sobe 40px (> confirmação), passo para cima
    expect(outer.style.height).toContain('92vh');
  });

  it('em full com o conteúdo já rolado, arrastar para baixo não mexe na folha (rola o conteúdo)', () => {
    const { outer, content } = renderSheet('full');
    expect(content.style.touchAction).toBe('pan-x');
    content.scrollTop = 120; // não está no topo
    dragContent(content, 300, 360); // desce 60px
    expect(outer.style.height).toContain('92vh'); // folha permanece em full
    expect(content.scrollTop).toBe(60);
  });

  it('em full e no topo, um gesto ascendente rola o conteúdo sem mover a folha', () => {
    const { outer, content } = renderSheet('full');
    content.scrollTop = 0;

    dragContent(content, 300, 240);

    expect(outer.style.height).toContain('92vh');
    expect(content.scrollTop).toBe(60);
  });

  it('transfere o mesmo gesto descendente do scroll para a folha ao alcançar o topo', () => {
    const { outer, content } = renderSheet('full');
    content.scrollTop = 30;

    fireEvent.pointerDown(content, { clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 320, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 340, pointerId: 1 });
    fireEvent.pointerMove(content, { clientY: 380, pointerId: 1 });
    fireEvent.pointerUp(content, { clientY: 380, pointerId: 1 });

    expect(content.scrollTop).toBe(0);
    expect(outer.style.height).toContain('48vh');
  });
  it('em full e no topo, um puxão para baixo recolhe a folha para mid', () => {
    const { outer, content } = renderSheet('full');
    content.scrollTop = 0;
    dragContent(content, 300, 360); // desce 60px a partir do topo
    expect(outer.style.height).toContain('48vh');
  });

  it('arrastar bem abaixo do peek fecha a folha', () => {
    const { onClose, content } = renderSheet('peek');
    dragContent(content, 300, 370); // desce 70px — abaixo de metade do peek
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('um toque sem passar do limiar não move a folha', () => {
    const { outer, content } = renderSheet('mid');
    dragContent(content, 300, 303); // 3px < limiar de arraste
    expect(outer.style.height).toContain('48vh');
  });
});
