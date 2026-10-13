import {
  ChevronDown,
  ChevronRight,
  Globe,
  Loader2,
  MapPin,
  Minus,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { locationCategoryIcon } from '../studio/location-model/locationCategoryPresentation';
import { listGeoSiteSpecifications } from '../../services/geoApi';
import type { VisualIdentity } from '../../services/studioGeoApi';
import { useVisualIdentityPreviewUrl } from '../../hooks/useVisualIdentityPreviewUrl';
import {
  fetchInternalPlantChildren,
  fetchInternalPlantRoots,
  type InternalPlantLocationNode,
  type InternalPlantLocationRootNode,
} from '../../services/internalPlantApi';

const PAGE = 50;

const countFormat = new Intl.NumberFormat('pt-BR');

// Diretório Brasil/UF/município vem completo e é carregado uma única vez; StrictMode e remontagens
// compartilham a mesma requisição em voo (o backend de dev atende em série).
let rootsRequest: Promise<InternalPlantLocationRootNode[]> | null = null;
const loadRootsOnce = () => {
  rootsRequest ??= fetchInternalPlantRoots().catch((error: unknown) => {
    rootsRequest = null;
    throw error;
  });
  return rootsRequest;
};

/** Descarta o diretório em cache; a próxima montagem/refresh busca de novo. */
export const invalidateInternalPlantRoots = () => {
  rootsRequest = null;
};

// Identidades visuais por especificação de Site — a mesma lista que a Modelagem de Locais exibe.
// Requisição única compartilhada (StrictMode/remontagens; o backend de dev atende em série).
type SpecPresentation = { name: string; category: string; identity?: VisualIdentity | null };
let identitiesRequest: Promise<Map<string, SpecPresentation>> | null = null;
const loadSpecIdentities = () => {
  identitiesRequest ??= listGeoSiteSpecifications()
    .then(
      (specs) =>
        new Map(
          specs.map((spec): [string, SpecPresentation] => [
            spec.id,
            { name: spec.name, category: spec.category, identity: spec.visualIdentity },
          ]),
        ),
    )
    .catch(() => {
      identitiesRequest = null;
      return new Map<string, SpecPresentation>();
    });
  return identitiesRequest;
};

/** Ícone configurado na Modelagem de Locais para o tipo de Site; sem identidade, glifo genérico. */
function SiteSpecIcon({ node }: { node: InternalPlantLocationNode }) {
  const [identities, setIdentities] = useState<Map<string, SpecPresentation>>();
  useEffect(() => {
    let active = true;
    void loadSpecIdentities().then((map) => active && setIdentities(map));
    return () => {
      active = false;
    };
  }, []);
  const specId = node.kind === 'site-type' ? node.refId : node.siteSpecificationId;
  const presentation = specId ? identities?.get(specId) : undefined;
  const url = useVisualIdentityPreviewUrl(presentation?.identity ?? node.visualIdentity, 16, {
    shape: 'none',
    color: '#0284c7',
  });
  if (url) return <img src={url} alt="" className="h-4 w-4 shrink-0" aria-hidden="true" />;
  // Mesmo fallback do Studio: glifo da categoria da especificação (Região/Externo/Interno).
  const CategoryIcon = locationCategoryIcon(presentation?.category ?? '');
  return <CategoryIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />;
}

/** Países e UFs expandem localmente; do município em diante a árvore é lazy no servidor. */
const isDirectoryParent = (node: InternalPlantLocationNode) =>
  node.kind === 'country' || node.kind === 'uf';

type Branch = {
  nodes: InternalPlantLocationNode[];
  total: number;
  loading: boolean;
  error?: string;
};

type Props = {
  onSelectSite: (node: InternalPlantLocationNode) => void;
  selectedSiteId?: string | undefined;
  canEdit?: boolean;
  /** Município selecionado (id administrativo) e callback de seleção; `undefined` limpa. */
  selectedCityId?: string | undefined;
  onSelectCity?: (administrativeCityId: string | undefined) => void;
  onEditSite?: (node: InternalPlantLocationNode) => void;
  onRemoveSite?: (node: InternalPlantLocationNode) => void;
  /** Incrementar após mutações (depois de `invalidateInternalPlantRoots`) para recarregar a árvore. */
  refreshToken?: number;
  /** Filtro rápido por município/UF (só diretório; não consulta Sites). */
  query?: string;
};

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

/** Árvore de Locais: expandir (+/−) só abre o nível; apenas o clique no nome de um Site consulta a tabela. */
export function LocationTree({
  onSelectSite,
  selectedSiteId,
  canEdit = false,
  selectedCityId,
  onSelectCity,
  onEditSite,
  onRemoveSite,
  refreshToken = 0,
  query = '',
}: Props) {
  const [directory, setDirectory] = useState<InternalPlantLocationRootNode[]>([]);
  const [rootsError, setRootsError] = useState<string | null>(null);
  const [rootsToken, setRootsToken] = useState(0);
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());
  const [specNames, setSpecNames] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let active = true;
    void loadSpecIdentities().then((map) => {
      if (active) setSpecNames(new Map([...map].map(([id, spec]) => [id, spec.name])));
    });
    return () => {
      active = false;
    };
  }, []);

  const loadBranch = useCallback(async (nodeId: string, offset: number) => {
    const key = `${nodeId}@${offset}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBranches((current) => ({
      ...current,
      [nodeId]: {
        nodes: current[nodeId]?.nodes ?? [],
        total: current[nodeId]?.total ?? 0,
        loading: true,
      },
    }));
    try {
      const page = await fetchInternalPlantChildren(nodeId, { limit: PAGE, offset });
      setBranches((current) => ({
        ...current,
        [nodeId]: {
          nodes: offset === 0 ? page.nodes : [...(current[nodeId]?.nodes ?? []), ...page.nodes],
          total: page.total,
          loading: false,
        },
      }));
    } catch (error) {
      setBranches((current) => ({
        ...current,
        [nodeId]: {
          nodes: current[nodeId]?.nodes ?? [],
          total: current[nodeId]?.total ?? 0,
          loading: false,
          error: error instanceof Error ? error.message : 'Falha ao carregar.',
        },
      }));
    } finally {
      inFlight.current.delete(key);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setRootsError(null);
    loadRootsOnce()
      .then((nodes) => {
        if (!active) return;
        setDirectory(nodes);
        // Abre o país por padrão para já exibir as UFs; não sobrescreve expansões do usuário.
        setExpanded((current) =>
          current.size > 0
            ? current
            : new Set(nodes.filter((node) => node.parentId === null).map((node) => node.id)),
        );
      })
      .catch((error: unknown) => {
        if (active) setRootsError(error instanceof Error ? error.message : 'Falha ao carregar.');
      });
    return () => {
      active = false;
    };
  }, [rootsToken, refreshToken]);

  // Após mutações os ramos lazy ficam obsoletos: descarta e recarrega os que estão abertos.
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;
  const firstRefresh = useRef(true);
  useEffect(() => {
    if (firstRefresh.current) {
      firstRefresh.current = false;
      return;
    }
    setBranches({});
    for (const id of expandedRef.current) {
      if (!id.startsWith('country:') && !id.startsWith('uf:') && id !== 'city:none')
        void loadBranch(id, 0);
    }
  }, [refreshToken, loadBranch]);

  const tokens = useMemo(
    () =>
      normalize(query)
        .split(/[\s,/-]+/)
        .filter(Boolean),
    [query],
  );
  const filtering = tokens.length > 0;

  const visibleDirectory = useMemo(() => {
    if (!filtering) return directory;
    const keepCities = directory.filter((node) => {
      if (node.kind !== 'city' || node.id === 'city:none') return false;
      const haystack = normalize(`${node.label} ${node.sublabel ?? ''}`);
      return tokens.every((token) => haystack.includes(token));
    });
    const keep = new Set<string>();
    for (const city of keepCities) {
      keep.add(city.id);
      if (city.parentId) keep.add(city.parentId);
    }
    for (const node of directory) {
      if (node.kind === 'uf' && keep.has(node.id) && node.parentId) keep.add(node.parentId);
    }
    return directory.filter((node) => keep.has(node.id));
  }, [directory, filtering, tokens]);

  const { roots, byParent } = useMemo(() => {
    const grouped = new Map<string, InternalPlantLocationNode[]>();
    const top: InternalPlantLocationNode[] = [];
    for (const node of visibleDirectory) {
      if (node.parentId === null) top.push(node);
      else grouped.set(node.parentId, [...(grouped.get(node.parentId) ?? []), node]);
    }
    return { roots: top, byParent: grouped };
  }, [visibleDirectory]);

  const toggle = (node: InternalPlantLocationNode) => {
    const next = new Set(expanded);
    if (next.has(node.id)) {
      next.delete(node.id);
    } else {
      next.add(node.id);
      if (!isDirectoryParent(node) && !branches[node.id]) void loadBranch(node.id, 0);
    }
    setExpanded(next);
  };

  const renderNode = (node: InternalPlantLocationNode, depth: number, parentIsSite = false) => {
    const isOpen =
      expanded.has(node.id) || (filtering && (node.kind === 'country' || node.kind === 'uf'));
    const local = isDirectoryParent(node);
    const branch: Branch | undefined = local
      ? {
          nodes: byParent.get(node.id) ?? [],
          total: byParent.get(node.id)?.length ?? 0,
          loading: false,
        }
      : branches[node.id];
    const isSite = node.kind === 'site';
    const isCity = node.kind === 'city' && node.id !== 'city:none';
    const selected =
      (isSite && node.refId === selectedSiteId) || (isCity && node.id === `city:${selectedCityId}`);
    const childIndent = { paddingLeft: 22 + depth * 14 };
    return (
      <li key={node.id} role="none">
        <div
          role="treeitem"
          aria-expanded={node.hasChildren ? isOpen : undefined}
          aria-selected={selected}
          className={`group/row flex items-center gap-1 rounded-lg py-[3px] pr-2 text-[0.8rem] text-app-text ${
            isSite ? '' : 'font-semibold'
          } ${selected ? 'bg-app-accent-soft' : 'hover:bg-app-hover'}`}
          style={{ paddingLeft: depth * 14 }}
        >
          {node.hasChildren ? (
            <button
              type="button"
              aria-label={`${isOpen ? 'Recolher' : 'Expandir'} ${node.label}`}
              className="relative flex h-5 w-5 shrink-0 items-center justify-center text-app-muted before:absolute before:-inset-0.5 before:content-['']"
              onClick={() => toggle(node)}
            >
              {isSite ? (
                isOpen ? (
                  <Minus size={14} />
                ) : (
                  <Plus size={14} />
                )
              ) : isOpen ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          {node.kind === 'site-type' || node.kind === 'site' ? (
            <SiteSpecIcon node={node} />
          ) : node.kind === 'country' ? (
            <Globe size={15} className="shrink-0 text-app-muted" />
          ) : (
            <MapPin size={15} className="shrink-0 text-app-muted" />
          )}
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left"
            onClick={() => {
              if (isSite) onSelectSite(node);
              else if (isCity) {
                onSelectCity?.(node.id.slice('city:'.length));
                if (!isOpen && node.hasChildren) toggle(node);
              } else if (node.hasChildren) toggle(node);
            }}
          >
            {parentIsSite &&
            isSite &&
            node.siteSpecificationId &&
            specNames.get(node.siteSpecificationId)
              ? `[${specNames.get(node.siteSpecificationId)}] `
              : null}
            {node.label}
            {node.kind === 'site-type' && node.childCount !== undefined
              ? ` (${countFormat.format(node.childCount)})`
              : null}
            {node.sublabel ? <span className="ml-2 text-app-muted">{node.sublabel}</span> : null}
          </button>
          {canEdit && isSite ? (
            <span className="flex shrink-0 items-center gap-0.5 opacity-0 focus-within:opacity-100 group-hover/row:opacity-100">
              <button
                type="button"
                aria-label={`Editar ${node.label}`}
                className="flex h-5 w-5 items-center justify-center rounded text-app-muted hover:text-app-text"
                onClick={() => onEditSite?.(node)}
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                aria-label={`Remover ${node.label}`}
                className="flex h-5 w-5 items-center justify-center rounded text-app-muted hover:text-status-red"
                onClick={() => onRemoveSite?.(node)}
              >
                <Trash2 size={13} />
              </button>
            </span>
          ) : null}
        </div>
        {isOpen && branch ? (
          <ul role="group">
            {branch.nodes.map((child) => renderNode(child, depth + 1, isSite))}
            {branch.loading ? (
              <li className="py-1.5 text-app-muted" style={childIndent}>
                <Loader2 size={14} className="animate-spin" aria-label="Carregando" />
              </li>
            ) : null}
            {branch.error ? (
              <li className="py-1.5 text-[0.85rem] text-app-muted" style={childIndent}>
                {branch.error}{' '}
                <button
                  type="button"
                  className="underline"
                  onClick={() => void loadBranch(node.id, branch.nodes.length)}
                >
                  Tentar novamente
                </button>
              </li>
            ) : null}
            {!branch.loading && !branch.error && branch.nodes.length < branch.total ? (
              <li style={childIndent}>
                <button
                  type="button"
                  className="py-1.5 text-[0.85rem] text-app-accent underline"
                  onClick={() => void loadBranch(node.id, branch.nodes.length)}
                >
                  Carregar mais
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </li>
    );
  };

  if (rootsError) {
    return (
      <p className="px-3 py-2 text-[0.85rem] text-app-muted">
        {rootsError}{' '}
        <button type="button" className="underline" onClick={() => setRootsToken((n) => n + 1)}>
          Tentar novamente
        </button>
      </p>
    );
  }

  if (filtering && roots.length === 0) {
    return <p className="px-3 py-2 text-[0.85rem] text-app-muted">Nenhum município encontrado.</p>;
  }

  return (
    <ul role="tree" aria-label="Locais" className="px-3 pb-2 pt-1">
      {roots.map((node) => renderNode(node, 0))}
    </ul>
  );
}
