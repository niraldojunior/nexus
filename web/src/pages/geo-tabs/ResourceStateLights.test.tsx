import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceStateLights } from './ResourceStateLights';

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
});
