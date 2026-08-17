// Estado dos Projetos de trabalho da página Locais (REQ-MOD01-015). Carrega a lista uma vez
// ao montar e faz atualização otimista nas mutações — o servidor confirma em segundo plano.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createProject,
  deleteProject,
  fetchProjects,
  updateProject,
  type GeoProject,
  type GeoProjectSiteCascade,
} from '../services/geoProjectApi';

// Dedupe da carga inicial: o backend serializa requisições e o StrictMode monta o componente
// duas vezes (ver AGENTS.md §3 e useGeoDirectory/useGeoSearchHistory).
let inFlight: Promise<GeoProject[]> | null = null;

export type UseGeoProjectsResult = {
  projects: GeoProject[];
  loading: boolean;
  reload: () => Promise<void>;
  create: () => Promise<GeoProject>;
  update: (
    id: string,
    patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status'>>,
  ) => Promise<{ siteCascade?: GeoProjectSiteCascade }>;
  remove: (id: string) => Promise<void>;
  // Ajuste otimista do contador de locais (criar/remover local de dentro do painel do
  // projeto) — sem isto, `siteCount` só era carregado uma vez no mount e a lista de
  // Projetos mostrava um número desatualizado até um reload de página inteiro.
  adjustSiteCount: (id: string, delta: number) => void;
};

export function useGeoProjects(): UseGeoProjectsResult {
  const [projects, setProjects] = useState<GeoProject[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const reload = useCallback(async () => {
    if (!inFlight) inFlight = fetchProjects();
    try {
      const entries = await inFlight;
      if (mountedRef.current) setProjects(entries);
    } finally {
      inFlight = null;
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void reload();
    return () => {
      mountedRef.current = false;
    };
  }, [reload]);

  const create = useCallback(async () => {
    const project = await createProject();
    setProjects((current) => [project, ...current]);
    return project;
  }, []);

  const update = useCallback(
    async (
      id: string,
      patch: Partial<Pick<GeoProject, 'name' | 'description' | 'iconDataUrl' | 'status'>>,
    ) => {
      const { siteCascade, ...updated } = await updateProject(id, patch);
      setProjects((current) => current.map((item) => (item.id === id ? updated : item)));
      return { siteCascade };
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    setProjects((current) => current.filter((item) => item.id !== id));
    await deleteProject(id);
  }, []);

  const adjustSiteCount = useCallback((id: string, delta: number) => {
    setProjects((current) =>
      current.map((item) =>
        item.id === id ? { ...item, siteCount: Math.max(0, item.siteCount + delta) } : item,
      ),
    );
  }, []);

  return { projects, loading, reload, create, update, remove, adjustSiteCount };
}
