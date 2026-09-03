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
  listResourceStatusCatalog,
  type PhysicalResourceDetail,
  type PhysicalResourcePayload,
  type ResourceStatusCatalogEntry,
} from '../../services/resourceApi';
import { IconInfoRow } from './IconInfoRow';
import { InlineEditRow } from './InlineEditRow';
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
export function ResourceOverviewTab({ detail, canEdit, onPatch, onOpenResource }: ResourceOverviewTabProps) {
  const { resource, specification, statusCatalogEntry, parent, place, location, servingSite, project } =
    detail;

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

  const manufacturer = specification.manufacturer;
  const model = specification.model;
  const resourceLayer = specification.resourceLayer;
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

  const notes =
    resource.characteristic?.find((c) => c.name === 'notes' || c.name === 'observacao')
      ?.value as string | undefined;

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

      <IconInfoRow icon={Cpu} hint="Modelo" value={model ?? '—'} />

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

      {parent ? (
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

      <IconInfoRow icon={MapPin} hint="Endereço" value={placeFormatted ?? '—'} />

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

        <IconInfoRow icon={FileText} hint="Observações" value={notes ?? '—'} />
      </div>
    </div>
  );
}
