import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { patchJson, postJson, type GeoSpec } from '../../services/geoApi';
import { fetchTreeChildren, type GeoTreeNode } from '../../services/geoTreeApi';
import { siteSpecLabel } from '../../utils/geoLabels';
import { NodeIcon } from './HierarchyTreeView';
import { Modal } from './Modal';

export type SiteSubSitesTabProps = {
  siteId: string;
  siteSpecificationId: string;
  specs: GeoSpec[];
  specById: Map<string, GeoSpec>;
  onOpenSubSite: (siteId: string) => void;
  onChanged: () => void;
};

// Specs de categoria SubSite que a spec do pai aceita como filho — a mesma checagem de
// contenção que o backend faz em validateContainment, só para não oferecer no combo um
// tipo que o PATCH recusaria de qualquer forma.
const allowedChildSpecsOf = (parentSpec: GeoSpec | undefined, specs: GeoSpec[]): GeoSpec[] =>
  !parentSpec
    ? []
    : specs.filter(
        (spec) =>
          spec.category === 'SubSite' &&
          parentSpec.allowedChildSpecIds.includes(spec.id) &&
          spec.allowedParentSpecIds.includes(parentSpec.id),
      );

type CreateTarget = { parentId: string; parentLabel: string; parentSpecificationId: string };
type PendingDelete = { id: string; label: string };

/**
 * Árvore de sub-locais (sala/andar/gaveta…) do Site aberto no painel unificado
 * (REQ-MOD01-016). Carrega um nível por vez, como a Hierarquia — cada ramo busca os
 * próprios filhos só quando expandido.
 */
export function SiteSubSitesTab({
  siteId,
  siteSpecificationId,
  specs,
  specById,
  onOpenSubSite,
  onChanged,
}: SiteSubSitesTabProps) {
  const [rootNodes, setRootNodes] = useState<GeoTreeNode[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [createTarget, setCreateTarget] = useState<CreateTarget | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchTreeChildren(`site:${siteId}`, { scope: 'all' })
      .then((page) => {
        if (cancelled) return;
        setRootNodes(page.nodes.filter((node) => node.kind === 'site'));
      })
      .catch(() => !cancelled && setRootNodes([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [siteId, reloadToken]);

  const refresh = () => {
    setReloadToken((token) => token + 1);
    onChanged();
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    await patchJson(`/v1/geo/sites/${pendingDelete.id}`, {
      status: 'Retired',
      statusReason: 'Sub-local excluído pelo painel de Local',
    });
    setPendingDelete(null);
    refresh();
  };

  const rootAllowedSpecs = allowedChildSpecsOf(specById.get(siteSpecificationId), specs);

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 break-words text-[0.82rem] leading-snug text-app-muted [overflow-wrap:anywhere]">
          Espaços internos do site (sala, andar, gaveta, etc)
        </div>
        <button
          type="button"
          className="geo-btn primary shrink-0"
          onClick={() =>
            setCreateTarget({
              parentId: siteId,
              parentLabel: 'este local',
              parentSpecificationId: siteSpecificationId,
            })
          }
          disabled={rootAllowedSpecs.length === 0}
          aria-label="Adicionar sub-local"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="px-2 py-3 text-[0.82rem] text-app-muted">Carregando sub-locais…</div>
      ) : !rootNodes || rootNodes.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
          Este local ainda não possui sub-locais.
        </div>
      ) : (
        <div className="grid gap-0.5">
          {rootNodes.map((node) => (
            <SubSiteBranch
              key={node.id}
              node={node}
              depth={0}
              onOpen={onOpenSubSite}
              onCreateUnder={(parentId, parentLabel, parentSpecificationId) =>
                setCreateTarget({ parentId, parentLabel, parentSpecificationId })
              }
              onDelete={(id, label) => setPendingDelete({ id, label })}
            />
          ))}
        </div>
      )}

      {createTarget ? (
        <CreateSubSiteModal
          parentId={createTarget.parentId}
          parentLabel={createTarget.parentLabel}
          allowedSpecs={allowedChildSpecsOf(specById.get(createTarget.parentSpecificationId), specs)}
          onClose={() => setCreateTarget(null)}
          onCreated={() => {
            setCreateTarget(null);
            refresh();
          }}
        />
      ) : null}

      {pendingDelete ? (
        <Modal onClose={() => setPendingDelete(null)} title="Excluir sub-local" eyebrow="Local">
          <div className="grid gap-4">
            <p className="text-[0.9rem] leading-snug text-app-text">
              Excluir <strong>{pendingDelete.label}</strong>? O sub-local será encerrado.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="geo-btn secondary"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                className="geo-btn border-status-red/30 bg-status-red-soft text-status-red hover:brightness-95"
              >
                Excluir
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function SubSiteBranch({
  node,
  depth,
  onOpen,
  onCreateUnder,
  onDelete,
}: {
  node: GeoTreeNode;
  depth: number;
  onOpen: (siteId: string) => void;
  onCreateUnder: (parentId: string, parentLabel: string, parentSpecificationId: string) => void;
  onDelete: (id: string, label: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<GeoTreeNode[] | null>(null);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const indent = 8 + depth * 16;

  const toggle = async () => {
    if (!expanded && children === null) {
      setLoadingChildren(true);
      const page = await fetchTreeChildren(node.id, { scope: 'all' }).catch(() => ({
        nodes: [] as GeoTreeNode[],
      }));
      setChildren(page.nodes.filter((child) => child.kind === 'site'));
      setLoadingChildren(false);
    }
    setExpanded((current) => !current);
  };

  if (!node.refId || !node.siteSpecificationId) return null;
  const refId = node.refId;
  const specificationId = node.siteSpecificationId;

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-[10px] pr-1 transition hover:bg-app-accent-soft"
        style={{ paddingLeft: indent }}
      >
        <button
          type="button"
          onClick={() => void toggle()}
          aria-label={expanded ? `Recolher ${node.label}` : `Expandir ${node.label}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] text-app-muted hover:bg-black/5"
        >
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <NodeIcon node={node} />
          <span className="min-w-0 flex-1 truncate text-[0.84rem] font-medium text-app-text">
            {node.label}
          </span>
          {node.sublabel ? (
            <span className="shrink-0 text-[0.72rem] text-app-muted">{node.sublabel}</span>
          ) : null}
        </button>
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={`Mais opções de ${node.label}`}
            aria-haspopup="menu"
            className="rounded-[8px] p-1.5 text-app-muted hover:bg-black/5"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
          {menuOpen ? (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-[12px] border border-app-border bg-white py-1 shadow-soft"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpen(refId);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-[0.84rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                >
                  Abrir
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onCreateUnder(refId, node.label, specificationId);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-[0.84rem] font-medium text-app-text transition hover:bg-app-accent-soft"
                >
                  Criar sub-local filho
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete(refId, node.label);
                  }}
                  className="flex w-full items-center px-3 py-2 text-left text-[0.84rem] font-medium text-status-red transition hover:bg-status-red-soft"
                >
                  Excluir
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      {expanded ? (
        loadingChildren ? (
          <div className="py-1 text-[0.78rem] text-app-muted" style={{ paddingLeft: indent + 26 }}>
            Carregando…
          </div>
        ) : (
          children?.map((child) => (
            <SubSiteBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              onOpen={onOpen}
              onCreateUnder={onCreateUnder}
              onDelete={onDelete}
            />
          ))
        )
      ) : null}
    </>
  );
}

function CreateSubSiteModal({
  parentId,
  parentLabel,
  allowedSpecs,
  onClose,
  onCreated,
}: {
  parentId: string;
  parentLabel: string;
  allowedSpecs: GeoSpec[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [siteSpecificationId, setSiteSpecificationId] = useState(allowedSpecs[0]?.id ?? '');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!siteSpecificationId || !name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      // Sub-local sem ponto próprio herda o endereço/local do pai — só a hierarquia muda.
      await postJson('/v1/geo/sites', {
        name: name.trim(),
        siteSpecificationId,
        parentSiteId: parentId,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o sub-local.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`Novo sub-local em ${parentLabel}`} eyebrow="Local">
      <div className="grid gap-4">
        {allowedSpecs.length === 0 ? (
          <p className="text-[0.86rem] text-app-muted">
            Nenhum tipo de sub-local é permitido dentro deste local.
          </p>
        ) : (
          <div className="grid gap-1.5">
            <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
              Tipo de sub-local
            </label>
            <select
              value={siteSpecificationId}
              onChange={(event) => setSiteSpecificationId(event.target.value)}
              className="geo-input"
            >
              {allowedSpecs.map((spec) => (
                <option key={spec.id} value={spec.id}>
                  {siteSpecLabel(spec)}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="grid gap-1.5">
          <label className="text-[0.72rem] font-semibold uppercase tracking-[0.07em] text-app-muted">
            Nome
          </label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="ex: Sala 1.1"
            className="geo-input"
          />
        </div>
        {error ? <p className="text-[0.8rem] text-status-red">{error}</p> : null}
        <div className="flex justify-end gap-2 border-t border-app-border pt-4">
          <button type="button" onClick={onClose} className="geo-btn secondary">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !siteSpecificationId || !name.trim()}
            className="geo-btn primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando…' : 'Criar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
