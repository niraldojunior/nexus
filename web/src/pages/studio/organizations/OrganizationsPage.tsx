import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Building2, Plus, Trash2 } from 'lucide-react';
import {
  createPartyRole,
  deletePartyRole,
  listParties,
  listPartyRoles,
  updatePartyRole,
  type Characteristic,
  type PartyRole,
  type TimePeriod,
} from '../../../services/partyApi';
import { listPartyRoleTypes, type PartyRoleType } from '../../../services/partyRoleTypeApi';
import { getStudioStatus, saveStudioDraft } from '../../../services/studioApi';
import { Button } from '../../../components/ui';
import { StudioCollectionHeader } from '../../../components/studio/StudioCollectionHeader';
import { OrganizationDetail } from './OrganizationDetail';
import {
  buildOrganizationsSnapshot,
  createOrganizationDraftItem,
  draftFromParty,
  type OrganizationDraftItem,
  type OrganizationsSnapshot,
} from './organizationDraft';
import { parsePartyViewParams, writePartyViewParams } from '../../../utils/partyViewState';

export type OrganizationsPageProps = {
  canEdit: boolean;
  canAdmin: boolean;
  isEditing: boolean;
  onRegisterCaptureDraft?: (fn: (() => Promise<void>) | null) => void;
  onRegisterCaptureInitialSnapshot?: (fn: (() => Promise<Record<string, unknown>>) | null) => void;
};

export function OrganizationsPage({
  canEdit,
  isEditing,
  onRegisterCaptureDraft,
  onRegisterCaptureInitialSnapshot,
}: OrganizationsPageProps) {
  const [items, setItems] = useState<OrganizationDraftItem[]>([]);
  const [availableRoleTypes, setAvailableRoleTypes] = useState<PartyRoleType[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterText, setFilterText] = useState('');
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
      const [parties, roles, roleTypes, status] = await Promise.all([
        listParties({ limit: 200, offset: 0, partyType: 'Organization' }),
        listPartyRoles({ limit: 500, offset: 0, status: 'active' }),
        listPartyRoleTypes(),
        getStudioStatus('organizations').catch(() => ({ draftVersion: null })),
      ]);

      setAvailableRoleTypes(roleTypes.filter((r) => r.active));

      const rolesByPartyId = new Map<string, PartyRole[]>();
      for (const role of roles) {
        const list = rolesByPartyId.get(role.partyId) ?? [];
        list.push(role);
        rolesByPartyId.set(role.partyId, list);
      }

      const canonicalDrafts = parties.map((p) => draftFromParty(p, rolesByPartyId.get(p.id) ?? []));

      // Se existir snapshot de draft aberto
      let finalItems = canonicalDrafts;
      if (
        status.draftVersion &&
        (status.draftVersion.snapshot as OrganizationsSnapshot).organizations
      ) {
        const snapshotOrgs = (status.draftVersion.snapshot as OrganizationsSnapshot).organizations;
        const canonicalById = new Map(canonicalDrafts.map((d) => [d.localId, d]));
        finalItems = snapshotOrgs.map((snap) => {
          const matched = snap.id ? canonicalById.get(snap.id) : null;
          if (matched) {
            return {
              ...matched,
              name: snap.name,
              status: snap.status,
            };
          }
          return {
            localId: snap.id ?? `temp-org-${Date.now()}`,
            persistedId: snap.id,
            name: snap.name,
            status: snap.status,
            partyType: 'Organization',
            identifications: [],
            contacts: [],
            addresses: [],
            roles: snap.id ? (rolesByPartyId.get(snap.id) ?? []) : [],
          };
        });
      }

      setItems(finalItems);
      checksumRef.current = status.draftVersion?.checksum;
      persistedSnapshotRef.current = JSON.stringify(buildOrganizationsSnapshot(finalItems));

      // Deep linking via query param ?org=<id>
      const urlParams = parsePartyViewParams(window.location.search);
      const initialSelected = urlParams.orgId
        ? finalItems.find(
            (item) => item.localId === urlParams.orgId || item.persistedId === urlParams.orgId,
          )
        : null;

      setSelectedId(initialSelected ? initialSelected.localId : (finalItems[0]?.localId ?? null));
      setError(null);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Falha ao carregar lista de organizações.',
      );
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

  // Sincroniza query param ?org=<id>
  useEffect(() => {
    if (!selectedId) return;
    const current = items.find((item) => item.localId === selectedId);
    const idToPersist = current?.persistedId ?? current?.localId;
    if (idToPersist) {
      writePartyViewParams('organizations', idToPersist);
    }
  }, [selectedId, items]);

  // Registro de snapshot para governança
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const captureDraft = useCallback(async () => {
    const snapshot = buildOrganizationsSnapshot(itemsRef.current);
    const serializedSnapshot = JSON.stringify(snapshot);
    if (persistedSnapshotRef.current === serializedSnapshot) return;

    const checksum =
      checksumRef.current ?? (await getStudioStatus('organizations')).draftVersion?.checksum;
    const saved = await saveStudioDraft(
      'organizations',
      snapshot as unknown as Record<string, unknown>,
      checksum,
    );
    checksumRef.current = saved.checksum;
    persistedSnapshotRef.current = serializedSnapshot;
  }, []);

  const captureInitialSnapshot = useCallback(async () => {
    setBaselineActiveIds(
      new Set(
        itemsRef.current.filter((item) => item.status === 'active').map((item) => item.localId),
      ),
    );
    const snapshot = buildOrganizationsSnapshot(itemsRef.current);
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
        item.status === 'active' || (isEditing && (baselineActiveIds?.has(item.localId) ?? false));
      const visibleBySearch =
        !query ||
        item.name.toLowerCase().includes(query) ||
        (item.legalName && item.legalName.toLowerCase().includes(query)) ||
        (item.tradingName && item.tradingName.toLowerCase().includes(query)) ||
        (item.description && item.description.toLowerCase().includes(query));
      return visibleByLifecycle && visibleBySearch;
    });
  }, [items, filterText, isEditing, baselineActiveIds]);

  useEffect(() => {
    if (selectedId && !visibleItems.some((item) => item.localId === selectedId)) {
      setSelectedId(visibleItems[0]?.localId ?? null);
    }
  }, [selectedId, visibleItems]);

  const selectedItem = items.find((item) => item.localId === selectedId) ?? null;

  const handleAddNew = () => {
    const newItem = createOrganizationDraftItem();
    setItems((curr) => [newItem, ...curr]);
    setSelectedId(newItem.localId);
  };

  const handlePatchItem = (patch: Partial<OrganizationDraftItem>) => {
    if (!selectedId) return;
    setItems((curr) =>
      curr.map((item) => (item.localId === selectedId ? { ...item, ...patch } : item)),
    );
  };

  const handleInactivate = () => {
    if (!selectedId) return;
    handlePatchItem({ status: 'terminated' });
  };

  const handleInactivateItem = (localId: string) => {
    setItems((curr) =>
      curr.map((item) => (item.localId === localId ? { ...item, status: 'terminated' } : item)),
    );
  };

  const handleReactivate = () => {
    if (!selectedId) return;
    handlePatchItem({ status: 'active' });
  };

  const handleRemoveNew = () => {
    if (!selectedId) return;
    const remaining = items.filter((item) => item.localId !== selectedId);
    setItems(remaining);
    setSelectedId(remaining[0]?.localId ?? null);
  };

  const handleAssignRole = async (
    roleName: string,
    roleTypeId: string,
    characteristics: Characteristic[],
    validFor?: TimePeriod,
  ) => {
    if (!selectedItem || !selectedItem.persistedId) return;
    const createdRole = await createPartyRole({
      partyId: selectedItem.persistedId,
      name: roleName,
      roleTypeId,
      partyRoleCharacteristic: characteristics,
      validFor,
    });
    handlePatchItem({
      roles: [...selectedItem.roles, createdRole],
    });
  };

  const handleUpdateRole = async (
    roleId: string,
    characteristics: Characteristic[],
    validFor?: TimePeriod,
  ) => {
    if (!selectedItem) return;
    const updatedRole = await updatePartyRole(roleId, {
      partyRoleCharacteristic: characteristics,
      validFor,
    });
    handlePatchItem({
      roles: selectedItem.roles.map((r) => (r.id === roleId ? updatedRole : r)),
    });
  };

  const handleRemoveRole = async (roleId: string) => {
    if (!selectedItem) return;
    await deletePartyRole(roleId);
    handlePatchItem({
      roles: selectedItem.roles.filter((r) => r.id !== roleId),
    });
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
            title="Todas as Organizações"
            showSearch={showSearch}
            searchLabel="Buscar organização..."
            onToggleSearch={() => setShowSearch((prev) => !prev)}
          >
            {canMutate && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleAddNew}
                title="Incluir organização"
                aria-label="Incluir organização"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </StudioCollectionHeader>

          {showSearch && (
            <div className="mb-3">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Buscar por razão social ou nome..."
                className="w-full rounded-[10px] border border-app-border bg-app-panel px-3 py-1.5 text-[0.82rem] text-app-text outline-none focus:border-app-accent"
                autoFocus
              />
            </div>
          )}

          <div className="-mx-1 mt-2 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-1 py-1">
            {loading ? (
              <div className="flex h-32 items-center justify-center text-[0.82rem] text-app-muted">
                Carregando organizações...
              </div>
            ) : visibleItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-[12px] border border-dashed border-app-border p-6 text-center text-app-muted">
                <Building2 className="h-6 w-6 opacity-40" />
                <span className="mt-2 text-[0.82rem]">Nenhuma organização encontrada</span>
              </div>
            ) : (
              visibleItems.map((item) => {
                const isSelected = item.localId === selectedId;
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
                    {item.logoUrl ? (
                      <img
                        src={item.logoUrl}
                        alt=""
                        className="h-4 w-4 shrink-0 object-contain"
                        aria-hidden="true"
                      />
                    ) : (
                      <Building2 className="h-4 w-4 shrink-0 text-app-muted" aria-hidden="true" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.name || 'Sem nome'}</span>
                    {canMutate && item.persistedId && item.status === 'active' && (
                      <button
                        type="button"
                        title="Inativar organização"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleInactivateItem(item.localId);
                        }}
                        className="hidden shrink-0 rounded p-1 text-app-muted vt-hover-muted hover:text-status-red group-hover:flex"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
            <OrganizationDetail
              item={selectedItem}
              canMutate={canMutate}
              availableRoleTypes={availableRoleTypes}
              onChange={handlePatchItem}
              onInactivate={handleInactivate}
              onReactivate={handleReactivate}
              onRemoveNew={handleRemoveNew}
              onAssignRole={handleAssignRole}
              onUpdateRole={handleUpdateRole}
              onRemoveRole={handleRemoveRole}
            />
          ) : (
            <div className="vt-card flex min-h-[580px] flex-col items-center justify-center border-dashed border-app-border p-8 text-center text-app-muted">
              <Building2 className="h-12 w-12 opacity-30" />
              <h4 className="mt-3 font-semibold text-app-text">Nenhuma organização selecionada</h4>
              <p className="mt-1 text-[0.82rem]">
                Selecione uma organização na lista para visualizar dados cadastrais, identificações,
                contatos, endereços e papéis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
