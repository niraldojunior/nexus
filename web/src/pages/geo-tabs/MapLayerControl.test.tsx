import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MapLayerControl } from './MapLayerControl';
import { ALL_MAP_LAYERS_VISIBLE, MAP_LAYER_CATALOG_FALLBACK } from '../../utils/mapLayers';
import type { StudioGeoCatalog, StudioGeoPointVisualConfig } from '../../services/studioGeoApi';

// Faixas todas visíveis, exceto a de 50 m — usado para simular uma publicação do Studio GEO
// que oculta uma entidade numa escala específica, genericamente (qualquer entidade, não só Poste).
const pointConfigHiddenAt50m: StudioGeoPointVisualConfig = {
  geometryKind: 'POINT',
  iconCode: 'legacy.pole',
  scaleBands: {
    le5m: { visible: true, sizePx: 18 },
    le10m: { visible: true, sizePx: 18 },
    le20m: { visible: true, sizePx: 18 },
    le50m: { visible: false, sizePx: 18 },
    le100m: { visible: true, sizePx: 18 },
    le500m: { visible: true, sizePx: 18 },
    le1km: { visible: true, sizePx: 18 },
    gt1km: { visible: true, sizePx: 18 },
  },
};

// Catálogo publicado com a restrição de escala aplicada só a `netwinPole`, para provar que o
// switch de OUTRA entidade (netwinManhole) nunca é afetado — nenhum hardcode por layerId.
const catalogWithPoleHiddenAt50m: StudioGeoCatalog = {
  ...MAP_LAYER_CATALOG_FALLBACK,
  fallback: false,
  nodes: MAP_LAYER_CATALOG_FALLBACK.nodes.map((node) =>
    node.id === 'netwinPole' && node.kind === 'ENTITY'
      ? { ...node, visualConfig: pointConfigHiddenAt50m }
      : node,
  ),
};

beforeEach(() => {
  window.localStorage.clear();
});

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

  it('mantém a janela aberta ao interagir com elementos externos (persistente)', async () => {
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
    // Permanece aberto, pois o painel é persistente e só fecha pelo botão X
    expect(screen.getByRole('dialog', { name: 'Camadas do mapa' })).toBeInTheDocument();
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
    await user.click(screen.getByRole('switch', { name: 'Cabo Drop' }));
    expect(onToggleLayer).toHaveBeenCalledWith('resourceDropCable');
  });

  it('expõe e alterna os tipos de infraestrutura civil individualmente', async () => {
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
    await user.click(screen.getByRole('switch', { name: 'Dutos' }));
    expect(onToggleLayer).toHaveBeenCalledWith('netwinDuct');
    expect(screen.getByRole('switch', { name: 'Caixas Subterrâneas' })).toBeInTheDocument();
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
      screen.queryByRole('switch', { name: 'Alternar grupo Cobertura' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'Cobertura GPON' }));
    expect(onToggleLayer).toHaveBeenCalledWith('coverage-gpon');
  });

  it('inibe o switch de uma entidade quando o Studio publica a faixa de escala atual como oculta, sem mexer em outras', async () => {
    const user = userEvent.setup();
    const onToggleLayer = vi.fn();
    render(
      <MapLayerControl
        catalog={catalogWithPoleHiddenAt50m}
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={onToggleLayer}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
        scaleMeters={50}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    const poleSwitch = screen.getByRole('switch', { name: 'Postes' });
    expect(poleSwitch).toBeDisabled();
    await user.click(poleSwitch);
    expect(onToggleLayer).not.toHaveBeenCalledWith('netwinPole');
    expect(screen.getByRole('switch', { name: 'Caixas Subterrâneas' })).toBeEnabled();
  });

  it('libera o switch fora da faixa de escala marcada oculta no Studio', async () => {
    const user = userEvent.setup();
    render(
      <MapLayerControl
        catalog={catalogWithPoleHiddenAt50m}
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
        scaleMeters={20}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(screen.getByRole('switch', { name: 'Postes' })).toBeEnabled();
  });

  it('sem catálogo publicado (fallback, sem visualConfig), nenhum switch é inibido por escala', async () => {
    const user = userEvent.setup();
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
        scaleMeters={50}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Camadas do mapa' }));
    expect(screen.getByRole('switch', { name: 'Postes' })).toBeEnabled();
  });

  it('mostra o indicador de "filtrado" e o botão Restaurar padrão quando allVisible é falso', async () => {
    const user = userEvent.setup();
    const visibility = { ...ALL_MAP_LAYERS_VISIBLE, resourceDropCable: false };
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

  it('inicia aberto se estava aberto no localStorage', () => {
    window.localStorage.setItem('nexus.geo.mapLayerControl.open', 'true');
    render(
      <MapLayerControl
        layers={ALL_MAP_LAYERS_VISIBLE}
        onToggleLayer={vi.fn()}
        onToggleGroup={vi.fn()}
        onReset={vi.fn()}
        allVisible
      />,
    );
    expect(screen.getByRole('dialog', { name: 'Camadas do mapa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Camadas do mapa' })).not.toBeInTheDocument();
  });

  it('persiste quando um grupo é recolhido e reaberto', async () => {
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
    expect(screen.getByRole('switch', { name: 'Estações' })).toBeInTheDocument();

    // Clica para recolher o grupo Locais
    await user.click(screen.getByRole('button', { name: 'Recolher Locais' }));
    expect(screen.queryByRole('switch', { name: 'Estações' })).not.toBeInTheDocument();

    const storedGroups = JSON.parse(
      window.localStorage.getItem('nexus.geo.mapLayerControl.expandedGroups') ?? '[]',
    );
    expect(storedGroups).not.toContain('locations');
  });
});
