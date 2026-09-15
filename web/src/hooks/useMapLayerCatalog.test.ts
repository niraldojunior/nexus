import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMapLayerCatalog } from './useMapLayerCatalog';
import * as studioGeoApi from '../services/studioGeoApi';

describe('useMapLayerCatalog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('nasce em loading com environmentId "pending" e resolve para o catálogo publicado', async () => {
    const published: studioGeoApi.StudioGeoCatalog = {
      schemaVersion: 2,
      nodes: [],
      configured: true,
      environmentId: 'env-real',
      fallback: false,
    };
    vi.spyOn(studioGeoApi, 'getPublishedMapLayerCatalog').mockResolvedValue(published);

    const { result } = renderHook(() => useMapLayerCatalog());
    expect(result.current.loading).toBe(true);
    expect(result.current.catalog.environmentId).toBe('pending');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog.environmentId).toBe('env-real');
    expect(result.current.error).toBeNull();
  });

  // Regressão: antes desta correção, uma falha na busca do catálogo (rede, backend fora do ar,
  // 5xx sob a fila serial do backend de dev — AGENTS.md §3) deixava `loading=false` com
  // `catalog.environmentId` ainda `'pending'` — uma sentinela de "carregando" vazando como se
  // fosse um ambiente resolvido de verdade. GeoPage passaria isso adiante para useGeoViewState,
  // que gravaria/leria a posição do mapa sob a chave `nexus.geo.viewState::pending`, diferente
  // da chave do ambiente real usada em qualquer sessão bem-sucedida — a posição salva "sumia"
  // mesmo com a URL intacta. Ver useMapLayerCatalog.ts FAILED_CATALOG_ENVIRONMENT_ID.
  it('em falha, sai de loading com environmentId "legacy" (nunca deixa "pending" vazar como resolvido)', async () => {
    vi.spyOn(studioGeoApi, 'getPublishedMapLayerCatalog').mockRejectedValue(
      new Error('Falha ao carregar camadas (500)'),
    );

    const { result } = renderHook(() => useMapLayerCatalog());
    expect(result.current.catalog.environmentId).toBe('pending');

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.catalog.environmentId).toBe('legacy');
    expect(result.current.catalog.environmentId).not.toBe('pending');
    expect(result.current.error).toBe('Falha ao carregar camadas (500)');
  });
});
