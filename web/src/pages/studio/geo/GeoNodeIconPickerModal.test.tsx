import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoNodeIconPickerModal } from './GeoNodeIconPickerModal';
import * as studioAssetApi from '../../../services/studioAssetApi';
import type { StudioGeoEntityNode, StudioGeoPointVisualConfig } from '../../../services/studioGeoApi';

vi.mock('../../../services/studioAssetApi', () => ({
  listStudioAssets: vi.fn(),
  createStudioSvgAsset: vi.fn(),
}));

const stationNode: StudioGeoEntityNode = {
  id: 'stations',
  kind: 'ENTITY',
  parentNodeId: null,
  label: 'Estações',
  sortOrder: 10,
  active: true,
  defaultVisible: true,
  entity: {
    category: 'LOCAL',
    sourceDomain: 'location-model',
    sourceType: 'GEOGRAPHIC_SITE_SPECIFICATION',
    sourceId: 'CO',
  },
};

const pointConfig: StudioGeoPointVisualConfig = {
  geometryKind: 'POINT',
  iconCode: 'CO',
  scaleBands: {
    le5m: { visible: true, sizePx: 18 },
    le10m: { visible: true, sizePx: 18 },
    le20m: { visible: true, sizePx: 18 },
    le50m: { visible: true, sizePx: 18 },
    le100m: { visible: true, sizePx: 18 },
    le500m: { visible: true, sizePx: 18 },
    le1km: { visible: true, sizePx: 18 },
    gt1km: { visible: true, sizePx: 18 },
  },
};

describe('GeoNodeIconPickerModal', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(studioAssetApi.listStudioAssets).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('abre com Telecom selecionada por padrão e mostra as cinco abas de indústria', async () => {
    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={pointConfig}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(studioAssetApi.listStudioAssets).toHaveBeenCalled());

    const tabs = screen.getByRole('tablist', { name: /indústrias de ícones/i });
    expect(within(tabs).getByRole('tab', { name: 'Telecom' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    for (const label of ['Telecom', 'Data Center', 'Energia', 'Gás & Óleo', 'Logística']) {
      expect(within(tabs).getByRole('tab', { name: label })).toBeInTheDocument();
    }
  });

  it('ao abrir com um iconCode nativo salvo, seleciona automaticamente a indústria correspondente', async () => {
    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={{ ...pointConfig, iconCode: 'energy.substation' }}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(studioAssetApi.listStudioAssets).toHaveBeenCalled());

    const tabs = screen.getByRole('tablist', { name: /indústrias de ícones/i });
    expect(within(tabs).getByRole('tab', { name: 'Energia' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('troca de indústria ao clicar em outra aba', async () => {
    const user = userEvent.setup();
    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={pointConfig}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(studioAssetApi.listStudioAssets).toHaveBeenCalled());

    expect(screen.getByLabelText('Central Office')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Logística' }));

    expect(screen.queryByLabelText('Central Office')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Caminhão')).toBeInTheDocument();
  });

  it('filtra ícones nativos por tag na aba ativa', async () => {
    const user = userEvent.setup();
    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={pointConfig}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(studioAssetApi.listStudioAssets).toHaveBeenCalled());

    await user.type(screen.getByPlaceholderText('Buscar ícone ou asset...'), 'CDOI');

    expect(screen.getByLabelText('CDOI interna')).toBeInTheDocument();
    expect(screen.queryByLabelText('Central Office')).not.toBeInTheDocument();
  });

  it('renderiza a grade nativa com sete colunas e sem legenda abaixo dos ícones', async () => {
    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={pointConfig}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );
    await waitFor(() => expect(studioAssetApi.listStudioAssets).toHaveBeenCalled());

    const grid = screen.getByTestId('native-icon-grid');
    expect(grid.className).toContain('grid-cols-7');
    expect(grid.className).toContain('h-[216px]');

    const stationButton = screen.getByLabelText('Central Office');
    // Só a imagem do ícone, sem <span>/texto de legenda dentro do botão.
    expect(stationButton.querySelector('img')).toBeTruthy();
    expect(stationButton.textContent).toBe('');
  });

  it('seleciona um ícone nativo com um clique e confirma com duplo clique, limpando o asset', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={{ ...pointConfig, assetId: 'asset-1' }}
        onClose={onClose}
        onSelect={onSelect}
      />,
    );
    await waitFor(() => expect(studioAssetApi.listStudioAssets).toHaveBeenCalled());

    await user.dblClick(screen.getByLabelText('Ponto de Presença'));

    expect(onSelect).toHaveBeenCalledWith({ kind: 'system', iconCode: 'POP' });
    expect(onClose).toHaveBeenCalled();
  });

  it('preserva os SVGs personalizados existentes fora das abas nativas', async () => {
    vi.mocked(studioAssetApi.listStudioAssets).mockResolvedValue([
      {
        id: 'asset-1',
        name: 'Logo cliente',
        content: '<svg></svg>',
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      } as unknown as studioAssetApi.StudioAsset,
    ]);

    render(
      <GeoNodeIconPickerModal
        isOpen
        node={stationNode}
        pointConfig={pointConfig}
        onClose={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Logo cliente')).toBeInTheDocument());
  });
});
