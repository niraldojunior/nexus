import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordStrengthField } from './PasswordStrengthField';
import { isPasswordValid } from '../utils/passwordPolicy';

afterEach(cleanup);

function Harness({ showGenerator = false }: { showGenerator?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <PasswordStrengthField
      label="Nova senha"
      value={value}
      onChange={setValue}
      showGenerator={showGenerator}
    />
  );
}

const item = (label: string) => screen.getByText(label).closest('li') as HTMLElement;

describe('PasswordStrengthField', () => {
  it('marca apenas minúscula ao digitar "abc"', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Nova senha'), 'abc');

    expect(item('Uma letra minúscula (a-z)')).toHaveTextContent('atendido');
    expect(item('Um número (0-9)')).toHaveTextContent('não atendido');
    expect(item('Pelo menos 12 caracteres')).toHaveTextContent('não atendido');
  });

  it('marca os cinco critérios com uma senha completa', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByLabelText('Nova senha'), 'Senha1234567!');

    for (const label of [
      'Pelo menos 12 caracteres',
      'Uma letra maiúscula (A-Z)',
      'Uma letra minúscula (a-z)',
      'Um número (0-9)',
      'Um símbolo (!@#$…)',
    ]) {
      expect(item(label)).toHaveTextContent('atendido');
      expect(item(label)).not.toHaveTextContent('não atendido');
    }
  });

  it('o gerador preenche uma senha válida e revela o campo', async () => {
    render(<Harness showGenerator />);
    const input = screen.getByLabelText('Nova senha') as HTMLInputElement;
    expect(input.type).toBe('password');

    await userEvent.click(screen.getByRole('button', { name: 'Gerar senha segura' }));

    expect(input.type).toBe('text');
    expect(isPasswordValid(input.value)).toBe(true);
  });

  it('alterna a visibilidade da senha pelo botão do olho', async () => {
    render(<Harness />);
    const input = screen.getByLabelText('Nova senha') as HTMLInputElement;
    expect(input.type).toBe('password');

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(input.type).toBe('text');

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(input.type).toBe('password');
  });
});
