import { cleanup, fireEvent, render } from '@testing-library/react';
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

function renderSheet(initialSnap?: 'peek' | 'mid' | 'full') {
  const onClose = vi.fn();
  const { container } = render(
    <BottomSheet onClose={onClose} initialSnap={initialSnap}>
      <div>Conteudo do painel</div>
    </BottomSheet>,
  );
  const outer = container.firstChild as HTMLElement;
  // Filhos da folha: [0] alça, [1] área de conteúdo (a que tem os handlers de ponteiro).
  const content = outer.children[1] as HTMLElement;
  return { onClose, outer, content };
}

// Um arraste completo no corpo: pressiona, move até `toY` e solta.
function dragContent(content: HTMLElement, fromY: number, toY: number) {
  fireEvent.pointerDown(content, { clientY: fromY, pointerId: 1 });
  fireEvent.pointerMove(content, { clientY: toY, pointerId: 1 });
  fireEvent.pointerUp(content, { clientY: toY, pointerId: 1 });
}

describe('BottomSheet', () => {
  it('um arraste curto para cima em mid leva a folha a full (encaixe por direção)', () => {
    const { outer, content } = renderSheet('mid');
    expect(outer.style.height).toContain('48vh');
    dragContent(content, 500, 460); // sobe 40px (> confirmação), passo para cima
    expect(outer.style.height).toContain('92vh');
  });

  it('em full com o conteúdo já rolado, arrastar para baixo não mexe na folha (rola o conteúdo)', () => {
    const { outer, content } = renderSheet('full');
    content.scrollTop = 120; // não está no topo
    dragContent(content, 300, 360); // desce 60px
    expect(outer.style.height).toContain('92vh'); // folha permanece em full
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
