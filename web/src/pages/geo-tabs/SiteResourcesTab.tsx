import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Trash2 } from 'lucide-react';
import { linkSiteResource, unlinkSiteResource } from '../../services/geoApi';
import { fetchTreeChildren, fetchTreeSearch, type GeoTreeNode } from '../../services/geoTreeApi';
import { ResourceIcon } from '../../components/ResourceIcon';
import { resourceIconFor, resourcePlant, plantLabel, type ResourcePlant } from '../../utils/resourceIcon';
import { Modal } from './Modal';

const SEARCH_DEBOUNCE_MS = 250;

export type SiteResourcesTabProps = {
  siteId: string;
  onOpenResource: (resourceId: string) => void;
};

type PendingRemoval = { node: GeoTreeNode };

/**
 * Aba Recursos do painel unificado de Local (REQ-MOD01-016): lista os recursos hospedados
 * no Site, agrupados por planta, com um campo de busca acima para vincular um recurso
 * existente (autocomplete sobre `/v1/geo/tree/search`) e uma lixeira no hover que pergunta
 * se é para só desvincular ou também excluir o recurso.
 */
export function SiteResourcesTab({ siteId, onOpenResource }: SiteResourcesTabProps) {
  const [nodes, setNodes] = useState<GeoTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState('');
  const [predictionsOpen, setPredictionsOpen] = useState(false);
  const [predictions, setPredictions] = useState<GeoTreeNode[]>([]);
  const [linking, setLinking] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);
  const [removing, setRemoving] = useState(false);
  const debounceRef = useRef<number | undefined>(undefined);
  const requestTokenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchTreeChildren(`site:${siteId}`, { scope: 'all' })
      .then((page) => {
        if (cancelled) return;
        setNodes(page.nodes.filter((node) => node.kind === 'resource'));
      })
      .catch(() => !cancelled && setNodes([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadToken]);

  useEffect(() => {
    if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    const term = query.trim();
    if (!term) {
      setPredictions([]);
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      const token = ++requestTokenRef.current;
      void fetchTreeSearch(term).then((results) => {
        if (requestTokenRef.current !== token) return;
        setPredictions(results.filter((node) => node.kind === 'resource'));
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current !== undefined) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  const linkResource = async (node: GeoTreeNode) => {
    if (!node.refId) return;
    setPredictionsOpen(false);
    setQuery('');
    setLinking(true);
    try {
      await linkSiteResource(siteId, node.refId);
      setReloadToken((token) => token + 1);
    } finally {
      setLinking(false);
    }
  };

  const removeResource = async (mode: 'unlink' | 'terminate') => {
    if (!pendingRemoval?.node.refId) return;
    setRemoving(true);
    try {
      await unlinkSiteResource(siteId, pendingRemoval.node.refId, mode);
      setPendingRemoval(null);
      setReloadToken((token) => token + 1);
    } finally {
      setRemoving(false);
    }
  };

  const groups = useMemo(() => {
    const byPlant = new Map<ResourcePlant, GeoTreeNode[]>();
    for (const resource of nodes) {
      const plant = resourcePlant(resource.resourceType ?? '');
      const list = byPlant.get(plant) ?? [];
      list.push(resource);
      byPlant.set(plant, list);
    }
    const order: ResourcePlant[] = ['outdoor', 'indoor', 'customer', 'logical'];
    return order
      .map((plant) => ({ plant, items: byPlant.get(plant) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [nodes]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-1.5">
        <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
          Adicionar recurso
        </label>
        <div className="relative">
          <div className="flex items-center gap-2 rounded-[12px] border border-app-border bg-white px-3">
            <Search className="h-3.5 w-3.5 shrink-0 text-app-muted" aria-hidden />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPredictionsOpen(true);
              }}
              onFocus={() => setPredictionsOpen(true)}
              placeholder="Buscar recurso pelo nome…"
              className="h-10 w-full bg-transparent text-[0.86rem] text-app-text outline-none placeholder:text-app-muted"
            />
            {linking ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-app-muted" /> : null}
          </div>
          {predictionsOpen && predictions.length > 0 ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setPredictionsOpen(false)} />
              <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-[12px] border border-app-border bg-white py-1 shadow-soft">
                {predictions.map((node) => {
                  const resourceLike = {
                    resourceType: node.resourceType ?? '',
                    status: node.status,
                    name: node.label,
                    sublabel: node.sublabel,
                  };
                  const icon = resourceIconFor(resourceLike);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => void linkResource(node)}
                      className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft"
                    >
                      <ResourceIcon resource={resourceLike} variant="badge" size={20} />
                      <span className="min-w-0 flex-1 truncate">{node.label}</span>
                      <span className="shrink-0 text-[0.7rem] text-app-muted">{icon.label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="px-2 py-3 text-[0.82rem] text-app-muted">Carregando recursos…</div>
      ) : !groups.length ? (
        <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
          Nenhum recurso registrado neste local.
        </div>
      ) : (
        <div className="grid gap-4">
          {groups.map(({ plant, items }) => (
            <section key={plant}>
              <h4 className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-app-muted">
                {plantLabel[plant]} · {items.length}
              </h4>
              <div className="grid gap-2">
                {items.map((resource) => {
                  const resourceLike = {
                    resourceType: resource.resourceType ?? '',
                    status: resource.status,
                    name: resource.label,
                    sublabel: resource.sublabel,
                  };
                  const icon = resourceIconFor(resourceLike);
                  return (
                    <div
                      key={resource.id}
                      className="group flex w-full min-w-0 items-start gap-2.5 rounded-[14px] border border-app-border px-3 py-2 transition hover:border-app-accent-border hover:bg-app-accent-soft"
                    >
                      <button
                        type="button"
                        onClick={() => (resource.refId ? onOpenResource(resource.refId) : undefined)}
                        className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                      >
                        <ResourceIcon resource={resourceLike} variant="badge" size={26} />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-[0.86rem] font-semibold leading-snug text-app-text [overflow-wrap:anywhere]">
                            {resource.label}
                          </span>
                          <span className="mt-0.5 block break-words text-[0.75rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
                            {[icon.label, resource.detail?.model, resource.detail?.serialNumber]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingRemoval({ node: resource })}
                        title="Remover recurso"
                        aria-label={`Remover recurso ${resource.label}`}
                        className="shrink-0 rounded-[8px] p-1.5 text-app-muted opacity-0 transition hover:bg-status-red-soft hover:text-status-red focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {pendingRemoval ? (
        <Modal onClose={() => setPendingRemoval(null)} title="Remover recurso" eyebrow="Local">
          <div className="grid gap-4">
            <p className="text-[0.9rem] leading-snug text-app-text">
              Remover <strong>{pendingRemoval.node.label}</strong> deste local: apenas desfazer o
              vínculo (o recurso continua existindo, sem local) ou excluir o recurso também?
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemoval(null)}
                className="geo-btn secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => void removeResource('unlink')}
                className="geo-btn secondary disabled:cursor-not-allowed disabled:opacity-60"
              >
                Só desvincular
              </button>
              <button
                type="button"
                disabled={removing}
                onClick={() => void removeResource('terminate')}
                className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Excluir recurso
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
