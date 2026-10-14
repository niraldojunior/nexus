import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import Modal from '../components/ui/Modal';

afterEach(cleanup);

describe('useFocusTrap via Modal', () => {
  it('Tab no último item volta ao primeiro e Shift+Tab no primeiro vai ao último', () => {
    render(
      <>
        <button>fora</button>
        <Modal title="Teste" onClose={() => {}}>
          <button>um</button>
          <button>dois</button>
        </Modal>
      </>,
    );
    const um = screen.getByText('um');
    const dois = screen.getByText('dois');
    dois.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(um);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(dois);
  });
});
