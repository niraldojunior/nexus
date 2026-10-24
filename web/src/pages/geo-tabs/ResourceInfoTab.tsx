import { useEffect, useId, useState, type ReactNode } from 'react';
import {
  Activity,
  AlertCircle,
  Barcode,
  Boxes,
  Calendar,
  CalendarClock,
  Cpu,
  Crosshair,
  Factory,
  FileText,
  Fingerprint,
  FolderKanban,
  Layers,
  MapPin,
  Radio,
  Tag,
  User,
  Wrench,
} from 'lucide-react';
import {
  getResourceTypeCatalogContext,
  type PhysicalResourceDetail,
  type ResourceCharacteristic,
} from '../../services/resourceApi';
import { characteristicIcon } from './characteristicIcon';
import { IconInfoRow } from './IconInfoRow';
import { TonePill } from './TonePill';
import { formatCoordinatePoint } from './CoordinateStreetView';
import { ResourceInstanceCharacteristics } from './ResourceInstanceCharacteristics';
import { SiteIdentityIcon } from './SiteIdentityIcon';
import { ImageCharacteristicInput } from '../studio/resource-model/ImageCharacteristicInput';
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

type InfoSubTab = 'general' | 'model' | 'equipment';

const SUB_TABS: { id: InfoSubTab; label: string }[] = [
  { id: 'general', label: 'Geral' },
  { id: 'model', label: 'Modelo' },
  { id: 'equipment', label: 'Equipamento' },
];

export type ResourceInfoTabProps = {
  /** Detalhe do recurso; `null` enquanto carrega ou quando indisponível (ex.: Porta). */
  detail: PhysicalResourceDetail | null;
  /** Substitui a sub-aba Geral — a Porta tem visão própria (PortOverviewTab). */
  generalOverride?: ReactNode;
  /** Conteúdo extra ao fim da sub-aba Geral (Street View Início/Fim de geometrias de linha). */
  generalFooter?: ReactNode;
};

// Contexto do Tipo de Recurso no catálogo: o "Path" (Modelo) e as definições de nível instância
// (Equipamento, issue #273) vêm da MESMA resposta — uma só requisição por recurso aberto, porque o
// backend atende em série (AGENTS §3).
type CatalogInfo = { modelPath: string | null; instanceDefs: ResourceCharacteristic[] };

const EMPTY_CATALOG_INFO: CatalogInfo = { modelPath: null, instanceDefs: [] };

function useCatalogInfo(resourceTypeId: string | undefined): CatalogInfo {
  const [info, setInfo] = useState<CatalogInfo>(EMPTY_CATALOG_INFO);
  useEffect(() => {
    if (!resourceTypeId) {
      setInfo(EMPTY_CATALOG_INFO);
      return;
    }
    let cancelled = false;
    void getResourceTypeCatalogContext(resourceTypeId)
      .then((context) => {
        if (cancelled) return;
        // O último nó da cadeia é o próprio Tipo de Recurso — já aparece em "Tipo do recurso".
        const nodes = (context.catalogPaths[0]?.nodes ?? []).filter(
          (node) => node.kind !== 'RESOURCE_TYPE',
        );
        setInfo({
          modelPath: nodes.length ? nodes.map((node) => node.name).join(' \\ ') : null,
          instanceDefs: (context.resourceType.resourceTypeCharacteristic ?? []).filter(
            (characteristic) => characteristic.characteristicLevel === 'instance',
          ),
        });
      })
      .catch(() => {
        if (!cancelled) setInfo(EMPTY_CATALOG_INFO);
      });
    return () => {
      cancelled = true;
    };
  }, [resourceTypeId]);
  return info;
}

// Nunca cai no id/hash técnico (issue #184 follow-up) — quando o place não tem rua, o campo fica
// vazio em vez de mostrar um nome de site que não é endereço.
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

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function characteristicValue(detail: PhysicalResourceDetail, ...names: string[]): unknown {
  return detail.resource.characteristic?.find((c) => names.includes(c.name))?.value;
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[18px] border border-dashed border-app-border p-4 text-[0.88rem] text-app-muted">
      {children}
    </div>
  );
}

function GeneralSection({ detail }: { detail: PhysicalResourceDetail }) {
  const { resource, statusCatalogEntry, place, location, project, servingSite } = detail;

  const legacySubstatus = characteristicValue(detail, 'substatus') as string | undefined;
  const placeFormatted = formatPlaceAddress(place);
  const coordinates =
    location?.geometryType === 'Point' && location.geometry?.type === 'Point'
      ? formatCoordinatePoint(location.geometry.coordinates)
      : null;
  const owner = resource.relatedParty?.find((party) => party.role === 'infrastructure_owner');
  // Fallback somente-leitura: projeto da origem que não correspondeu a nenhum geo_project.
  const implementationProject = characteristicValue(detail, 'implementationProject');
  const projectName =
    project?.name ??
    project?.id ??
    (typeof implementationProject === 'string' && implementationProject
      ? implementationProject
      : null);
  const notes = characteristicValue(detail, 'notes', 'observacao') as string | undefined;

  // Grupos separados por traço: estados · Local Atendido · endereço · projeto e datas · observações.
  // A procedência (`_origin`, C5) não entra aqui — é característica e aparece com as demais.
  const groups: ReactNode[][] = [
    [
      statusCatalogEntry ? (
        <IconInfoRow
          key="status"
          icon={AlertCircle}
          hint="Estado"
          value={
            <TonePill
              label={statusCatalogEntry.name}
              tone={STATUS_BEHAVIOR_TONE[statusCatalogEntry.behavior] ?? 'neutral'}
            />
          }
        />
      ) : legacySubstatus ? (
        <IconInfoRow key="status" icon={AlertCircle} hint="Estado" value={legacySubstatus} />
      ) : null,
      resource.administrativeState ? (
        <IconInfoRow
          key="admin"
          icon={Wrench}
          hint="Estado administrativo"
          value={
            <TonePill
              label={
                ADMIN_STATE_LABELS[resource.administrativeState] ?? resource.administrativeState
              }
              tone={ADMIN_STATE_TONE[resource.administrativeState] ?? 'neutral'}
            />
          }
        />
      ) : null,
      resource.operationalState ? (
        <IconInfoRow
          key="operational"
          icon={Activity}
          hint="Estado operacional"
          value={
            <TonePill
              label={OP_STATE_LABELS[resource.operationalState] ?? resource.operationalState}
              tone={OP_STATE_TONE[resource.operationalState] ?? 'neutral'}
            />
          }
        />
      ) : null,
      resource.usageState ? (
        <IconInfoRow
          key="usage"
          icon={Layers}
          hint="Estado de uso"
          value={
            <TonePill
              label={USAGE_STATE_LABELS[resource.usageState] ?? resource.usageState}
              tone={USAGE_STATE_TONE[resource.usageState] ?? 'neutral'}
            />
          }
        />
      ) : null,
    ],
    [
      resource.label ? (
        <IconInfoRow key="label" icon={Tag} hint="Etiqueta física" value={resource.label} />
      ) : null,
      servingSite ? (
        <IconInfoRow
          key="servingSite"
          icon={<SiteIdentityIcon siteId={servingSite.id} />}
          hint="Local Atendido"
          value={servingSite.name ?? servingSite.id}
        />
      ) : null,
    ],
    [
      placeFormatted ? (
        <IconInfoRow key="address" icon={MapPin} hint="Endereço" value={placeFormatted} />
      ) : null,
      coordinates ? (
        <IconInfoRow key="location" icon={Crosshair} hint="Localização" value={coordinates} mono />
      ) : null,
    ],
    [
      projectName ? (
        <IconInfoRow
          key="project"
          icon={FolderKanban}
          hint="Projeto de implantação"
          value={projectName}
        />
      ) : null,
      owner ? (
        <IconInfoRow key="owner" icon={User} hint="Proprietário" value={owner.name ?? owner.id} />
      ) : null,
      formatDateBR(resource.createdAt) ? (
        <IconInfoRow
          key="createdAt"
          icon={Calendar}
          hint="Criado em"
          value={formatDateBR(resource.createdAt)}
        />
      ) : null,
      formatDateBR(resource.updatedAt) ? (
        <IconInfoRow
          key="updatedAt"
          icon={CalendarClock}
          hint="Atualizado em"
          value={formatDateBR(resource.updatedAt)}
        />
      ) : null,
    ],
    [notes ? <IconInfoRow key="notes" icon={FileText} hint="Observações" value={notes} /> : null],
  ];
  const visibleGroups = groups
    .map((group) => group.filter(Boolean))
    .filter((group) => group.length > 0);

  return (
    <div className="grid gap-1">
      {visibleGroups.map((group, index) => (
        <div
          key={index}
          className={`grid gap-1 ${index > 0 ? 'mt-1 border-t border-app-border pt-1' : ''}`}
        >
          {group}
        </div>
      ))}
    </div>
  );
}

function ModelSection({
  detail,
  modelPath,
}: {
  detail: PhysicalResourceDetail;
  modelPath: string | null;
}) {
  const { resource, specification } = detail;
  const resourceTypeName = specification.resourceTypeName || resource.resourceType || null;
  const specificationName = specification.model ?? specification.name ?? null;
  const manufacturer = specification.manufacturer;
  const specCharacteristics = specification.resourceSpecificationCharacteristic ?? [];
  const hasFixedFields = Boolean(
    modelPath || resourceTypeName || specificationName || manufacturer || resource.assetReference,
  );

  return (
    <div className="grid gap-1">
      {modelPath ? <IconInfoRow icon={Radio} hint="Path" value={modelPath} /> : null}
      {resourceTypeName ? (
        <IconInfoRow icon={Boxes} hint="Tipo do recurso" value={resourceTypeName} />
      ) : null}
      {specificationName ? (
        <IconInfoRow icon={Cpu} hint="Especificação" value={specificationName} />
      ) : null}
      {manufacturer ? (
        <IconInfoRow
          icon={Factory}
          hint="Fabricante"
          value={manufacturer.name ?? manufacturer.id}
        />
      ) : null}
      {resource.assetReference ? (
        <IconInfoRow
          icon={Fingerprint}
          hint="Imobilizado (SAP)"
          value={resource.assetReference}
          mono
        />
      ) : null}

      {/* Nível especificação (issue #273): herdado do modelo, somente leitura — quem edita é o Studio.
          Separador (mesmo dos grupos da Geral) divide os campos fixos das características. */}
      {specCharacteristics.length > 0 ? (
        <div
          className={`grid gap-1 ${hasFixedFields ? 'mt-1 border-t border-app-border pt-1' : ''}`}
        >
          {specCharacteristics.map((characteristic) => (
            <IconInfoRow
              key={characteristic.name}
              icon={characteristicIcon(characteristic.valueType)}
              hint={characteristic.name}
              value={
                characteristic.valueType === 'image' ? (
                  <ImageCharacteristicInput
                    value={valueToText(characteristic.value)}
                    onChange={() => {}}
                    readOnly
                    align="left"
                    name={characteristic.name}
                  />
                ) : (
                  valueToText(characteristic.value) || '—'
                )
              }
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EquipmentSection({
  detail,
  instanceDefs,
}: {
  detail: PhysicalResourceDetail;
  instanceDefs: ResourceCharacteristic[];
}) {
  const { resource } = detail;

  if (!resource.serialNumber && instanceDefs.length === 0) {
    return <EmptyState>Sem informações de equipamento para este recurso.</EmptyState>;
  }

  return (
    <div className="grid gap-1">
      {resource.serialNumber ? (
        <IconInfoRow icon={Barcode} hint="Nº de série" value={resource.serialNumber} mono />
      ) : null}
      <ResourceInstanceCharacteristics
        definitions={instanceDefs}
        characteristic={resource.characteristic}
        canEdit={false}
        onPatch={async () => undefined}
      />
    </div>
  );
}

/**
 * Aba "Info" do painel de recurso (módulo Geo): Geral (estados, endereço, datas), Modelo (definição
 * do catálogo + características de nível especificação) e Equipamento (características de nível
 * instância). Somente leitura — a edição acontece no ResourceEditorModal.
 */
export function ResourceInfoTab({ detail, generalOverride, generalFooter }: ResourceInfoTabProps) {
  const [subTab, setSubTab] = useState<InfoSubTab>('general');
  const idPrefix = useId();
  const { modelPath, instanceDefs } = useCatalogInfo(detail?.specification.resourceTypeId);

  const panel =
    subTab === 'general' ? (
      (generalOverride ?? (detail ? <GeneralSection detail={detail} /> : null))
    ) : !detail ? (
      <EmptyState>
        {subTab === 'model'
          ? 'Sem informações de modelo para este recurso.'
          : 'Sem informações de equipamento para este recurso.'}
      </EmptyState>
    ) : subTab === 'model' ? (
      <ModelSection detail={detail} modelPath={modelPath} />
    ) : (
      <EquipmentSection detail={detail} instanceDefs={instanceDefs} />
    );

  return (
    <div className="grid gap-3 pr-2">
      <div className="flex">
        <div
          role="tablist"
          aria-label="Informações do recurso"
          className="inline-flex items-center gap-1 rounded-xl bg-[var(--surface-muted)] p-1"
        >
          {SUB_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`${idPrefix}-${id}-tab`}
              aria-controls={`${idPrefix}-${id}-panel`}
              aria-selected={subTab === id}
              tabIndex={subTab === id ? 0 : -1}
              onClick={() => setSubTab(id)}
              className={`rounded-lg px-3.5 py-1.5 text-[0.82rem] font-medium transition ${
                subTab === id
                  ? 'bg-app-panel text-app-text font-semibold shadow-sm'
                  : 'text-app-muted hover:text-app-text'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div
        id={`${idPrefix}-${subTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${idPrefix}-${subTab}-tab`}
        className="grid gap-2"
      >
        {panel}
        {subTab === 'general' ? generalFooter : null}
      </div>
    </div>
  );
}
