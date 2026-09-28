import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Plus } from 'lucide-react';
import { listPartyRoleTypes } from '../../../services/partyRoleTypeApi';
import {
  listPartyRoleTypeCharacteristics,
  type PartyRoleTypeCharacteristic,
} from '../../../services/partyRoleTypeCharacteristicApi';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import { Button } from '../../../components/ui';
import { StudioCollectionHeader } from '../../../components/studio/StudioCollectionHeader';
import { RoleDetail } from './RoleDetail';
import { RoleTypeFilterChips } from './RoleTypeFilterChips';
import { partyRoleTypeIcon } from './partyRoleTypeOptions';
import {
  buildRolesSnapshot,
  createRoleDraftItem,
  draftRolesFromCanonical,
  draftRolesFromSnapshot,
  type RoleDraftItem,
} from './roleDraft';
import { parsePartyViewParams, writePartyViewParams } from '../../../utils/partyViewState';

export type RolesPageProps = {
  canEdit: boolean;
  canAdmin: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

export function RolesPage({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: RolesPageProps) {
  const [items, setItems] = useState<RoleDraftItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [baselineActiveIds, setBaselineActiveIds] = useState<Set<string> | null>(null);
  const wasEditingRef = useRef(isEditing);
  const checksumRef = useRef<string | undefined>(undefined);
  const persistedSnapshotRef = useRef<string | undefined>(undefined);

  const canMutate = canEdit && isEditing;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const canonicalTypes = await listPartyRoleTypes();
      const charsEntries = await Promise.all(
        canonicalTypes.map(async (type) => {
          try {
            const chars = await listPartyRoleTypeCharacteristics(type.id);
            return [type.id, chars] as const;
          } catch {
            return [type.id, []] as const;
          }
        }),
      );
      const charsByRole: Record<string, PartyRoleTypeCharacteristic[]> =
        Object.fromEntries(charsEntries);

      const status = await getStudioStatus('parties');
      const restored = status.draftVersion
        ? draftRolesFromSnapshot(status.draftVersion.snapshot, canonicalTypes, charsByRole)
        : null;

      const next = restored ?? draftRolesFromCanonical(canonicalTypes, charsByRole);
      setItems(next);
      checksumRef.current = status.draftVersion?.checksum;
      persistedSnapshotRef.current = JSON.stringify(buildRolesSnapshot(next));

      // Deep linking via query param ?role=<id>
      const urlParams = parsePartyViewParams(window.location.search);
      const initialSelected = urlParams.roleId
        ? next.find(
            (item) => item.localId === urlParams.roleId || item.persistedId === urlParams.roleId,
          )
        : null;

      setSelectedId(initialSelected ? initialSelected.localId : (next[0]?.localId ?? null));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Falha ao carregar catálogo de papéis.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  useEffect(() => {
    if (!showSearch) setFilterText('');
  }, [showSearch]);

  useEffect(() => {
    if (wasEditingRef.current && !isEditing) {
      setBaselineActiveIds(null);
      void loadData();
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, loadData]);

  // Sincroniza query params
  useEffect(() => {
    if (!selectedId) return;
    const current = items.find((item) => item.localId === selectedId);
    const idToPersist = current?.persistedId ?? current?.localId;
    if (idToPersist) {
      writePartyViewParams('party-roles', idToPersist);
    }
  }, [selectedId, items]);

  // Registro de captura de snapshot para governança
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const captureDraft = useCallback(async () => {
    const snapshot = buildRolesSnapshot(itemsRef.current);
    const serializedSnapshot = JSON.stringify(snapshot);
    if (persistedSnapshotRef.current === serializedSnapshot) return;

    const checksum =
      checksumRef.current ?? (await getStudioStatus('parties')).draftVersion?.checksum;
    const saved = await saveStudioDraft(
      'parties',
      snapshot as unknown as Record<string, unknown>,
      checksum,
    );
    checksumRef.current = saved.checksum;
    persistedSnapshotRef.current = serializedSnapshot;
  }, []);

  const captureInitialSnapshot = useCallback(async () => {
    setBaselineActiveIds(
      new Set(itemsRef.current.filter((item) => item.active).map((item) => item.localId)),
    );
    const snapshot = buildRolesSnapshot(itemsRef.current);
    persistedSnapshotRef.current = JSON.stringify(snapshot);
    return snapshot as unknown as Record<string, unknown>;
  }, []);

  useEffect(() => {
    onRegisterCaptureDraft?.(captureDraft);
    return () => onRegisterCaptureDraft?.(null);
  }, [captureDraft, onRegisterCaptureDraft]);

  useEffect(() => {
    onRegisterCaptureInitialSnapshot?.(captureInitialSnapshot);
    return () => onRegisterCaptureInitialSnapshot?.(null);
  }, [captureInitialSnapshot, onRegisterCaptureInitialSnapshot]);

  const visibleItems = useMemo(() => {
    const query = filterText.trim().toLowerCase();
    return items.filter((item) => {
      const visibleByLifecycle =
        item.active || (isEditing && (baselineActiveIds?.has(item.localId) ?? false));
      const visibleByType = !typeFilter || item.roleName === typeFilter;
      const visibleBySearch =
        !query ||
        item.label.toLowerCase().includes(query) ||
        item.roleName.toLowerCase().includes(query) ||
        item.key.toLowerCase().includes(query) ||
        (item.description && item.description.toLowerCase().includes(query));
      return visibleByLifecycle && visibleByType && visibleBySearch;
    });
  }, [items, filterText, typeFilter, isEditing, baselineActiveIds]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((item) => item.localId === selectedId)) {
      setSelectedId(visibleItems[0]?.localId ?? null);
    }
  }, [selectedId, visibleItems]);

  const selectedItem = items.find((item) => item.localId === selectedId) ?? null;

  const handleAddNew = () => {
    const newItem = createRoleDraftItem();
    setItems((curr) => [newItem, ...curr]);
    setSelectedId(newItem.localId);
  };

  const handlePatchItem = (patch: Partial<RoleDraftItem>) => {
    if (!selectedId) return;
    setItems((curr) =>
      curr.map((item) => (item.localId === selectedId ? { ...item, ...patch } : item)),
    );
  };

  const handleInactivate = () => {
    if (!selectedId) return;
    handlePatchItem({ active: false });
  };
  const handleReactivate = () => {
    if (!selectedId) return;
    handlePatchItem({ active: true });
  };
  const handleRemoveNew = () => {
    if (!selectedId) return;
    const remaining = items.filter((item) => item.localId !== selectedId);
    setItems(remaining);
    setSelectedId(remaining[0]?.localId ?? null);
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 rounded-[12px] bg-status-red-soft p-3.5 text-[0.84rem] text-status-red">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Coluna Master */}
        <div className="vt-card flex min-h-[580px] flex-col p-4">
          <StudioCollectionHeader
            title="Todos os Papéis"
            showSearch={showSearch}
            searchLabel="Buscar papel..."
            onToggleSearch={() => setShowSearch((prev) => !prev)}
          >
            {canMutate && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddNew}
                title="Novo papel"
                aria-label="Novo papel"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </StudioCollectionHeader>

          <RoleTypeFilterChips value={typeFilter} onChange={setTypeFilter} />

          {showSearch && (
            <div className="mb-3 mt-2">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Buscar papel..."
                className="w-full rounded-[10px] border border-app-border bg-app-panel px-3 py-1.5 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
                autoFocus
              />
            </div>
          )}

          <div className="-mx-1 mt-2 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-1 py-1">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-[0.82rem] text-app-muted">
                Carregando papéis...
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-app-border p-6 text-center text-app-muted">
                <span className="text-[0.82rem]">Nenhum papel encontrado</span>
              </div>
            ) : (
              visibleItems.map((item) => {
                const isSelected = item.localId === selectedId;
                const RoleIcon = partyRoleTypeIcon(item.roleName);
                return (
                  <div
                    key={item.localId}
                    role="button"
                    tabIndex={0}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedId(item.localId)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(item.localId);
                      }
                    }}
                    className={`group flex w-full items-center gap-1.5 rounded-[10px] border px-2 py-1.5 text-left text-[0.85rem] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-accent ${
                      isSelected
                        ? 'vt-yellow-selected text-app-text font-semibold'
                        : 'border-transparent text-app-text vt-hover-muted'
                    }`}
                  >
                    <RoleIcon className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{item.label || 'Sem nome'}</span>
                    {!item.active && (
                      <span className="shrink-0 rounded bg-[var(--surface-muted)] px-1 py-0.2 text-[0.65rem] text-app-muted">
                        Inativo
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        {/* Coluna Detail */}
        <div className="min-w-0">
          {selectedItem ? (
            <RoleDetail
              item={selectedItem}
              canMutate={canMutate}
              onChange={handlePatchItem}
              onInactivate={handleInactivate}
              onReactivate={handleReactivate}
              onRemoveNew={handleRemoveNew}
            />
          ) : (
            <div className="vt-card flex min-h-[580px] flex-col items-center justify-center border-dashed border-app-border p-8 text-center text-app-muted">
              <h4 className="mt-3 font-semibold text-app-text">Nenhum papel selecionado</h4>
              <p className="mt-1 text-[0.82rem]">
                Selecione um papel na lista para visualizar e editar seus dados.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
