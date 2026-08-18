import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGeoProjects } from './useGeoProjects';
import type { GeoProject } from '../services/geoProjectApi';

const project = (overrides: Partial<GeoProject> = {}): GeoProject => ({
  id: 'prj-1',
  tenantId: 'default',
  name: 'Expansão Icaraí',
  description: null,
  iconDataUrl: null,
  status: 'planned',
  createdBy: null,
  siteCount: 1,
  createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-08-01T00:00:00Z',
  ...overrides,
});

const mocks = vi.hoisted(() => ({
  fetchProjects: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('../services/geoProjectApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/geoProjectApi')>();
  return { ...actual, fetchProjects: mocks.fetchProjects, deleteProject: mocks.deleteProject };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  mocks.fetchProjects.mockReset();
  mocks.deleteProject.mockReset();
});

describe('useGeoProjects', () => {
  it('adjustSiteCount atualiza o contador de um projeto sem esperar reload do servidor', async () => {
    mocks.fetchProjects.mockResolvedValue([project({ siteCount: 1 })]);
    const { result } = renderHook(() => useGeoProjects());

    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    act(() => result.current.adjustSiteCount('prj-1', 1));
    expect(result.current.projects[0]?.siteCount).toBe(2);

    act(() => result.current.adjustSiteCount('prj-1', -1));
    expect(result.current.projects[0]?.siteCount).toBe(1);
  });

  it('adjustSiteCount nunca deixa o contador negativo', async () => {
    mocks.fetchProjects.mockResolvedValue([project({ siteCount: 0 })]);
    const { result } = renderHook(() => useGeoProjects());

    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    act(() => result.current.adjustSiteCount('prj-1', -1));
    expect(result.current.projects[0]?.siteCount).toBe(0);
  });

  it('remove() tira o projeto da lista só depois que o servidor confirma deleted:true', async () => {
    mocks.fetchProjects.mockResolvedValue([project()]);
    mocks.deleteProject.mockResolvedValue({ deleted: true, retired: 1, skipped: 0, blocked: 0 });
    const { result } = renderHook(() => useGeoProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    await act(async () => {
      await result.current.remove('prj-1');
    });

    expect(result.current.projects).toHaveLength(0);
  });

  it('remove() mantém o projeto na lista quando o servidor recusa (local bloqueado, issue #58)', async () => {
    mocks.fetchProjects.mockResolvedValue([project()]);
    mocks.deleteProject.mockResolvedValue({ deleted: false, retired: 0, skipped: 0, blocked: 1 });
    const { result } = renderHook(() => useGeoProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    const summary = await act(async () => await result.current.remove('prj-1'));

    expect(summary.deleted).toBe(false);
    expect(result.current.projects).toHaveLength(1);
  });

  it('remove() propaga erro do servidor em vez de engolir a rejeição', async () => {
    mocks.fetchProjects.mockResolvedValue([project()]);
    mocks.deleteProject.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useGeoProjects());
    await waitFor(() => expect(result.current.projects).toHaveLength(1));

    await expect(result.current.remove('prj-1')).rejects.toThrow('network');
    expect(result.current.projects).toHaveLength(1);
  });
});
