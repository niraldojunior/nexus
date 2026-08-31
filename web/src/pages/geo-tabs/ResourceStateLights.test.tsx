import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ResourceStateLights } from './ResourceStateLights';

afterEach(cleanup);

describe('ResourceStateLights', () => {
  it('renderiza os três faróis SID com valores traduzidos e acessíveis', () => {
    render(
      <ResourceStateLights
        administrativeState="unlocked"
        operationalState="enabled"
        usageState="idle"
      />,
    );

    const group = screen.getByLabelText('Estados SID/X.731');
    expect(group).toBeInTheDocument();
    expect(screen.getByTitle('Estado administrativo: Desbloqueado')).toBeInTheDocument();
    expect(screen.getByTitle('Estado operacional: Habilitado')).toBeInTheDocument();
    expect(screen.getByTitle('Estado de uso: Ocioso')).toBeInTheDocument();
  });

  it('usa fallback seguro para estados desconhecidos ou vazios', () => {
    render(<ResourceStateLights />);
    expect(screen.getByTitle('Estado administrativo: Desconhecido')).toBeInTheDocument();
    expect(screen.getByTitle('Estado operacional: Desconhecido')).toBeInTheDocument();
    expect(screen.getByTitle('Estado de uso: Desconhecido')).toBeInTheDocument();
  });

  it('farol de uso é cinza quando ocioso e verde quando em uso', () => {
    const { rerender } = render(<ResourceStateLights usageState="idle" />);
    expect(screen.getByTitle('Estado de uso: Ocioso').className).toContain('bg-app-muted');

    rerender(<ResourceStateLights usageState="active" />);
    expect(screen.getByTitle('Estado de uso: Em Uso').className).toContain('bg-status-green');
  });

  it('destaca drop desativado com branco e borda verde', () => {
    render(<ResourceStateLights usageState="idle" dropDisabled />);
    const light = screen.getByTitle('Estado de uso: Drop desativado');
    expect(light).toBeInTheDocument();
    expect(light.className).toContain('bg-white');
    expect(light.className).toContain('ring-status-green');
  });
});
