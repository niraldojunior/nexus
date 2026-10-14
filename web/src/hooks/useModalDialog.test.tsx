import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useModalDialog } from './useModalDialog';

function Dialog({ trapped = true }: { trapped?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useModalDialog(ref, trapped);
  return (
    <div ref={ref} tabIndex={-1} role="dialog" aria-label="Teste">
      <button type="button">Primeiro</button>
      <button type="button">Último</button>
    </div>
  );
}

function Host() {
  return (
    <>
      <button type="button">Abrir</button>
    </>
  );
}

describe('useModalDialog', () => {
  afterEach(cleanup);

  it('foca o painel ao abrir e prende o Tab no diálogo', () => {
    render(<Dialog />);
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
    const last = screen.getByText('Último');
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('Primeiro'));
  });

  it('devolve o foco a quem o tinha ao fechar', () => {
    render(<Host />);
    const opener = screen.getByText('Abrir');
    opener.focus();
    const { unmount } = render(<Dialog />);
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('não prende o Tab enquanto suspenso', () => {
    render(<Dialog trapped={false} />);
    screen.getByText('Último').focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByText('Último'));
  });
});
