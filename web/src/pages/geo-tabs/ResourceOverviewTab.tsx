import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  Barcode,
  Boxes,
  Building2,
  Calendar,
  CalendarClock,
  Cpu,
  Crosshair,
  Database,
  Factory,
  FileText,
  Fingerprint,
  FolderKanban,
  Hash,
  Layers,
  MapPin,
  Radio,
  Tag,
  Wrench,
} from 'lucide-react';
import {
  listResourceLayers,
  listResourceSpecifications,
  listResourceStatusCatalog,
  listResourceTypes,
  type PhysicalResourceDetail,
  type PhysicalResourcePayload,
  type ResourceLayer,
  type ResourceSpecification,
  type ResourceStatusCatalogEntry,
  type ResourceType,
} from '../../services/resourceApi';
import { PlacePicker } from '../../components/PlacePicker';
import { useResourceSearch } from '../../hooks/useResourceSearch';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';
import { IconInfoRow } from './IconInfoRow';
import { InlineEditRow } from './InlineEditRow';
import { ResourceModelCascadeFields } from './ResourceModelCascadeFields';
import { TonePill } from './TonePill';
import { formatCoordinatePoint } from './CoordinateStreetView';
import { formatDateBR } from '../../utils/helpers';
import { withSourceSuffix } from '../../utils/placeLabel';
import {
  ADMIN_STATE_LABELS,
  ADMIN_STATE_TONE,
  OP_STATE_LABELS,
  OP_STATE_TONE,
  USAGE_STATE_LABELS,
  USAGE_STATE_TONE,
  STATUS_BEHAVIOR_TONE,
} from '../../utils/resourceStateLabels';

export type ResourceOverviewTabProps = {
  detail: PhysicalResourceDetail;
  // Gate de UI (inventory.editor/platform.admin) — sem ele, todo campo abaixo vira texto
  // estático: sem alvo de clique, sem hover, sem cursor de edição (mesmo padrão de
  // SiteOverviewTab). Requerido junto com `onPatch`.
  canEdit: boolean;
  onPatch: (patch: PhysicalResourcePayload) => Promise<void>;
  // Trocar o Recurso Pai não é um PATCH — é a relação `containsAsChild` dedicada
  // (ver resourceApi.ts addResourceRelationship/removeResourceRelationship). `null` remove o
  // pai atual sem definir um novo.
  onChangeParent: (newParentId: string | null) => Promise<void>;
  onOpenResource?: (resourceId: string) => void;
};

// Nunca cai no id/hash técnico (issue #184 follow-up) — quando o place não tem rua
// (ex.: GeographicSite sem endereço vinculado), o campo fica vazio e "Localização"
// assume com as coordenadas, em vez de mostrar aqui um nome de site que não é endereço.
function formatPlaceAddress(place: PhysicalResourceDetail['place']): string | null {
  if (!place) return null;
  const parts = [
    place.streetType,
    place.streetName,
    place.streetNr ? `nº ${place.streetNr}` : undefined,
    place.locality,
    place.city,
    place.stateOrProvince,
    place.postcode,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return withSourceSuffix(parts.join(', '), place.sourceSystem);
}

// Perfil e ordem alinhados ao padrão Netwin/CDOE usado pelo time de negócio (ver plano
// da issue #184) — os 19 campos "padrão" + os 2 characteristics são sempre renderizados,
// mesmo vazios (`—`), em vez de somem quando não há valor.
export function ResourceOverviewTab({
  detail,
  canEdit,
  onPatch,
  onChangeParent,
  onOpenResource,
}: ResourceOverviewTabProps) {
  const { resource, specification, statusCatalogEntry, parent, place, location, servingSite, project } =
    detail;

  // Calculado cedo (antes dos hooks de estado abaixo) porque o `useState(notes ?? '')` da
  // Observação precisa do valor já pronto na primeira renderização — mesmo padrão de
  // `site.note` em SiteOverviewTab, que é prop e por isso não tem esse problema de ordem.
  const notes =
    resource.characteristic?.find((c) => c.name === 'notes' || c.name === 'observacao')
      ?.value as string | undefined;

  const [editingAdmin, setEditingAdmin] = useState(false);
  const [editingOp, setEditingOp] = useState(false);
  const [editingUsage, setEditingUsage] = useState(false);

  const [editingStatusCode, setEditingStatusCode] = useState(false);
  const [statusCatalog, setStatusCatalog] = useState<ResourceStatusCatalogEntry[] | null>(null);
  const [statusCatalogLoading, setStatusCatalogLoading] = useState(false);

  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [editingSerial, setEditingSerial] = useState(false);
  const [serialDraft, setSerialDraft] = useState('');
  const [editingPartNumber, setEditingPartNumber] = useState(false);
  const [partNumberDraft, setPartNumberDraft] = useState('');
  const [editingAsset, setEditingAsset] = useState(false);
  const [assetDraft, setAssetDraft] = useState('');

  const commitAdmin = async (value: string) => {
    setEditingAdmin(false);
    if (value === resource.administrativeState) return;
    await onPatch({ administrativeState: value as PhysicalResourcePayload['administrativeState'] });
  };

  const commitOp = async (value: string) => {
    setEditingOp(false);
    if (value === resource.operationalState) return;
    await onPatch({ operationalState: value as PhysicalResourcePayload['operationalState'] });
  };

  const commitUsage = async (value: string) => {
    setEditingUsage(false);
    if (value === resource.usageState) return;
    await onPatch({ usageState: value as PhysicalResourcePayload['usageState'] });
  };

  // Catálogo granular (43 códigos, filtrado por resourceType — status-catalog.ts) buscado sob
  // demanda ao abrir o editor, não a cada render (o backend serializa requisições).
  const startEditStatusCode = () => {
    setEditingStatusCode(true);
    if (statusCatalog || statusCatalogLoading) return;
    setStatusCatalogLoading(true);
    void listResourceStatusCatalog(resource.resourceType)
      .then((entries) => setStatusCatalog([...entries].sort((a, b) => a.sortOrder - b.sortOrder)))
      .finally(() => setStatusCatalogLoading(false));
  };

  const commitStatusCode = async (code: string) => {
    setEditingStatusCode(false);
    if (code === (resource.statusCode ?? '')) return;
    await onPatch({ statusCode: code });
  };

  // Cascata de Modelo (Topologia → Tipo → Fornecedor → Modelo, issue #186 — extensão). Reaponta
  // `resourceSpecificationId`; Fabricante/Tipo do recurso/Topologia continuam somente-leitura
  // porque são derivados da Specification escolhida (atualizam sozinhos após o PATCH recarregar
  // o painel). Catálogo buscado sob demanda, mesmo padrão lazy de startEditStatusCode acima.
  const [editingModel, setEditingModel] = useState(false);
  const [modelCatalog, setModelCatalog] = useState<{
    layers: ResourceLayer[];
    types: ResourceType[];
    specifications: ResourceSpecification[];
  } | null>(null);
  const [modelCatalogLoading, setModelCatalogLoading] = useState(false);

  const startEditModel = () => {
    setEditingModel(true);
    if (modelCatalog || modelCatalogLoading) return;
    setModelCatalogLoading(true);
    void Promise.all([
      listResourceLayers(),
      listResourceTypes(),
      listResourceSpecifications({ limit: 500, offset: 0, includeEnded: false }),
    ])
      .then(([layers, types, specifications]) => setModelCatalog({ layers, types, specifications }))
      .finally(() => setModelCatalogLoading(false));
  };

  const commitModel = (specificationId: string) => {
    setEditingModel(false);
    if (specificationId === specification.id) return;
    void onPatch({ resourceSpecificationId: specificationId });
  };

  const startEditLabel = () => {
    setLabelDraft(resource.label ?? '');
    setEditingLabel(true);
  };
  const commitLabel = () => {
    const next = labelDraft.trim();
    setEditingLabel(false);
    if (next !== (resource.label ?? '')) void onPatch({ label: next });
  };

  const startEditSerial = () => {
    setSerialDraft(resource.serialNumber ?? '');
    setEditingSerial(true);
  };
  const commitSerial = () => {
    const next = serialDraft.trim();
    setEditingSerial(false);
    if (next !== (resource.serialNumber ?? '')) void onPatch({ serialNumber: next });
  };

  const startEditPartNumber = () => {
    setPartNumberDraft(resource.partNumber ?? '');
    setEditingPartNumber(true);
  };
  const commitPartNumber = () => {
    const next = partNumberDraft.trim();
    setEditingPartNumber(false);
    if (next !== (resource.partNumber ?? '')) void onPatch({ partNumber: next });
  };

  const startEditAsset = () => {
    setAssetDraft(resource.assetReference ?? '');
    setEditingAsset(true);
  };
  const commitAsset = () => {
    const next = assetDraft.trim();
    setEditingAsset(false);
    if (next !== (resource.assetReference ?? '')) void onPatch({ assetReference: next });
  };

  // Endereço (place) — sempre um GeographicSite por convenção (memória geo-place-canonico-
  // site), mas o PlacePicker também aceita GeographicAddress, igual ao formulário de criação
  // (ResourcePage.tsx). `null` desvincula.
  const [editingPlace, setEditingPlace] = useState(false);
  const commitPlace = (next: { id: string; '@referredType': string } | null) => {
    setEditingPlace(false);
    if (next?.id === place?.id) return;
    void onPatch({ placeId: next?.id ?? null, placeType: next?.['@referredType'] });
  };

  // Recurso Pai — relação `containsAsChild`, não um PATCH (ver onChangeParent). Busca sob
  // demanda ao digitar, nunca o inventário inteiro.
  const [editingParent, setEditingParent] = useState(false);
  const [parentQuery, setParentQuery] = useState('');
  const { options: parentMatches } = useResourceSearch(parentQuery, resource.id);
  const startEditParent = () => {
    setParentQuery('');
    setEditingParent(true);
  };
  const selectParent = (candidateId: string) => {
    setEditingParent(false);
    if (candidateId === parent?.id) return;
    void onChangeParent(candidateId);
  };
  const clearParent = () => {
    setEditingParent(false);
    if (!parent) return;
    void onChangeParent(null);
  };

  // Observações vivem em `characteristic` (nome legado `observacao` ou o atual `notes`) e o
  // PATCH substitui o array inteiro (service.ts) — nunca enviar um array parcial, ou o grupo
  // `_origin` (C5, irrecuperável) some junto. Mesmo padrão de rascunho/blur de
  // SiteOverviewTab.commitNote.
  const [notesDraft, setNotesDraft] = useState(notes ?? '');
  const notesRef = useAutoResizeTextarea(notesDraft, 160);
  const commitNotes = () => {
    const next = notesDraft.trim();
    if (next === (notes ?? '')) return;
    const noteName =
      resource.characteristic?.find((c) => c.name === 'notes' || c.name === 'observacao')?.name ??
      'notes';
    const rest = (resource.characteristic ?? []).filter(
      (c) => c.name !== 'notes' && c.name !== 'observacao',
    );
    const nextCharacteristic = next ? [...rest, { name: noteName, value: next }] : rest;
    void onPatch({ characteristic: nextCharacteristic });
  };

  const manufacturer = specification.manufacturer;
  const model = specification.model;
  const resourceLayer = specification.resourceLayer;
  // `specification.resourceLayerId` já vem herdado do spread da spec completa (postgres-
  // repository.ts getPhysicalResourceDetail), mas o fallback pro id do `resourceLayer` aninhado
  // cobre qualquer serialização futura que só populee o objeto. Variável separada (não literal
  // inline na prop) para não disparar excess-property-check dos campos extras de detail
  // (resourceTypeName/manufacturer/model/resourceLayer) contra o tipo ResourceSpecification.
  const modelCascadeSpecification = {
    ...specification,
    resourceLayerId: specification.resourceLayerId ?? specification.resourceLayer?.id,
  };
  const placeFormatted = formatPlaceAddress(place);
  const coordinates =
    location?.geometryType === 'Point' && location.geometry?.type === 'Point'
      ? formatCoordinatePoint(location.geometry.coordinates)
      : null;

  const originSystem =
    resource.characteristic?.find(
      (c) => c.name === '_origin.system' || c.name === 'sourceSystem',
    )?.value as string | undefined;

  const legacySubstatus =
    resource.characteristic?.find((c) => c.name === 'substatus')?.value as string | undefined;

  return (
    <div className="grid gap-1">
      {canEdit ? (
        <InlineEditRow
          label="Estado administrativo"
          icon={Wrench}
          editing={editingAdmin}
          onActivate={() => setEditingAdmin(true)}
          value={
            resource.administrativeState ? (
              <TonePill
                label={ADMIN_STATE_LABELS[resource.administrativeState] ?? resource.administrativeState}
                tone={ADMIN_STATE_TONE[resource.administrativeState] ?? 'neutral'}
              />
            ) : (
              '—'
            )
          }
        >
          <select
            autoFocus
            value={resource.administrativeState ?? ''}
            onChange={(event) => void commitAdmin(event.target.value)}
            onBlur={() => setEditingAdmin(false)}
            aria-label="Estado administrativo"
            className="geo-input"
          >
            {Object.entries(ADMIN_STATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </InlineEditRow>
      ) : (
        <IconInfoRow
          icon={Wrench}
          hint="Estado administrativo"
          value={
            resource.administrativeState ? (
              <TonePill
                label={ADMIN_STATE_LABELS[resource.administrativeState] ?? resource.administrativeState}
                tone={ADMIN_STATE_TONE[resource.administrativeState] ?? 'neutral'}
              />
            ) : (
              '—'
            )
          }
        />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Estado operacional"
          icon={Activity}
          editing={editingOp}
          onActivate={() => setEditingOp(true)}
          value={
            resource.operationalState ? (
              <TonePill
                label={OP_STATE_LABELS[resource.operationalState] ?? resource.operationalState}
                tone={OP_STATE_TONE[resource.operationalState] ?? 'neutral'}
              />
            ) : (
              '—'
            )
          }
        >
          <select
            autoFocus
            value={resource.operationalState ?? ''}
            onChange={(event) => void commitOp(event.target.value)}
            onBlur={() => setEditingOp(false)}
            aria-label="Estado operacional"
            className="geo-input"
          >
            {Object.entries(OP_STATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </InlineEditRow>
      ) : (
        <IconInfoRow
          icon={Activity}
          hint="Estado operacional"
          value={
            resource.operationalState ? (
              <TonePill
                label={OP_STATE_LABELS[resource.operationalState] ?? resource.operationalState}
                tone={OP_STATE_TONE[resource.operationalState] ?? 'neutral'}
              />
            ) : (
              '—'
            )
          }
        />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Estado de uso"
          icon={Layers}
          editing={editingUsage}
          onActivate={() => setEditingUsage(true)}
          value={
            resource.usageState ? (
              <TonePill
                label={USAGE_STATE_LABELS[resource.usageState] ?? resource.usageState}
                tone={USAGE_STATE_TONE[resource.usageState] ?? 'neutral'}
              />
            ) : (
              '—'
            )
          }
        >
          <select
            autoFocus
            value={resource.usageState ?? ''}
            onChange={(event) => void commitUsage(event.target.value)}
            onBlur={() => setEditingUsage(false)}
            aria-label="Estado de uso"
            className="geo-input"
          >
            {Object.entries(USAGE_STATE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </InlineEditRow>
      ) : (
        <IconInfoRow
          icon={Layers}
          hint="Estado de uso"
          value={
            resource.usageState ? (
              <TonePill
                label={USAGE_STATE_LABELS[resource.usageState] ?? resource.usageState}
                tone={USAGE_STATE_TONE[resource.usageState] ?? 'neutral'}
              />
            ) : (
              '—'
            )
          }
        />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Estado"
          icon={AlertCircle}
          editing={editingStatusCode}
          onActivate={startEditStatusCode}
          value={
            statusCatalogEntry ? (
              <TonePill
                label={statusCatalogEntry.name}
                tone={STATUS_BEHAVIOR_TONE[statusCatalogEntry.behavior] ?? 'neutral'}
              />
            ) : (
              legacySubstatus ?? '—'
            )
          }
        >
          {statusCatalogLoading || !statusCatalog ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[0.82rem] text-app-muted">
              Carregando catálogo…
            </div>
          ) : (
            <select
              autoFocus
              value={resource.statusCode ?? ''}
              onChange={(event) => void commitStatusCode(event.target.value)}
              onBlur={() => setEditingStatusCode(false)}
              aria-label="Estado"
              className="geo-input"
            >
              <option value="">—</option>
              {statusCatalog.map((entry) => (
                <option key={entry.code} value={entry.code}>
                  {entry.name}
                </option>
              ))}
            </select>
          )}
        </InlineEditRow>
      ) : (
        <IconInfoRow
          icon={AlertCircle}
          hint="Estado"
          value={
            statusCatalogEntry ? (
              <TonePill
                label={statusCatalogEntry.name}
                tone={STATUS_BEHAVIOR_TONE[statusCatalogEntry.behavior] ?? 'neutral'}
              />
            ) : (
              legacySubstatus ?? '—'
            )
          }
        />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Etiqueta física"
          icon={Tag}
          editing={editingLabel}
          onActivate={startEditLabel}
          value={resource.label ?? '—'}
        >
          <input
            autoFocus
            value={labelDraft}
            onChange={(event) => setLabelDraft(event.target.value)}
            onBlur={commitLabel}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditingLabel(false);
            }}
            placeholder="Etiqueta física…"
            aria-label="Etiqueta física"
            className="geo-input"
          />
        </InlineEditRow>
      ) : (
        <IconInfoRow icon={Tag} hint="Etiqueta física" value={resource.label ?? '—'} />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Modelo"
          icon={Cpu}
          editing={editingModel}
          onActivate={startEditModel}
          value={model ?? '—'}
        >
          {modelCatalogLoading || !modelCatalog ? (
            <div className="flex items-center gap-1.5 px-1.5 py-1 text-[0.82rem] text-app-muted">
              Carregando catálogo…
            </div>
          ) : (
            <ResourceModelCascadeFields
              layers={modelCatalog.layers}
              types={modelCatalog.types}
              specifications={modelCatalog.specifications}
              currentSpecification={modelCascadeSpecification}
              onCommit={commitModel}
              onCancel={() => setEditingModel(false)}
            />
          )}
        </InlineEditRow>
      ) : (
        <IconInfoRow icon={Cpu} hint="Modelo" value={model ?? '—'} />
      )}

      <IconInfoRow
        icon={Factory}
        hint="Fabricante"
        value={manufacturer ? (manufacturer.name ?? manufacturer.id) : '—'}
      />

      <IconInfoRow
        icon={Boxes}
        hint="Tipo do recurso"
        value={specification.resourceTypeName || resource.resourceType || '—'}
      />

      <IconInfoRow icon={Radio} hint="Topologia" value={resourceLayer?.name ?? '—'} />

      {canEdit ? (
        <InlineEditRow
          label="Recurso Pai"
          icon={Boxes}
          editing={editingParent}
          onActivate={startEditParent}
          value={parent ? (parent.name ?? parent.id) : <span className="whitespace-nowrap">Nenhum</span>}
        >
          <div className="relative">
            <input
              autoFocus
              value={parentQuery}
              onChange={(event) => setParentQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') setEditingParent(false);
              }}
              placeholder="Digite o nome do recurso pai…"
              aria-label="Buscar recurso pai"
              className="geo-input"
            />
            <div className="fixed inset-0 z-40" onClick={() => setEditingParent(false)} />
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-[12px] border border-app-border bg-white py-1 shadow-soft">
              {parent ? (
                <button
                  type="button"
                  onClick={clearParent}
                  className="flex w-full items-center px-3 py-2 text-left text-[0.82rem] text-status-red transition hover:bg-status-red-soft"
                >
                  Remover recurso pai
                </button>
              ) : null}
              {parentMatches.length === 0 ? (
                <p className="px-3 py-2 text-[0.8rem] text-app-muted">
                  {parentQuery.trim() ? 'Nenhum recurso encontrado.' : 'Digite para buscar um recurso…'}
                </p>
              ) : (
                parentMatches.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => selectParent(candidate.id)}
                    className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft"
                  >
                    <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                    <span className="shrink-0 text-[0.7rem] text-app-muted">
                      {candidate.resourceType ?? ''}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </InlineEditRow>
      ) : parent ? (
        <div className="flex min-w-0 items-center gap-2.5 py-1" title="Recurso Pai">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-0 bg-transparent text-app-muted shadow-none ring-0"
            aria-hidden="true"
          >
            <Boxes className="h-[18px] w-[18px]" />
          </span>
          <span className="sr-only">Recurso Pai</span>
          <div className="min-w-0 flex-1">
            {onOpenResource ? (
              <button
                type="button"
                onClick={() => onOpenResource(parent.id)}
                className="truncate text-left text-[0.84rem] font-medium text-app-accent hover:underline"
              >
                {parent.name ?? parent.id}
              </button>
            ) : (
              <span className="break-words text-[0.84rem] leading-snug text-app-text">
                {parent.name ?? parent.id}
              </span>
            )}
          </div>
        </div>
      ) : (
        <IconInfoRow icon={Boxes} hint="Recurso Pai" value="—" />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Endereço"
          icon={MapPin}
          editing={editingPlace}
          onActivate={() => setEditingPlace(true)}
          value={placeFormatted ?? '—'}
        >
          <PlacePicker
            value={place ? { id: place.id, '@referredType': place['@referredType'] } : null}
            onChange={commitPlace}
            placeholder="Selecione um local…"
          />
        </InlineEditRow>
      ) : (
        <IconInfoRow icon={MapPin} hint="Endereço" value={placeFormatted ?? '—'} />
      )}

      {/* Mesma exclusão mútua do painel de Site (SiteOverviewTab): coordenadas só entram
          quando não há endereço detalhado — senão duplicariam a mesma informação. */}
      <IconInfoRow
        icon={Crosshair}
        hint="Localização"
        value={!placeFormatted && coordinates ? coordinates : '—'}
        mono={!placeFormatted && !!coordinates}
      />

      <IconInfoRow
        icon={Building2}
        hint="Estação abastecedora"
        value={servingSite ? (servingSite.name ?? servingSite.id) : '—'}
      />

      <IconInfoRow
        icon={FolderKanban}
        hint="Projeto de implantação"
        value={project ? (project.name ?? project.id) : '—'}
      />

      {canEdit ? (
        <InlineEditRow
          label="Imobilizado (SAP)"
          icon={Fingerprint}
          editing={editingAsset}
          onActivate={startEditAsset}
          value={<span className="font-mono text-[0.78rem]">{resource.assetReference ?? '—'}</span>}
        >
          <input
            autoFocus
            value={assetDraft}
            onChange={(event) => setAssetDraft(event.target.value)}
            onBlur={commitAsset}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditingAsset(false);
            }}
            placeholder="Nº do imobilizado (SAP)…"
            aria-label="Imobilizado (SAP)"
            className="geo-input font-mono"
          />
        </InlineEditRow>
      ) : (
        <IconInfoRow icon={Fingerprint} hint="Imobilizado (SAP)" value={resource.assetReference ?? '—'} mono />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Nº de série"
          icon={Barcode}
          editing={editingSerial}
          onActivate={startEditSerial}
          value={<span className="font-mono text-[0.78rem]">{resource.serialNumber ?? '—'}</span>}
        >
          <input
            autoFocus
            value={serialDraft}
            onChange={(event) => setSerialDraft(event.target.value)}
            onBlur={commitSerial}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditingSerial(false);
            }}
            placeholder="Nº de série…"
            aria-label="Nº de série"
            className="geo-input font-mono"
          />
        </InlineEditRow>
      ) : (
        <IconInfoRow icon={Barcode} hint="Nº de série" value={resource.serialNumber ?? '—'} mono />
      )}

      {canEdit ? (
        <InlineEditRow
          label="Part Number"
          icon={Hash}
          editing={editingPartNumber}
          onActivate={startEditPartNumber}
          value={<span className="font-mono text-[0.78rem]">{resource.partNumber ?? '—'}</span>}
        >
          <input
            autoFocus
            value={partNumberDraft}
            onChange={(event) => setPartNumberDraft(event.target.value)}
            onBlur={commitPartNumber}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setEditingPartNumber(false);
            }}
            placeholder="Part Number…"
            aria-label="Part Number"
            className="geo-input font-mono"
          />
        </InlineEditRow>
      ) : (
        <IconInfoRow icon={Hash} hint="Part Number" value={resource.partNumber ?? '—'} mono />
      )}

      <IconInfoRow icon={Calendar} hint="Criado em" value={formatDateBR(resource.createdAt) ?? '—'} />

      <IconInfoRow
        icon={CalendarClock}
        hint="Atualizado em"
        value={formatDateBR(resource.updatedAt) ?? '—'}
      />

      <div className="mt-1 border-t border-app-border pt-1">
        <IconInfoRow icon={Database} hint="Sistema de origem" value={originSystem ?? '—'} />

        {canEdit ? (
          <div className="flex min-w-0 items-start gap-2.5 py-1" title="Observações">
            <span
              className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted"
              aria-hidden="true"
            >
              <FileText className="h-[18px] w-[18px]" />
            </span>
            <span className="sr-only">Observações</span>
            <textarea
              ref={notesRef}
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              onBlur={commitNotes}
              placeholder="Adicione uma observação para este recurso…"
              rows={1}
              aria-label="Observações do recurso"
              className="-mx-1.5 -my-1 w-full resize-none rounded-[8px] border border-transparent bg-transparent px-1.5 py-1 text-[0.84rem] leading-snug text-app-text outline-none transition placeholder:text-app-muted hover:border-app-border focus:border-app-accent-border focus:bg-white"
            />
          </div>
        ) : (
          <IconInfoRow icon={FileText} hint="Observações" value={notes ?? '—'} />
        )}
      </div>
    </div>
  );
}
