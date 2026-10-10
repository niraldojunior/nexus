import { ChevronDown, ChevronRight, Globe, Loader2, MapPin, Minus, Plus } from 'lucide-react';
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

// Identidades visuais por especificação de Site — a mesma lista que a Modelagem de Locais exibe.
// Requisição única compartilhada (StrictMode/remontagens; o backend de dev atende em série).
type SpecPresentation = { category: string; identity?: VisualIdentity | null };
let identitiesRequest: Promise<Map<string, SpecPresentation>> | null = null;
const loadSpecIdentities = () => {
  identitiesRequest ??= listGeoSiteSpecifications()
    .then(
      (specs) =>
        new Map(
          specs.map((spec): [string, SpecPresentation] => [
            spec.id,
            { category: spec.category, identity: spec.visualIdentity },
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
};

/** Árvore de Locais: expandir (+/−) só abre o nível; apenas o clique no nome de um Site consulta a tabela. */
export function LocationTree({ onSelectSite, selectedSiteId }: Props) {
  const [directory, setDirectory] = useState<InternalPlantLocationRootNode[]>([]);
  const [rootsError, setRootsError] = useState<string | null>(null);
  const [rootsToken, setRootsToken] = useState(0);
  const [branches, setBranches] = useState<Record<string, Branch>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());

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
  }, [rootsToken]);

  const { roots, byParent } = useMemo(() => {
    const grouped = new Map<string, InternalPlantLocationNode[]>();
    const top: InternalPlantLocationNode[] = [];
    for (const node of directory) {
      if (node.parentId === null) top.push(node);
      else grouped.set(node.parentId, [...(grouped.get(node.parentId) ?? []), node]);
    }
    return { roots: top, byParent: grouped };
  }, [directory]);

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

  const renderNode = (node: InternalPlantLocationNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    const local = isDirectoryParent(node);
    const branch: Branch | undefined = local
      ? {
          nodes: byParent.get(node.id) ?? [],
          total: byParent.get(node.id)?.length ?? 0,
          loading: false,
        }
      : branches[node.id];
    const isSite = node.kind === 'site';
    const selected = isSite && node.refId === selectedSiteId;
    const childIndent = { paddingLeft: 22 + depth * 14 };
    return (
      <li key={node.id} role="none">
        <div
          role="treeitem"
          aria-expanded={node.hasChildren ? isOpen : undefined}
          aria-selected={selected}
          className={`flex items-center gap-1 rounded-lg py-[3px] pr-2 text-[0.8rem] text-app-text ${
            isSite ? '' : 'font-semibold'
          } ${selected ? 'bg-app-accent-soft' : 'hover:bg-app-hover'}`}
          style={{ paddingLeft: depth * 14 }}
        >
          {node.hasChildren ? (
            <button
              type="button"
              aria-label={`${isOpen ? 'Recolher' : 'Expandir'} ${node.label}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center text-app-muted"
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
              else if (node.hasChildren) toggle(node);
            }}
          >
            {node.label}
            {node.kind === 'site-type' && node.childCount !== undefined
              ? ` (${countFormat.format(node.childCount)})`
              : null}
            {node.sublabel ? <span className="ml-2 text-app-muted">{node.sublabel}</span> : null}
          </button>
        </div>
        {isOpen && branch ? (
          <ul role="group">
            {branch.nodes.map((child) => renderNode(child, depth + 1))}
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

  return (
    <ul role="tree" aria-label="Locais" className="px-3 py-2">
      {roots.map((node) => renderNode(node, 0))}
    </ul>
  );
}
