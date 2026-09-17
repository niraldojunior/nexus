import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImageCharacteristicInput } from './ImageCharacteristicInput';

describe('ImageCharacteristicInput', () => {
  afterEach(() => {
    cleanup();
  });
  it('exibe imagem no modo readOnly quando há valor', () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    render(
      <ImageCharacteristicInput
        value={dataUrl}
        onChange={vi.fn()}
        readOnly={true}
        name="foto_recurso"
      />,
    );

    const img = screen.getByRole('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', dataUrl);
  });

  it('exibe traço no modo readOnly quando não há valor', () => {
    render(
      <ImageCharacteristicInput
        value=""
        onChange={vi.fn()}
        readOnly={true}
        name="foto_recurso"
      />,
    );

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('permite digitar URL/referência e chama onChange', async () => {
    const onChange = vi.fn();
    render(
      <ImageCharacteristicInput
        value=""
        onChange={onChange}
        readOnly={false}
        name="foto_recurso"
      />,
    );

    const input = screen.getByPlaceholderText('https://exemplo.com/imagem.png ou media/imagem.png');
    await userEvent.type(input, 'https://exemplo.com/foto.png');

    expect(onChange).toHaveBeenCalled();
  });

  it('permite upload de arquivo de imagem codificando em base64 data URL', async () => {
    const onChange = vi.fn();
    render(
      <ImageCharacteristicInput
        value=""
        onChange={onChange}
        readOnly={false}
        name="foto_recurso"
      />,
    );

    const file = new File(['fake-png-content'], 'test.png', { type: 'image/png' });
    const fileInput = screen.getByTestId('image-file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/));
    });
  });

  it('rejeita arquivos que não sejam imagem', async () => {
    const onChange = vi.fn();
    render(
      <ImageCharacteristicInput
        value=""
        onChange={onChange}
        readOnly={false}
        name="foto_recurso"
      />,
    );

    const file = new File(['fake-text-content'], 'test.txt', { type: 'text/plain' });
    const fileInput = screen.getByTestId('image-file-input');

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText('O arquivo selecionado deve ser uma imagem.')).toBeInTheDocument();
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('permite limpar/remover a imagem carregada', async () => {
    const onChange = vi.fn();
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    render(
      <ImageCharacteristicInput
        value={dataUrl}
        onChange={onChange}
        readOnly={false}
        name="foto_recurso"
      />,
    );

    const clearButton = screen.getByLabelText('Remover imagem');
    await userEvent.click(clearButton);

    expect(onChange).toHaveBeenCalledWith('');
  });
});
