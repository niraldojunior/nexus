import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapLayerControl } from './MapLayerControl';
import { ALL_MAP_LAYERS_VISIBLE } from '../../utils/mapLayers';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MapLayerControl', () => {
  it('abre a lista ao clicar no botão e fecha ao clicar em Fechar', async () => {
    const user = userEvent.setup();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Camadas do mapa' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(screen.getByRole('dialog', { name: 'Camadas do mapa' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Fechar camadas do mapa' }));
    expect(screen.queryByRole('dialog', { name: 'Camadas do mapa' })).not.toBeInTheDocument();
  });

  it('fecha com Escape', async () => {
    const user = userEvent.setup();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(screen.getByRole('dialog', { name: 'Camadas do mapa' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Camadas do mapa' })).not.toBeInTheDocument();
  });

  it('fecha ao clicar fora', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <div data-testid="outside">fora</div>
        <MapLayerControl
          layers={ALL_MAP_LAYERS_VISIBLE}
          onToggleLayer={vi.fn()}
          onToggleGroup={vi.fn()}
          onReset={vi.fn()}
          allVisible
        />
      </div>,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(screen.getByRole('dialog', { name: 'Camadas do mapa' })).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('dialog', { name: 'Camadas do mapa' })).not.toBeInTheDocument();
  });

  it('emite o id da camada certa ao clicar em um switch de sub-camada', async () => {
    const user = userEvent.setup();
    const onToggleLayer = vi.fn();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={onToggleLayer}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    await user.click(screen.getByRole('switch', { name: 'Cabos e dutos' }));
    expect(onToggleLayer).toHaveBeenCalledWith('resourceLines');
  });

  it('expõe e alterna os tipos importados do Netwin individualmente', async () => {
    const user = userEvent.setup();
    const onToggleLayer = vi.fn();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={onToggleLayer}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    await user.click(screen.getByRole('switch', { name: 'Tubos de subida' }));
    expect(onToggleLayer).toHaveBeenCalledWith('netwinRisingTube');
    expect(screen.getByRole('switch', { name: 'Caixas subterrâneas' })).toBeInTheDocument();
  });

  it('emite o id do grupo ao clicar no switch de um grupo com sub-camadas', async () => {
    const user = userEvent.setup();
    const onToggleGroup = vi.fn();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={onToggleGroup}
        onReset={vi.fn()}
        allVisible
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    await user.click(screen.getByRole('switch', { name: 'Alternar grupo Recursos de Rede' }));
    expect(onToggleGroup).toHaveBeenCalledWith('resources');
  });

  it('grupo Cobertura (sem sub-camadas) expõe um switch único que chama onToggleLayer', async () => {
    const user = userEvent.setup();
    const onToggleLayer = vi.fn();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={onToggleLayer}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(
      screen.queryByRole('switch', { name: 'Alternar grupo Cobertura GPON' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Cobertura GPON' }));
    expect(onToggleLayer).toHaveBeenCalledWith('coverage');
  });

  it('mostra o indicador de "filtrado" e o botão Restaurar padrão quando allVisible é falso', async () => {
    const user = userEvent.setup();
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceLines: false };
    const onReset = vi.fn();
    render(
      <MapLayerControl
        layers={visibility}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={onReset}
        allVisible={false}
      />,
    );
    expect(screen.getByTitle('Uma ou mais camadas estão desligadas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    await user.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect(onReset).toHaveBeenCalledOnce();
  });

  it('não mostra indicador nem botão de restaurar quando tudo está visível', async () => {
    const user = userEvent.setup();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );
    expect(screen.queryByTitle('Uma ou mais camadas estão desligadas')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(screen.queryByRole('button', { name: 'Restaurar padrão' })).not.toBeInTheDocument();
  });
});
