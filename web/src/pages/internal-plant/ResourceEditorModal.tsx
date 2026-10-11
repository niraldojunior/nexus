import {
  Boxes,
  FileText,
  History,
  Link2,
  Loader2,
  MapPin,
  Plus,
  SlidersHorizontal,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CatalogTreeCombobox, type CatalogResourceTypeRef } from '../../components/CatalogTreePicker';
import Button from '../../components/ui/Button';
import {
  fetchResourceEditor,
  fetchResourceHistory,
  saveResourceAggregate,
  type AggregateChildDraft,
  type EditorCharacteristic,
  type EditorResourceKind,
  type ResourceEditorSnapshot,
  type SaveResourceAggregatePayload,
} from '../../services/internalPlantApi';
import { listGeoSites, getGeoSite, getGeoLocation, getGeoAddress, type GeoSite } from '../../services/geoApi';
import { GOOGLE_MAPS_KEY, loadGoogleMaps, type GoogleMarkerInstance } from '../../utils/googleMaps';
import { formatAddress } from '../../utils/placeLabel';
import {
  listResourceStatusCatalog,
  listResourceTypeRelationshipRules,
  listResources,
  type ResourceRelationshipType,
  type ResourceSpecification,
  type ResourceAuditEntry,
  type ResourceStatusCatalogEntry,
  type ResourceType,
  type ResourceTypeRelationshipRule,
} from '../../services/resourceApi';
import {
  type ResourceCatalogTreeNode,
} from '../../services/resourceCatalogApi';
import {
  loadDefaultCatalogTree,
  loadRelationshipTypesCached,
  loadResourceTypesCached,
  loadSiteSpecificationsCached,
  loadSpecificationsCached,
} from '../../services/internalPlantCatalogCache';

type TabId = 'general' | 'characteristics' | 'components' | 'relations' | 'places' | 'history';
const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'general', label: 'Geral', icon: FileText },
  { id: 'characteristics', label: 'Características', icon: SlidersHorizontal },
  { id: 'components', label: 'Componentes', icon: Boxes },
  { id: 'relations', label: 'Relações', icon: Link2 },
  { id: 'places', label: 'Locais', icon: MapPin },
  { id: 'history', label: 'Histórico', icon: History },
];

const CONTAINMENT = new Set(['containsAsChild', 'containedBy']);

type ChildNode = {
  key: string;
  id?: string;
  name: string;
  specId: string;
  typeId: string;
  children: ChildNode[];
};
type RelationDraft = {
  key: string;
  targetId: string;
  targetName: string;
  relationshipType: string;
  direction: 'outgoing' | 'incoming';
};
type SiteRelDraft = { key: string; siteId: string; siteName: string; relationshipType: string };

type Draft = {
  name: string;
  typeId: string;
  specId: string;
  statusCode: string;
  label: string;
  serialNumber: string;
  partNumber: string;
  assetReference: string;
  notes: string;
  placeId: string | null;
  placeName: string;
  instanceValues: Record<string, string>;
  children: ChildNode[];
  relations: RelationDraft[];
  siteRels: SiteRelDraft[];
};

let seq = 0;
const nextKey = () => `n${(seq += 1)}`;

const inputClass =
  'w-full rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.85rem] text-app-text outline-none focus:border-app-accent';
const labelClass = 'grid gap-1 text-[0.78rem] font-semibold text-app-muted';

const activeRule = (r: ResourceTypeRelationshipRule) => r.lifecycleStatus === 'Active';

const SERVING_SITE = 'servingSite';
/** Observação livre do recurso: characteristic `notes` (alias legado `observacao`). */
const NOTES_NAMES = ['notes', 'observacao'];
const notesOf = (characteristic: EditorCharacteristic[] | undefined): string => {
  const found = characteristic?.find((c) => NOTES_NAMES.includes(c.name));
  return found?.value === undefined || found.value === null ? '' : String(found.value);
};

/** Rede externa: o `place` é a Location/Address do ponto; o site atendido vive na characteristic `servingSite`. */
const placeIsSite = (snap: ResourceEditorSnapshot | null): boolean => {
  const ref = snap?.place?.['@referredType'] ?? snap?.resource.place?.['@referredType'];
  return !ref || ref === 'GeographicSite';
};

const servingSiteOf = (snap: ResourceEditorSnapshot): string | null => {
  const value = snap.resource.characteristic?.find((c) => c.name === SERVING_SITE)?.value;
  return typeof value === 'string' && value ? value : null;
};

function toTree(snapshot: ResourceEditorSnapshot, typeOfSpec: Map<string, string>): ChildNode[] {
  const byParent = new Map<string | null, ResourceEditorSnapshot['components']>();
  for (const c of snapshot.components) {
    const list = byParent.get(c.parentId) ?? [];
    list.push(c);
    byParent.set(c.parentId, list);
  }
  const build = (parentId: string | null): ChildNode[] =>
    (byParent.get(parentId) ?? []).map((c) => ({
      key: nextKey(),
      id: c.id,
      name: c.name,
      specId: c.specification?.id ?? '',
      typeId: typeOfSpec.get(c.specification?.id ?? '') ?? '',
      children: build(c.id),
    }));
  return build(snapshot.resource.id);
}

function toDraftChildren(nodes: ChildNode[]): AggregateChildDraft[] {
  return nodes.map((n) => ({
    ...(n.id ? { id: n.id } : {}),
    name: n.name.trim(),
    resourceSpecificationId: n.specId,
    children: toDraftChildren(n.children),
  }));
}

function updateNode(nodes: ChildNode[], key: string, fn: (n: ChildNode) => ChildNode | null): ChildNode[] {
  return nodes.flatMap((n) => {
    if (n.key === key) {
      const r = fn(n);
      return r ? [r] : [];
    }
    return [{ ...n, children: updateNode(n.children, key, fn) }];
  });
}

export type ResourceEditorModalProps = {
  /** Edição quando presente; criação caso contrário. */
  resourceId?: string | undefined;
  /** Tipo pré-selecionado na criação. */
  initialTypeId?: string | undefined;
  onClose: () => void;
  onSaved: () => void;
};

export function ResourceEditorModal({ resourceId, initialTypeId, onClose, onSaved }: ResourceEditorModalProps) {
  const [tab, setTab] = useState<TabId>('general');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const [types, setTypes] = useState<ResourceType[]>([]);
  const [specs, setSpecs] = useState<ResourceSpecification[]>([]);
  const [tree, setTree] = useState<ResourceCatalogTreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const treeRequested = useRef(false);
  // A árvore só é buscada quando o usuário abre o combo de Tipo.
  const ensureTree = useCallback(() => {
    if (treeRequested.current) return;
    treeRequested.current = true;
    setTreeLoading(true);
    loadDefaultCatalogTree()
      .then(setTree)
      .catch((cause) => {
        treeRequested.current = false;
        setError(cause instanceof Error ? cause.message : 'Falha ao carregar tipos.');
      })
      .finally(() => setTreeLoading(false));
  }, []);
  const [relTypes, setRelTypes] = useState<ResourceRelationshipType[]>([]);
  const [statuses, setStatuses] = useState<ResourceStatusCatalogEntry[]>([]);
  const [rulesByType, setRulesByType] = useState<Record<string, ResourceTypeRelationshipRule[]>>({});
  const [siteSpecNames, setSiteSpecNames] = useState<Record<string, string>>({});
  const [snapshot, setSnapshot] = useState<ResourceEditorSnapshot | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const requestedRules = useRef(new Set<string>());

  const typeById = useMemo(() => new Map(types.map((t) => [t.id, t])), [types]);
  const specById = useMemo(() => new Map(specs.map((s) => [s.id, s])), [specs]);

  const ensureRules = useCallback(async (typeId: string) => {
    if (!typeId || requestedRules.current.has(typeId)) return;
    requestedRules.current.add(typeId);
    try {
      const rules = await listResourceTypeRelationshipRules(typeId);
      setRulesByType((prev) => ({ ...prev, [typeId]: rules.filter(activeRule) }));
    } catch (cause) {
      requestedRules.current.delete(typeId);
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar regras do tipo.');
    }
  }, []);

  // Carga inicial: catálogos + (em edição) snapshot do recurso.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [typeList, specList, relTypeList, siteSpecs, snap] = await Promise.all([
          loadResourceTypesCached(),
          loadSpecificationsCached(),
          loadRelationshipTypesCached(),
          loadSiteSpecificationsCached(),
          resourceId ? fetchResourceEditor(resourceId) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        const typeOfSpec = new Map(specList.map((s) => [s.id, s.resourceTypeId ?? '']));
        setTypes(typeList);
        setSpecs(specList);
        setRelTypes(relTypeList);
        setSiteSpecNames(Object.fromEntries(siteSpecs.map((s) => [s.id, s.name])));
        if (snap) {
          const typeId = snap.resourceType.id;
          const instanceValues: Record<string, string> = {};
          for (const c of snap.resource.characteristic ?? []) {
            if (c.value !== undefined && c.value !== null) {
              instanceValues[c.name] = typeof c.value === 'object' ? JSON.stringify(c.value) : String(c.value);
            }
          }
          const outgoing = snap.relationships.filter((r) => r.direction === 'outgoing');
          const inverseOf = new Map(relTypeList.map((r) => [r.code, r.inverseCode]));
          const relations: RelationDraft[] = [];
          for (const r of snap.relationships) {
            if (CONTAINMENT.has(r.relationshipType)) continue;
            if (
              r.direction === 'incoming' &&
              outgoing.some(
                (o) =>
                  o.resource.id === r.resource.id &&
                  (inverseOf.get(o.relationshipType) === r.relationshipType ||
                    o.relationshipType === r.relationshipType),
              )
            ) {
              continue;
            }
            if (
              relations.some(
                (x) => x.targetId === r.resource.id && x.relationshipType === r.relationshipType,
              )
            ) {
              continue;
            }
            relations.push({
              key: nextKey(),
              targetId: r.resource.id,
              targetName: r.resource.name,
              relationshipType: r.relationshipType,
              direction: r.direction,
            });
          }
          setSnapshot(snap);
          setDraft({
            name: snap.resource.name,
            typeId,
            specId: snap.resource.resourceSpecificationId,
            statusCode: snap.resource.statusCode ?? '',
            label: snap.resource.label ?? '',
            serialNumber: snap.resource.serialNumber ?? '',
            partNumber: snap.resource.partNumber ?? '',
            assetReference: snap.resource.assetReference ?? '',
            notes: notesOf(snap.resource.characteristic),
            placeId:
              servingSiteOf(snap) ??
              (placeIsSite(snap) ? (snap.place?.id ?? snap.resource.place?.id ?? null) : null),
            placeName: servingSiteOf(snap) ? '' : (snap.place?.name ?? snap.resource.place?.name ?? ''),
            instanceValues,
            children: toTree(snap, typeOfSpec),
            relations,
            siteRels: snap.siteRelationships.map((s) => ({
              key: nextKey(),
              siteId: s.site.id,
              siteName: s.site.name ?? s.site.id,
              relationshipType: s.relationshipType,
            })),
          });
          void ensureRules(typeId);
        } else {
          const first = specList.find((s) => s.resourceTypeId === initialTypeId);
          setDraft({
            name: '',
            typeId: initialTypeId ?? '',
            specId: first?.id ?? '',
            statusCode: '',
            label: '',
            serialNumber: '',
            partNumber: '',
            assetReference: '',
            notes: '',
            placeId: null,
            placeName: '',
            instanceValues: {},
            children: [],
            relations: [],
            siteRels: [],
          });
          if (initialTypeId) void ensureRules(initialTypeId);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha ao carregar o editor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resourceId, initialTypeId, ensureRules]);

  const type = draft ? typeById.get(draft.typeId) : undefined;
  const nature: EditorResourceKind = type?.nature ?? snapshot?.resource['@type'] ?? 'PhysicalResource';

  useEffect(() => {
    if (!type) return;
    void listResourceStatusCatalog(type.code).then(setStatuses).catch(() => setStatuses([]));
  }, [type]);

  const patch = (changes: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...changes } : d));
    setDirty(true);
  };

  const requestClose = () => {
    if (dirty && !window.confirm('Descartar as alterações não salvas?')) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const selectType = (ref: CatalogResourceTypeRef) => {
    if (!draft) return;
    const next = typeById.get(ref.id);
    if (snapshot && next?.nature && next.nature !== snapshot.resource['@type']) {
      setError('O tipo escolhido tem natureza diferente da do recurso.');
      return;
    }
    setError(null);
    const specsOfType = specs.filter((s) => s.resourceTypeId === ref.id);
    patch({
      typeId: ref.id,
      specId: specsOfType.some((s) => s.id === draft.specId) ? draft.specId : (specsOfType[0]?.id ?? ''),
      relations: [],
      siteRels: [],
      children: [],
      instanceValues: {},
    });
    void ensureRules(ref.id);
  };

  const rules = draft ? (rulesByType[draft.typeId] ?? []) : [];
  const relRules = rules.filter(
    (r) => r.targetKind === 'RESOURCE_TYPE' && !CONTAINMENT.has(r.relationshipTypeCode),
  );
  const siteRules = rules.filter((r) => r.targetKind === 'GEOGRAPHIC_SITE_SPECIFICATION');

  const specsOfDraftType = specs.filter((s) => s.resourceTypeId === draft?.typeId);
  const spec = draft ? specById.get(draft.specId) : undefined;

  const specLevel: EditorCharacteristic[] = useMemo(() => {
    if (!type) return [];
    const fromSpec = new Map(
      ((spec as { resourceSpecificationCharacteristic?: EditorCharacteristic[] } | undefined)
        ?.resourceSpecificationCharacteristic ?? []
      ).map((c) => [c.name, c]),
    );
    return (type.resourceTypeCharacteristic ?? [])
      .filter((c) => c.characteristicLevel !== 'instance')
      .map((c) => ({ ...c, value: fromSpec.get(c.name)?.value ?? c.value }));
  }, [type, spec]);
  const instanceDefs: EditorCharacteristic[] = useMemo(
    () => (type?.resourceTypeCharacteristic ?? []).filter((c) => c.characteristicLevel === 'instance'),
    [type],
  );

  const validate = (): string | null => {
    if (!draft) return 'Editor não carregado.';
    if (!draft.name.trim()) return 'Informe o nome do recurso.';
    if (!draft.typeId) return 'Selecione o tipo do recurso.';
    if (!draft.specId) return 'Selecione a especificação.';
    const bad = (nodes: ChildNode[]): boolean =>
      nodes.some((n) => !n.name.trim() || !n.specId || bad(n.children));
    if (bad(draft.children)) return 'Todo componente precisa de nome e especificação.';
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem || !draft) {
      setError(problem);
      return;
    }
    // Preserva toda característica existente (inclusive _origin); só sobrescreve as de instância editadas.
    const defNames = new Set(instanceDefs.map((d) => d.name));
    const existing = (snapshot?.resource.characteristic ?? []).filter(
      (c) => !defNames.has(c.name) && c.name !== SERVING_SITE && !NOTES_NAMES.includes(c.name),
    );
    const notesCharacteristic: EditorCharacteristic[] = draft.notes.trim()
      ? [{ name: 'notes', value: draft.notes.trim(), valueType: 'string' }]
      : [];
    const servingSiteCharacteristic: EditorCharacteristic[] = draft.placeId
      ? [{ name: SERVING_SITE, value: draft.placeId, valueType: 'string' }]
      : [];
    const edited: EditorCharacteristic[] = instanceDefs
      .filter((d) => draft.instanceValues[d.name] !== undefined && draft.instanceValues[d.name] !== '')
      .map((d) => {
        const raw = draft.instanceValues[d.name] as string;
        const value: unknown =
          d.valueType === 'integer'
            ? Number.parseInt(raw, 10)
            : d.valueType === 'decimal'
              ? Number.parseFloat(raw)
              : d.valueType === 'boolean'
                ? raw === 'true'
                : raw;
        return { ...d, value, characteristicLevel: 'instance' as const };
      });
    const payload: SaveResourceAggregatePayload = {
      ...(resourceId ? { id: resourceId } : {}),
      '@type': nature,
      name: draft.name.trim(),
      resourceSpecificationId: draft.specId,
      ...(draft.statusCode ? { statusCode: draft.statusCode } : {}),
      label: draft.label,
      ...(nature === 'PhysicalResource'
        ? {
            serialNumber: draft.serialNumber,
            partNumber: draft.partNumber,
            assetReference: draft.assetReference,
          }
        : {}),
      // Só o `place` do tipo Site é gravado aqui; Location/Address (rede externa) permanece intacto.
      ...(placeIsSite(snapshot) ? { placeId: draft.placeId } : {}),
      characteristic: [...existing, ...servingSiteCharacteristic, ...notesCharacteristic, ...edited],
      components: toDraftChildren(draft.children),
      relationships: draft.relations.map((r) => ({
        targetId: r.targetId,
        relationshipType: r.relationshipType,
        direction: r.direction,
      })),
      siteRelationships: draft.siteRels.map((s) => ({
        siteId: s.siteId,
        relationshipType: s.relationshipType,
      })),
    };
    setSaving(true);
    setError(null);
    try {
      await saveResourceAggregate(payload);
      setDirty(false);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar o recurso.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={resourceId ? 'Editar recurso' : 'Novo recurso'}
        className="flex h-[min(720px,calc(100vh-32px))] w-full max-w-[960px] overflow-hidden rounded-[24px] border border-app-border bg-app-panel shadow-modal"
      >
        <nav aria-label="Recurso" className="flex w-[200px] shrink-0 flex-col gap-1 bg-app-sidebar border-r border-app-border p-4 max-sm:hidden">
          <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wide text-app-muted">Recurso</p>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-[0.85rem] text-app-text transition ${
                tab === t.id
                  ? 'border-app-accent-border bg-app-accent-soft font-semibold'
                  : 'border-transparent hover:bg-app-hover'
              }`}
              style={{ borderWidth: 1, borderStyle: 'solid' }}
            >
              <t.icon size={16} aria-hidden="true" className="shrink-0" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-app-border px-5 py-3">
            <h2 className="text-[1rem] font-semibold text-app-text">
              {resourceId ? `Editar recurso${draft?.name ? ` ${draft.name}` : ''}` : 'Novo recurso'}
              {TABS.find((t) => t.id === tab) ? ` · ${TABS.find((t) => t.id === tab)?.label}` : ''}
            </h2>
            <button type="button" aria-label="Fechar" onClick={requestClose} className="text-app-muted hover:text-app-text">
              <X size={18} />
            </button>
          </header>
          <div className="flex gap-1 overflow-x-auto border-b border-app-border px-3 py-1.5 sm:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[0.8rem] ${tab === t.id ? 'bg-app-accent-soft font-semibold' : 'text-app-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {loading || !draft ? (
              error ? (
                <p role="alert" className="text-[0.9rem] text-status-red">{error}</p>
              ) : (
                <Loader2 className="animate-spin text-app-muted" aria-label="Carregando" />
              )
            ) : tab === 'general' ? (
              <GeneralTab
                draft={draft}
                tree={tree}
                treeLoading={treeLoading}
                onOpenTree={ensureTree}
                typeName={type?.name}
                nature={nature}
                specs={specsOfDraftType}
                statuses={statuses}
                onType={selectType}
                patch={patch}
              />
            ) : tab === 'characteristics' ? (
              <CharacteristicsTab
                specLevel={specLevel}
                instanceDefs={instanceDefs}
                values={draft.instanceValues}
                onChange={(name, value) =>
                  patch({ instanceValues: { ...draft.instanceValues, [name]: value } })
                }
              />
            ) : tab === 'components' ? (
              <ComponentsTab
                draft={draft}
                typeById={typeById}
                specs={specs}
                rootTypeId={draft.typeId}
                rulesByType={rulesByType}
                ensureRules={ensureRules}
                onChange={(children) => patch({ children })}
              />
            ) : tab === 'relations' ? (
              <RelationsTab
                draft={draft}
                rules={relRules}
                relTypes={relTypes}
                typeById={typeById}
                selfId={resourceId}
                onChange={(relations) => patch({ relations })}
              />
            ) : tab === 'history' ? (
              resourceId ? (
                <HistoryTab resourceId={resourceId} characteristics={snapshot?.resource.characteristic} />
              ) : (
                <p className="text-[0.85rem] text-app-muted">O histórico fica disponível após salvar o recurso.</p>
              )
            ) : (
              <PlacesTab
                draft={draft}
                siteRules={siteRules}
                relTypes={relTypes}
                siteSpecNames={siteSpecNames}
                onPlace={(placeId, placeName) => patch({ placeId, placeName })}
                onChange={(siteRels) => patch({ siteRels })}
              />
            )}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-app-border px-5 py-3">
            <p role="alert" className="min-w-0 flex-1 truncate text-[0.82rem] text-status-red" title={error ?? ''}>
              {!loading && error ? error : ''}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={requestClose} disabled={saving}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={() => void save()} disabled={saving || loading || !draft}>
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function GeneralTab({
  draft,
  tree,
  treeLoading,
  onOpenTree,
  typeName,
  nature,
  specs,
  statuses,
  onType,
  patch,
}: {
  draft: Draft;
  tree: ResourceCatalogTreeNode[];
  treeLoading: boolean;
  onOpenTree: () => void;
  typeName: string | undefined;
  nature: EditorResourceKind;
  specs: ResourceSpecification[];
  statuses: ResourceStatusCatalogEntry[];
  onType: (ref: CatalogResourceTypeRef) => void;
  patch: (c: Partial<Draft>) => void;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Nome
          <input className={inputClass} value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
        </label>
        <label className={labelClass}>
          Rótulo
          <input className={inputClass} value={draft.label} onChange={(e) => patch({ label: e.target.value })} />
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className={labelClass}>
          <span>Tipo</span>
          <CatalogTreeCombobox
            nodes={tree}
            selectedTypeId={draft.typeId || null}
            selectedLabel={typeName}
            onOpen={onOpenTree}
            loading={treeLoading}
            onSelectType={onType}
          />
        </div>
        <label className={labelClass}>
          Especificação
          <select
            className={inputClass}
            value={draft.specId}
            onChange={(e) => patch({ specId: e.target.value })}
            disabled={!draft.typeId}
          >
            <option value="">Selecione…</option>
            {specs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className={labelClass}>
        Status
        <select className={inputClass} value={draft.statusCode} onChange={(e) => patch({ statusCode: e.target.value })}>
          <option value="">Padrão</option>
          {statuses
            .filter((s) => s.active)
            .map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
        </select>
      </label>
      {nature === 'PhysicalResource' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <label className={labelClass}>
            Número de série
            <input className={inputClass} value={draft.serialNumber} onChange={(e) => patch({ serialNumber: e.target.value })} />
          </label>
          <label className={labelClass}>
            Part number
            <input className={inputClass} value={draft.partNumber} onChange={(e) => patch({ partNumber: e.target.value })} />
          </label>
          <label className={labelClass}>
            Referência de ativo
            <input className={inputClass} value={draft.assetReference} onChange={(e) => patch({ assetReference: e.target.value })} />
          </label>
        </div>
      ) : null}
      <label className={labelClass}>
        Observação
        <textarea
          className={`${inputClass} min-h-[88px] resize-y`}
          rows={4}
          value={draft.notes}
          onChange={(e) => patch({ notes: e.target.value })}
        />
      </label>
    </div>
  );
}

function CharacteristicsTab({
  specLevel,
  instanceDefs,
  values,
  onChange,
}: {
  specLevel: EditorCharacteristic[];
  instanceDefs: EditorCharacteristic[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}) {
  return (
    <div className="grid gap-6">
      <section aria-label="Nível de especificação" className="grid gap-2">
        <h3 className="text-[0.85rem] font-semibold text-app-text">Nível de especificação</h3>
        {specLevel.length === 0 ? (
          <p className="text-[0.82rem] text-app-muted">Nenhuma característica de especificação.</p>
        ) : (
          specLevel.map((c) => (
            <div key={c.name} className="flex justify-between gap-4 border-b border-app-border py-1.5 text-[0.85rem]">
              <span className="text-app-muted">{c.name}</span>
              <span className="text-app-text">{c.value === undefined || c.value === null ? '—' : String(c.value)}</span>
            </div>
          ))
        )}
      </section>
      <section aria-label="Nível de instância" className="grid gap-3 sm:grid-cols-2">
        <h3 className="text-[0.85rem] font-semibold text-app-text sm:col-span-2">Nível de instância</h3>
        {instanceDefs.length === 0 ? (
          <p className="text-[0.82rem] text-app-muted sm:col-span-2">Este tipo não define características de instância.</p>
        ) : (
          instanceDefs.map((d) => {
            const value = values[d.name] ?? '';
            return (
              <label key={d.name} className={`${labelClass} min-w-0 grid-cols-[minmax(0,1fr)]`}>
                {d.name}
                {d.valueType === 'boolean' ? (
                  <select className={inputClass} value={value} onChange={(e) => onChange(d.name, e.target.value)}>
                    <option value="">—</option>
                    <option value="true">Sim</option>
                    <option value="false">Não</option>
                  </select>
                ) : d.allowedValues && d.allowedValues.length > 0 ? (
                  <select className={inputClass} value={value} onChange={(e) => onChange(d.name, e.target.value)}>
                    <option value="">—</option>
                    {d.allowedValues.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputClass}
                    type={d.valueType === 'date' ? 'date' : d.valueType === 'integer' || d.valueType === 'decimal' ? 'number' : 'text'}
                    value={value}
                    onChange={(e) => onChange(d.name, e.target.value)}
                  />
                )}
              </label>
            );
          })
        )}
      </section>
    </div>
  );
}

function ComponentsTab({
  draft,
  typeById,
  specs,
  rootTypeId,
  rulesByType,
  ensureRules,
  onChange,
}: {
  draft: Draft;
  typeById: Map<string, ResourceType>;
  specs: ResourceSpecification[];
  rootTypeId: string;
  rulesByType: Record<string, ResourceTypeRelationshipRule[]>;
  ensureRules: (typeId: string) => Promise<void>;
  onChange: (children: ChildNode[]) => void;
}) {
  const allowedChildTypes = (typeId: string): ResourceType[] =>
    (rulesByType[typeId] ?? [])
      .filter((r) => r.relationshipTypeCode === 'containsAsChild' && r.targetKind === 'RESOURCE_TYPE')
      .map((r) => typeById.get(r.targetId))
      .filter((t): t is ResourceType => Boolean(t));

  useEffect(() => {
    void ensureRules(rootTypeId);
    const walk = (nodes: ChildNode[]) =>
      nodes.forEach((n) => {
        void ensureRules(n.typeId);
        walk(n.children);
      });
    walk(draft.children);
  }, [rootTypeId, draft.children, ensureRules]);

  const add = (parentKey: string | null, parentTypeId: string, typeId: string) => {
    const firstSpec = specs.find((s) => s.resourceTypeId === typeId);
    const child: ChildNode = {
      key: nextKey(),
      name: '',
      specId: firstSpec?.id ?? '',
      typeId,
      children: [],
    };
    void ensureRules(typeId);
    if (parentKey === null) onChange([...draft.children, child]);
    else onChange(updateNode(draft.children, parentKey, (n) => ({ ...n, children: [...n.children, child] })));
    void parentTypeId;
  };

  const AddControl = ({ parentKey, typeId }: { parentKey: string | null; typeId: string }) => {
    const options = allowedChildTypes(typeId);
    if (options.length === 0) return null;
    return (
      <select
        aria-label="Adicionar filho"
        className="rounded-[8px] border border-app-border bg-app-panel px-2 py-1 text-[0.78rem] text-app-muted"
        value=""
        onChange={(e) => e.target.value && add(parentKey, typeId, e.target.value)}
      >
        <option value="">+ Adicionar filho…</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
    );
  };

  const render = (nodes: ChildNode[], depth: number): React.ReactNode =>
    nodes.map((n) => (
      <li key={n.key} className="grid gap-1.5" style={{ marginLeft: depth * 16 }}>
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-app-border p-2">
          <input
            aria-label="Nome do componente"
            className={`${inputClass} min-w-[140px] flex-1`}
            value={n.name}
            onChange={(e) => onChange(updateNode(draft.children, n.key, (x) => ({ ...x, name: e.target.value })))}
          />
          <span className="text-[0.75rem] text-app-muted">{typeById.get(n.typeId)?.name ?? '—'}</span>
          <select
            aria-label="Especificação do componente"
            className="rounded-[8px] border border-app-border bg-app-panel px-2 py-1 text-[0.8rem]"
            value={n.specId}
            onChange={(e) => onChange(updateNode(draft.children, n.key, (x) => ({ ...x, specId: e.target.value })))}
          >
            {specs
              .filter((s) => s.resourceTypeId === n.typeId)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
          <AddControl parentKey={n.key} typeId={n.typeId} />
          <button
            type="button"
            aria-label={`Remover ${n.name || 'componente'}`}
            className="text-app-muted hover:text-status-red"
            onClick={() => onChange(updateNode(draft.children, n.key, () => null))}
          >
            <Trash2 size={15} />
          </button>
        </div>
        {n.children.length > 0 ? <ul className="grid gap-1.5">{render(n.children, depth + 1)}</ul> : null}
      </li>
    ));

  const rootOptions = allowedChildTypes(rootTypeId);
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[0.82rem] text-app-muted">
          {rootOptions.length === 0
            ? 'Este tipo não possui regra de contenção; não pode ter componentes.'
            : 'Remover um componente existente apenas o desvincula; ele não é excluído.'}
        </p>
        <AddControl parentKey={null} typeId={rootTypeId} />
      </div>
      {draft.children.length > 0 ? <ul className="grid gap-1.5">{render(draft.children, 0)}</ul> : null}
    </div>
  );
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function RelationsTab({
  draft,
  rules,
  relTypes,
  typeById,
  selfId,
  onChange,
}: {
  draft: Draft;
  rules: ResourceTypeRelationshipRule[];
  relTypes: ResourceRelationshipType[];
  typeById: Map<string, ResourceType>;
  selfId: string | undefined;
  onChange: (relations: RelationDraft[]) => void;
}) {
  const codes = [...new Set(rules.map((r) => r.relationshipTypeCode))];
  const [code, setCode] = useState('');
  const [term, setTerm] = useState('');
  const q = useDebounced(term);
  const [results, setResults] = useState<Array<{ id: string; name: string; resourceType?: string; status?: string }>>([]);
  const selected = code || codes[0] || '';
  const allowedTypeNames = useMemo(
    () =>
      new Set(
        rules
          .filter((r) => r.relationshipTypeCode === selected)
          .map((r) => typeById.get(r.targetId)?.code)
          .filter((c): c is string => Boolean(c)),
      ),
    [rules, selected, typeById],
  );

  useEffect(() => {
    if (!selected || q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void Promise.all(
      (['PhysicalResource', 'LogicalResource'] as const).map((kind) =>
        listResources({ kind, limit: 20, offset: 0, name: q.trim() }).catch(() => []),
      ),
    ).then((lists) => {
      if (cancelled) return;
      setResults(
        lists
          .flat()
          .filter((r) => r.id !== selfId && r.status !== 'terminated')
          .filter((r) => allowedTypeNames.size === 0 || (r.resourceType ? allowedTypeNames.has(r.resourceType) : true))
          .filter((r) => !draft.relations.some((x) => x.targetId === r.id && x.relationshipType === selected))
          .map((r) => ({ id: r.id, name: r.name, ...(r.resourceType ? { resourceType: r.resourceType } : {}) })),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [q, selected, selfId, allowedTypeNames, draft.relations]);

  if (codes.length === 0) {
    return <p className="text-[0.85rem] text-app-muted">O tipo não define regras de relação entre recursos.</p>;
  }
  const nameOf = (c: string) => relTypes.find((r) => r.code === c)?.name ?? c;
  return (
    <div className="grid gap-4">
      <div className="grid gap-2 sm:grid-cols-[200px_1fr]">
        <label className={labelClass}>
          Tipo de relação
          <select className={inputClass} value={selected} onChange={(e) => setCode(e.target.value)}>
            {codes.map((c) => (
              <option key={c} value={c}>
                {nameOf(c)}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Buscar recurso por nome
          <input className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Ao menos 2 caracteres" />
        </label>
      </div>
      {results.length > 0 ? (
        <ul className="grid max-h-40 gap-1 overflow-y-auto rounded-[10px] border border-app-border p-1">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-left text-[0.85rem] hover:bg-app-hover"
                onClick={() => {
                  onChange([
                    ...draft.relations,
                    { key: nextKey(), targetId: r.id, targetName: r.name, relationshipType: selected, direction: 'outgoing' },
                  ]);
                  setTerm('');
                }}
              >
                <span>{r.name}</span>
                <Plus size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <ul className="grid gap-1.5">
        {draft.relations.map((r) => (
          <li key={r.key} className="flex items-center justify-between rounded-[10px] border border-app-border px-3 py-1.5 text-[0.85rem]">
            <span>
              <span className="text-app-muted">
                {nameOf(r.relationshipType)}
                {r.direction === 'incoming' ? ' (entrada)' : ''}:
              </span>{' '}
              {r.targetName}
            </span>
            <button
              type="button"
              aria-label={`Remover relação com ${r.targetName}`}
              className="text-app-muted hover:text-status-red"
              onClick={() => onChange(draft.relations.filter((x) => x.key !== r.key))}
            >
              <Trash2 size={15} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SiteSearch({
  specIds,
  onPick,
}: {
  specIds?: string[] | undefined;
  onPick: (site: GeoSite) => void;
}) {
  const [term, setTerm] = useState('');
  const q = useDebounced(term);
  const [results, setResults] = useState<GeoSite[]>([]);
  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    void listGeoSites({ name: q.trim(), limit: 10, ...(specIds && specIds.length ? { siteSpecificationIds: specIds } : {}) })
      .then((r) => !cancelled && setResults(r))
      .catch(() => !cancelled && setResults([]));
    return () => {
      cancelled = true;
    };
  }, [q, specIds]);
  return (
    <div className="grid gap-1">
      <input className={inputClass} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar local por nome" aria-label="Buscar local" />
      {results.length > 0 ? (
        <ul className="grid max-h-40 gap-1 overflow-y-auto rounded-[10px] border border-app-border p-1">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="w-full rounded-lg px-2 py-1 text-left text-[0.85rem] hover:bg-app-hover"
                onClick={() => {
                  onPick(s);
                  setTerm('');
                  setResults([]);
                }}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const HISTORY_FIELDS: Array<[string, string]> = [
  ['name', 'Nome'],
  ['status', 'Status'],
  ['statusCode', 'Estado'],
  ['administrativeState', 'Estado administrativo'],
  ['operationalState', 'Estado operacional'],
  ['usageState', 'Estado de uso'],
  ['label', 'Rótulo'],
  ['serialNumber', 'Nº de série'],
  ['partNumber', 'Part number'],
  ['assetReference', 'Referência de ativo'],
];

const historyText = (v: unknown): string =>
  v === undefined || v === null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v);

function describeAudit(entry: ResourceAuditEntry): string[] {
  if (entry.action === 'create') return ['Recurso criado'];
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const lines: string[] = [];
  for (const [key, label] of HISTORY_FIELDS) {
    if (historyText(before[key]) !== historyText(after[key])) {
      lines.push(`${label}: ${historyText(before[key])} → ${historyText(after[key])}`);
    }
  }
  const placeOf = (s: Record<string, unknown>) =>
    s.place && typeof s.place === 'object' ? ((s.place as { name?: string; id?: string }).name ?? (s.place as { id?: string }).id) : undefined;
  if (historyText(placeOf(before)) !== historyText(placeOf(after))) {
    lines.push(`Local: ${historyText(placeOf(before))} → ${historyText(placeOf(after))}`);
  }
  if (lines.length === 0) {
    const related = after.relatedResourceId ? ' (relação alterada)' : '';
    lines.push(`${entry.action === 'update' ? 'Recurso atualizado' : 'Status alterado'}${related}`);
  }
  return lines;
}

type HistoryRow = { id: string; time: string; lines: string[]; actor: string };

/** Importação de sistema legado: o loader grava direto no banco, sem auditoria; o rastro é `_origin` (C5). */
function originRow(characteristics: EditorCharacteristic[] | undefined): HistoryRow | null {
  const origin = (name: string) =>
    characteristics?.find((c) => c.group === '_origin' && c.name === name)?.value;
  const system = origin('system');
  if (system === undefined || system === null || system === '') return null;
  const legacyId = origin('id');
  const migratedAt = origin('migratedAt');
  return {
    id: '_origin-import',
    time: typeof migratedAt === 'string' ? migratedAt : '',
    lines: [`Importado do ${String(system)}${legacyId ? ` (ID de origem: ${String(legacyId)})` : ''}`],
    actor: String(origin('migratedBy') ?? 'migração'),
  };
}

function HistoryTab({
  resourceId,
  characteristics,
}: {
  resourceId: string;
  characteristics?: EditorCharacteristic[] | undefined;
}) {
  const [entries, setEntries] = useState<ResourceAuditEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setEntries(null);
    setFailed(false);
    fetchResourceHistory(resourceId, controller.signal)
      .then(setEntries)
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, [resourceId]);
  if (failed) return <p className="text-[0.85rem] text-status-red">Falha ao carregar o histórico.</p>;
  if (!entries) return <p className="text-[0.85rem] text-app-muted">Carregando histórico…</p>;
  const imported = originRow(characteristics);
  const rows: HistoryRow[] = entries.map((e) => ({
    id: e.id,
    time: e.eventTime,
    lines: describeAudit(e),
    actor: e.actorSub,
  }));
  // A importação é o fato mais antigo: entra após as alterações, salvo se já houver `create` auditado.
  if (imported && !entries.some((e) => e.action === 'create')) rows.push(imported);
  if (rows.length === 0) return <p className="text-[0.85rem] text-app-muted">Sem histórico de alterações registrado.</p>;
  const ts = (r: HistoryRow) => (r.time ? new Date(r.time).getTime() : 0);
  const sorted = [...rows].sort((a, b) => ts(b) - ts(a));
  return (
    <div className="overflow-x-auto rounded-[10px] border border-app-border">
      <table className="w-full text-left text-[0.82rem]">
        <thead className="border-b border-app-border text-app-muted">
          <tr>
            <th className="px-3 py-2 font-semibold">Data</th>
            <th className="px-3 py-2 font-semibold">O que aconteceu</th>
            <th className="px-3 py-2 font-semibold">Quem fez</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((entry) => (
            <tr key={entry.id} className="border-b border-app-border last:border-b-0 align-top">
              <td className="whitespace-nowrap px-3 py-2 text-app-muted">{entry.time ? new Date(entry.time).toLocaleString('pt-BR') : '—'}</td>
              <td className="px-3 py-2 text-app-text">
                {entry.lines.map((line) => (
                  <p key={line} className="break-words">{line}</p>
                ))}
              </td>
              <td className="px-3 py-2 text-app-text">{entry.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SitePinMap({ point }: { point: { lat: number; lng: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(!GOOGLE_MAPS_KEY);
  useEffect(() => {
    if (!GOOGLE_MAPS_KEY || !ref.current) return;
    let cancelled = false;
    let marker: GoogleMarkerInstance | undefined;
    void loadGoogleMaps(GOOGLE_MAPS_KEY)
      .then(() => {
        const maps = window.google?.maps;
        if (cancelled || !ref.current || !maps) return;
        const map = new maps.Map(ref.current, {
          center: point,
          zoom: 16,
          disableDefaultUI: true,
          gestureHandling: 'none',
          clickableIcons: false,
        });
        marker = new maps.Marker({ position: point, map });
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      marker?.setMap(null);
    };
  }, [point.lat, point.lng]);
  if (failed) {
    return (
      <p className="text-[0.8rem] text-app-muted">
        {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
      </p>
    );
  }
  return <div ref={ref} aria-label="Mapa do local atendido" className="h-44 w-full overflow-hidden rounded-[10px] border border-app-border" />;
}

function PlacesTab({
  draft,
  siteRules,
  relTypes,
  siteSpecNames,
  onPlace,
  onChange,
}: {
  draft: Draft;
  siteRules: ResourceTypeRelationshipRule[];
  relTypes: ResourceRelationshipType[];
  siteSpecNames: Record<string, string>;
  onPlace: (id: string | null, name: string) => void;
  onChange: (siteRels: SiteRelDraft[]) => void;
}) {
  const codes = [...new Set(siteRules.map((r) => r.relationshipTypeCode))];
  const [code, setCode] = useState('');
  const selected = code || codes[0] || '';
  const specIds = siteRules.filter((r) => r.relationshipTypeCode === selected).map((r) => r.targetId);
  const [servingSite, setServingSite] = useState<{
    name: string;
    typeName: string | null;
    missing: boolean;
    address: string | null;
    point: { lat: number; lng: number } | null;
  } | null>(null);

  useEffect(() => {
    if (!draft.placeId) {
      setServingSite(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const site = await getGeoSite(draft.placeId as string);
        const [address, loc] = await Promise.all([
          site?.address?.id ? getGeoAddress(site.address.id).catch(() => undefined) : undefined,
          site?.place?.id ? getGeoLocation(site.place.id).catch(() => undefined) : undefined,
        ]);
        if (cancelled) return;
        setServingSite({
          name: site?.name ?? draft.placeName,
          typeName: site ? (siteSpecNames[site.siteSpecificationId] ?? null) : null,
          missing: !site,
          address: address ? formatAddress(address) : null,
          point:
            loc?.geometry.type === 'Point'
              ? { lat: loc.geometry.coordinates[1], lng: loc.geometry.coordinates[0] }
              : null,
        });
      } catch {
        if (!cancelled) setServingSite(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.placeId, draft.placeName, siteSpecNames]);

  const nameOf = (c: string) => relTypes.find((r) => r.code === c)?.name ?? c;
  return (
    <div className="grid gap-6">
      <section className="grid gap-2" aria-label="Local Atendido">
        <h3 className="text-[0.85rem] font-semibold text-app-text">Local Atendido</h3>
        {draft.placeId ? (
          <div className="grid gap-3 rounded-[10px] border border-app-border px-3 py-2 text-[0.85rem]">
            <div className="flex items-center justify-between">
              <span className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-semibold text-app-text">
                  <MapPin size={15} aria-hidden="true" className="text-app-muted" />
                  {servingSite?.missing
                    ? `Local não encontrado (ID ${draft.placeId})`
                    : (servingSite?.name ?? draft.placeName)}
                </span>
                {servingSite?.typeName ? (
                  <span className="pl-[23px] text-[0.75rem] text-app-muted">{servingSite.typeName}</span>
                ) : null}
              </span>
              <button type="button" aria-label="Remover local atendido" className="text-app-muted hover:text-status-red" onClick={() => onPlace(null, '')}>
                <Trash2 size={15} />
              </button>
            </div>
            {servingSite?.address ? <p className="text-app-muted">{servingSite.address}</p> : null}
            {servingSite?.point ? <SitePinMap point={servingSite.point} /> : null}
          </div>
        ) : (
          <SiteSearch onPick={(s) => onPlace(s.id, s.name)} />
        )}
      </section>
      {codes.length > 0 ? (
        <section className="grid gap-2" aria-label="Relações com locais">
          <h3 className="text-[0.85rem] font-semibold text-app-text">Relações com locais</h3>
          <label className={labelClass}>
            Tipo de relação
            <select className={inputClass} value={selected} onChange={(e) => setCode(e.target.value)}>
              {codes.map((c) => (
                <option key={c} value={c}>
                  {nameOf(c)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[0.75rem] text-app-muted">
            Tipos de local aceitos: {specIds.map((id) => siteSpecNames[id] ?? id).join(', ') || '—'}
          </p>
          <SiteSearch
            specIds={specIds}
            onPick={(s) =>
              draft.siteRels.some((x) => x.siteId === s.id && x.relationshipType === selected)
                ? undefined
                : onChange([...draft.siteRels, { key: nextKey(), siteId: s.id, siteName: s.name, relationshipType: selected }])
            }
          />
          <ul className="grid gap-1.5">
            {draft.siteRels.map((s) => (
              <li key={s.key} className="flex items-center justify-between rounded-[10px] border border-app-border px-3 py-1.5 text-[0.85rem]">
                <span>
                  <span className="text-app-muted">{nameOf(s.relationshipType)}:</span> {s.siteName}
                </span>
                <button
                  type="button"
                  aria-label={`Remover relação com ${s.siteName}`}
                  className="text-app-muted hover:text-status-red"
                  onClick={() => onChange(draft.siteRels.filter((x) => x.key !== s.key))}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
