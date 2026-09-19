import { useEffect, useMemo, useState } from 'react';
import { FolderTree, Layers, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { GeoSiteRole, GeoSpecCategory } from '../../../services/geoApi';
import { Button } from '../../../components/ui';
import {
  buildGeoCharacteristicPayload,
  geoCharacteristicRowsFrom,
  type GeoCharacteristicRow,
} from '../../../utils/geoCharacteristicsForm';
import type { LocationModelDraftSpec } from './locationModelDraft';
import { LocationCharacteristicFormModal } from './LocationCharacteristicFormModal';
import {
  LOCATION_CATEGORY_LABELS,
  locationCategoryIcon,
  locationCategoryIconTone,
  locationCategoryLabel,
} from './locationCategoryPresentation';
import { VisualIdentityPickerModal } from '../../../components/VisualIdentityPickerModal';
import { useVisualIdentityPreviewUrl } from '../../../hooks/useVisualIdentityPreviewUrl';

const ROLE_LABELS: Record<GeoSiteRole, string> = {
  grouping: 'Agrupamento',
  network: 'Recurso',
  property: 'Imobiliário',
  service: 'Serviço',
};

const VALUE_TYPE_LABELS: Record<string, string> = {
  string: 'Texto',
  integer: 'Inteiro',
  decimal: 'Decimal',
  boolean: 'Booleano',
  date: 'Data',
  list: 'Lista de opções',
  json: 'JSON livre',
};

type DetailTab = 'overview' | 'characteristics' | 'relations';

export type LocationSpecDetailProps = {
  spec: LocationModelDraftSpec;
  allSpecs: LocationModelDraftSpec[];
  canEdit: boolean;
  isEditing: boolean;
  wasActiveAtBaseline: boolean;
  onPatch: (patch: Partial<LocationModelDraftSpec>) => void;
  onRemoveNew: () => void;
  onInactivate: () => void;
  onReactivate: () => void;
};

export function LocationSpecDetail({
  spec,
  allSpecs,
  canEdit,
  isEditing,
  wasActiveAtBaseline,
  onPatch,
  onRemoveNew,
  onInactivate,
  onReactivate,
}: LocationSpecDetailProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [characteristicModalOpen, setCharacteristicModalOpen] = useState(false);
  const [editingCharacteristicRow, setEditingCharacteristicRow] =
    useState<GeoCharacteristicRow | null>(null);
  const [characteristicDeletingKey, setCharacteristicDeletingKey] = useState<string | null>(null);
  const [visualIdentityPickerOpen, setVisualIdentityPickerOpen] = useState(false);
  const canMutate = canEdit && isEditing;
  const characteristicRows = useMemo(
    () => geoCharacteristicRowsFrom(spec.specCharacteristic),
    [spec.specCharacteristic],
  );
  const relationsCount = spec.allowedParentLocalIds.length + spec.allowedChildLocalIds.length;
  const otherSpecs = allSpecs.filter(
    (item) => item.localId !== spec.localId && item.lifecycleStatus === 'Active',
  );

  useEffect(() => {
    setActiveTab('overview');
    setCharacteristicModalOpen(false);
    setVisualIdentityPickerOpen(false);
  }, [spec.localId]);

  const patchCharacteristics = (rows: GeoCharacteristicRow[]) =>
    onPatch({ specCharacteristic: buildGeoCharacteristicPayload(rows) });

  const openCharacteristic = (row: GeoCharacteristicRow) => {
    setEditingCharacteristicRow(row);
    setCharacteristicModalOpen(true);
  };

  const saveCharacteristic = (row: GeoCharacteristicRow) => {
    const exists = characteristicRows.some((item) => item.key === row.key);
    patchCharacteristics(
      exists
        ? characteristicRows.map((item) => (item.key === row.key ? row : item))
        : [...characteristicRows, row],
    );
  };

  const baselineCharacteristic = editingCharacteristicRow
    ? spec.baselineSpecCharacteristic.find(
        (item) =>
          item.name.trim().toLowerCase() === editingCharacteristicRow.name.trim().toLowerCase(),
      )
    : undefined;
  const requiresMigrationDefault = Boolean(
    spec.persistedId && (!baselineCharacteristic || !baselineCharacteristic.mandatory),
  );

  const deleteCharacteristic = (row: GeoCharacteristicRow) => {
    setCharacteristicDeletingKey(row.key);
    patchCharacteristics(characteristicRows.filter((item) => item.key !== row.key));
    setCharacteristicDeletingKey(null);
  };

  const toggleRelation = (
    field: 'allowedParentLocalIds' | 'allowedChildLocalIds',
    localId: string,
  ) => {
    const current = spec[field];
    onPatch({
      [field]: current.includes(localId)
        ? current.filter((id) => id !== localId)
        : [...current, localId],
    });
  };

  const CategoryIcon = locationCategoryIcon(spec.category);
  const visualIdentity = spec.visualIdentity ?? null;
  // Fora do mapa, a identidade canônica é exibida como glifo, sem a moldura contextual LOCAL.
  const visualIdentityPreviewUrl = useVisualIdentityPreviewUrl(visualIdentity, 40, {
    shape: 'none',
    color: '#0284c7',
  });

  return (
    <div className="vt-card flex h-full flex-col overflow-hidden p-0">
      <div className="px-4 pb-3 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {visualIdentityPreviewUrl ? (
              <div
                title="A identidade visual é editada na aba Geral"
                className="flex h-10 w-10 shrink-0 items-center justify-center text-sky-600"
              >
                <img src={visualIdentityPreviewUrl} alt="" className="h-5 w-5" />
              </div>
            ) : (
              <div
                title="A identidade visual é editada na aba Geral"
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border ${locationCategoryIconTone(spec.category)}`}
              >
                <CategoryIcon className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate font-bold leading-tight text-app-text">{spec.name}</h3>
              <span
                className="mt-0.5 block"
                style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}
              >
                {locationCategoryLabel(spec.category)}
              </span>
            </div>
          </div>
          {canMutate && (
            <div className="flex shrink-0 items-center gap-2">
              {!spec.persistedId ? (
                <Button
                  variant="danger"
                  size="sm"
                  iconLeft={<Trash2 className="h-4 w-4" />}
                  onClick={onRemoveNew}
                >
                  Remover
                </Button>
              ) : (
                <>
                  {!spec.bootstrapProtected && spec.lifecycleStatus === 'Active' && (
                    <Button
                      variant="danger"
                      size="sm"
                      iconLeft={<Trash2 className="h-4 w-4" />}
                      onClick={onInactivate}
                    >
                      Inativar
                    </Button>
                  )}
                  {spec.lifecycleStatus !== 'Active' && wasActiveAtBaseline && (
                    <Button
                      variant="secondary"
                      size="sm"
                      iconLeft={<RotateCcw className="h-4 w-4" />}
                      onClick={onReactivate}
                    >
                      Reativar
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        <div className="mt-3.5 flex">
          <div className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1">
            {(
              [
                ['overview', 'Geral'],
                ['characteristics', `Características (${spec.specCharacteristic.length})`],
                ['relations', `Relações (${relationsCount})`],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${activeTab === tab ? 'bg-app-panel font-semibold text-app-text shadow-sm' : 'text-app-muted hover:text-app-text'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-4">
        {activeTab === 'overview' &&
          (canMutate ? (
            <div className="space-y-5">
              <label className="block text-[0.8rem] font-semibold text-app-text">
                Nome *
                <input
                  value={spec.name}
                  onChange={(event) => onPatch({ name: event.target.value })}
                  placeholder="Ex.: Central Office, Pavimento..."
                  className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.88rem] font-normal text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-[0.8rem] font-semibold text-app-text">
                  Categoria
                  <select
                    value={spec.category}
                    onChange={(event) =>
                      onPatch({ category: event.target.value as GeoSpecCategory })
                    }
                    className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.88rem] font-normal text-app-text outline-none focus:border-app-accent"
                  >
                    {Object.entries(LOCATION_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[0.8rem] font-semibold text-app-text">
                  Papel funcional
                  <select
                    value={spec.siteRole}
                    onChange={(event) => onPatch({ siteRole: event.target.value as GeoSiteRole })}
                    className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.88rem] font-normal text-app-text outline-none focus:border-app-accent"
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-app-border bg-[var(--surface-muted)] p-4">
                <div className="min-w-0">
                  <span className="block text-[0.8rem] font-semibold text-app-text">
                    Identidade visual
                  </span>
                  <span className="block text-[0.76rem] text-app-muted mt-0.5">
                    Glifo ou imagem que representa este tipo de local em toda a plataforma — cor,
                    tamanho e opacidade ficam na Experiência no Mapa.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setVisualIdentityPickerOpen(true)}
                  className="flex shrink-0 items-center gap-2 rounded-[10px] border border-app-border bg-app-panel px-3 py-2 text-[0.82rem] font-semibold text-app-text shadow-sm transition hover:border-app-accent-border hover:bg-app-accent-soft active:scale-95"
                >
                  {visualIdentityPreviewUrl ? (
                    <img src={visualIdentityPreviewUrl} alt="" className="h-5 w-5" />
                  ) : (
                    <CategoryIcon className="h-4 w-4" />
                  )}
                  Alterar
                </button>
              </div>
              <label className="block text-[0.8rem] font-semibold text-app-text">
                Descrição
                <textarea
                  rows={3}
                  value={spec.description ?? ''}
                  onChange={(event) => onPatch({ description: event.target.value })}
                  placeholder="Descreva a finalidade deste tipo de local..."
                  className="mt-1.5 w-full rounded-[14px] border border-app-border bg-app-panel px-3 py-2 text-[0.88rem] font-normal text-app-text outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent"
                />
              </label>
            </div>
          ) : (
            <div className="space-y-6">
              {spec.description?.trim() && (
                <div>
                  <h3
                    className="mb-2"
                    style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}
                  >
                    Descrição
                  </h3>
                  <p className="text-[0.92rem] leading-relaxed text-app-text">{spec.description}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-[10px] border border-app-border p-4">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                    Categoria
                  </span>
                  <p className="mt-1 text-[0.95rem] font-medium text-app-text">
                    {locationCategoryLabel(spec.category)}
                  </p>
                </div>
                <div className="rounded-[10px] border border-app-border p-4">
                  <span style={{ font: 'var(--text-label)', color: 'var(--text-tertiary)' }}>
                    Papel funcional
                  </span>
                  <p className="mt-1 text-[0.95rem] font-medium text-app-text">
                    {ROLE_LABELS[spec.siteRole]}
                  </p>
                </div>
              </div>
            </div>
          ))}

        {activeTab === 'characteristics' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[0.88rem] font-semibold text-app-text">
                Características ({characteristicRows.length})
              </h3>
              {canMutate && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  iconLeft={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setEditingCharacteristicRow(null);
                    setCharacteristicModalOpen(true);
                  }}
                >
                  Adicionar característica
                </Button>
              )}
            </div>
            {characteristicRows.length === 0 ? (
              <div className="rounded-[18px] border border-dashed border-app-border p-8 text-center text-app-muted">
                <p className="text-[0.88rem] font-medium">Nenhuma característica cadastrada.</p>
              </div>
            ) : (
              <div className="divide-y divide-app-border overflow-hidden rounded-[18px] border border-app-border">
                {characteristicRows.map((row) => (
                  <div
                    key={row.key}
                    onClick={() => openCharacteristic(row)}
                    role="button"
                    tabIndex={0}
                    title={row.description || undefined}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openCharacteristic(row);
                      }
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 transition vt-hover-muted"
                  >
                    <div className="min-w-0">
                      <h4 className="truncate text-[0.88rem] font-semibold text-app-text">
                        {row.name}
                      </h4>
                      <p className="truncate text-[0.78rem] text-app-muted">
                        {row.group ? `${row.group} · ` : ''}
                        {VALUE_TYPE_LABELS[row.valueType] ?? row.valueType}
                      </p>
                    </div>
                    {canMutate && (
                      <button
                        type="button"
                        title="Remover característica"
                        onClick={(event) => {
                          event.stopPropagation();
                          deleteCharacteristic(row);
                        }}
                        disabled={characteristicDeletingKey === row.key}
                        className="hidden shrink-0 rounded-xl border border-transparent p-1.5 text-status-red transition hover:border-status-red hover:bg-status-red-soft disabled:opacity-50 group-hover:flex group-focus-within:flex"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'relations' && (
          <div className="grid gap-4 md:grid-cols-2">
            {(['allowedParentLocalIds', 'allowedChildLocalIds'] as const).map((field) => {
              const parent = field === 'allowedParentLocalIds';
              const ids = spec[field];
              return (
                <div key={field} className="rounded-[10px] border border-app-border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    {parent ? (
                      <FolderTree className="h-4 w-4 text-amber-600" />
                    ) : (
                      <Layers className="h-4 w-4 text-sky-600" />
                    )}
                    <h4 className="text-[0.85rem] font-semibold text-app-text">
                      {parent ? 'Pais permitidos' : 'Filhos permitidos'}
                    </h4>
                  </div>
                  {canMutate ? (
                    <div className="max-h-56 space-y-1 overflow-y-auto">
                      {otherSpecs.length === 0 ? (
                        <p className="text-[0.8rem] italic text-app-muted">
                          Nenhuma outra especificação ativa.
                        </p>
                      ) : (
                        otherSpecs.map((item) => (
                          <label
                            key={item.localId}
                            className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[0.82rem] text-app-text vt-hover-muted"
                          >
                            <input
                              type="checkbox"
                              checked={ids.includes(item.localId)}
                              onChange={() => toggleRelation(field, item.localId)}
                              className="h-4 w-4 rounded border-app-border text-app-accent focus:ring-app-accent"
                            />
                            {item.name}
                          </label>
                        ))
                      )}
                    </div>
                  ) : ids.length === 0 ? (
                    <p className="text-[0.8rem] italic text-app-muted">
                      {parent
                        ? 'Nenhum pai permitido (raiz do modelo).'
                        : 'Nenhum filho permitido (folha do modelo).'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {ids.map((id) => (
                        <span
                          key={id}
                          className="rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1 text-[0.78rem] font-medium text-app-text"
                        >
                          {allSpecs.find((item) => item.localId === id)?.name ?? id}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <LocationCharacteristicFormModal
        isOpen={characteristicModalOpen}
        onClose={() => setCharacteristicModalOpen(false)}
        editingRow={editingCharacteristicRow}
        readOnly={!canMutate}
        existingNames={characteristicRows
          .filter((row) => row.key !== editingCharacteristicRow?.key)
          .map((row) => row.name)}
        requiresMigrationDefault={requiresMigrationDefault}
        onSave={saveCharacteristic}
      />

      <VisualIdentityPickerModal
        isOpen={visualIdentityPickerOpen}
        onClose={() => setVisualIdentityPickerOpen(false)}
        value={visualIdentity}
        title={`Identidade visual — ${spec.name}`}
        defaultIndustry="REAL_ESTATE"
        onSelect={(identity) => {
          onPatch({ visualIdentity: identity ?? undefined });
          setVisualIdentityPickerOpen(false);
        }}
      />
    </div>
  );
}
