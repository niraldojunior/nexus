import { useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Barcode,
  Building2,
  Calendar,
  CalendarClock,
  Crosshair,
  Database,
  FileText,
  Fingerprint,
  FolderKanban,
  Layers,
  MapPin,
  Tag,
  User,
  Wrench,
} from 'lucide-react';
import {
  getResourceTypeCatalogContext,
  type PhysicalResourceDetail,
} from '../../services/resourceApi';
import { IconInfoRow } from './IconInfoRow';
import { ResourceDefinitionCard } from './ResourceDefinitionCard';
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
// Somente leitura: a edição acontece no ResourceEditorModal (compartilhado com a Planta Interna).
export function ResourceOverviewTab({ detail }: ResourceOverviewTabProps) {
  const { resource, specification, statusCatalogEntry, place, location, servingSite, project } =
    detail;

  const notes = resource.characteristic?.find((c) => c.name === 'notes' || c.name === 'observacao')
    ?.value as string | undefined;

  // "Path" (posição do Tipo de Recurso na árvore de catálogo), ex. "Telecom \ Rede de Acesso \ GPON \ Distribuição".
  // O último nó da cadeia é o próprio Tipo de Recurso (kind RESOURCE_TYPE) — descartado aqui
  // porque já aparece no campo "Tipo de Recurso" ao lado. As características de nível instância
  // (issue #273) saíram daqui para a aba "Sobre" (ResourceAboutTab), que busca esse mesmo
  // `resourceTypeCatalogContext` por conta própria.
  const [modelPath, setModelPath] = useState<string | null>(null);
  useEffect(() => {
    const resourceTypeId = specification.resourceTypeId;
    if (!resourceTypeId) {
      setModelPath(null);
      return;
    }
    let cancelled = false;
    void getResourceTypeCatalogContext(resourceTypeId)
      .then((context) => {
        if (cancelled) return;
        const nodes = (context.catalogPaths[0]?.nodes ?? []).filter(
          (node) => node.kind !== 'RESOURCE_TYPE',
        );
        setModelPath(nodes.length ? nodes.map((node) => node.name).join(' \\ ') : null);
      })
      .catch(() => {
        if (!cancelled) {
          setModelPath(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [specification.resourceTypeId]);

  const manufacturer = specification.manufacturer;
  const model = specification.model;
  const placeFormatted = formatPlaceAddress(place);
  const coordinates =
    location?.geometryType === 'Point' && location.geometry?.type === 'Point'
      ? formatCoordinatePoint(location.geometry.coordinates)
      : null;

  const owner = resource.relatedParty?.find((party) => party.role === 'infrastructure_owner');
  // Fallback somente-leitura: projeto da origem que não correspondeu a nenhum geo_project.
  const implementationProject = resource.characteristic?.find(
    (c) => c.name === 'implementationProject',
  )?.value;
  const projectName =
    project?.name ??
    project?.id ??
    (typeof implementationProject === 'string' && implementationProject
      ? implementationProject
      : null);

  const originSystem = resource.characteristic?.find(
    (c) => c.name === '_origin.system' || c.name === 'sourceSystem',
  )?.value as string | undefined;

  const legacySubstatus = resource.characteristic?.find((c) => c.name === 'substatus')?.value as
    string | undefined;
  const hasValue = (value: unknown): boolean =>
    value !== undefined && value !== null && value !== '';
  const statusValue = statusCatalogEntry ?? legacySubstatus;
  const locationValue = !placeFormatted && coordinates ? coordinates : null;

  return (
    <div className="grid gap-1 pr-2">
      {hasValue(statusValue) ? (
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
              legacySubstatus
            )
          }
        />
      ) : null}

      {resource.administrativeState ? (
        <IconInfoRow
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
      ) : null}

      {resource.operationalState ? (
        <IconInfoRow
          icon={Activity}
          hint="Estado operacional"
          value={
            <TonePill
              label={OP_STATE_LABELS[resource.operationalState] ?? resource.operationalState}
              tone={OP_STATE_TONE[resource.operationalState] ?? 'neutral'}
            />
          }
        />
      ) : null}

      {resource.usageState ? (
        <IconInfoRow
          icon={Layers}
          hint="Estado de uso"
          value={
            <TonePill
              label={USAGE_STATE_LABELS[resource.usageState] ?? resource.usageState}
              tone={USAGE_STATE_TONE[resource.usageState] ?? 'neutral'}
            />
          }
        />
      ) : null}

      {resource.label ? <IconInfoRow icon={Tag} hint="Etiqueta física" value={resource.label} /> : null}

      {/* Agrupador consolidado das 4 informações de definição do recurso (Item 4) */}
      <ResourceDefinitionCard
        path={modelPath}
        resourceTypeName={specification.resourceTypeName || resource.resourceType || null}
        specificationName={model ?? specification.name ?? null}
        manufacturerName={manufacturer ? (manufacturer.name ?? manufacturer.id) : null}
      />

      {placeFormatted ? <IconInfoRow icon={MapPin} hint="Endereço" value={placeFormatted} /> : null}

      {/* Mesma exclusão mútua do painel de Site (SiteOverviewTab): coordenadas só entram
          quando não há endereço detalhado — senão duplicariam a mesma informação. */}
      {locationValue ? (
        <IconInfoRow icon={Crosshair} hint="Localização" value={locationValue} mono />
      ) : null}

      {servingSite ? (
        <IconInfoRow
          icon={Building2}
          hint="Estação abastecedora"
          value={servingSite.name ?? servingSite.id}
        />
      ) : null}

      {owner ? (
        <IconInfoRow icon={User} hint="Proprietário" value={owner.name ?? owner.id} />
      ) : null}

      {projectName ? (
        <IconInfoRow icon={FolderKanban} hint="Projeto de implantação" value={projectName} />
      ) : null}

      {resource.assetReference ? (
        <IconInfoRow
          icon={Fingerprint}
          hint="Imobilizado (SAP)"
          value={resource.assetReference}
          mono
        />
      ) : null}

      {resource.serialNumber ? (
        <IconInfoRow icon={Barcode} hint="Nº de série" value={resource.serialNumber} mono />
      ) : null}

      {formatDateBR(resource.createdAt) ? (
        <IconInfoRow icon={Calendar} hint="Criado em" value={formatDateBR(resource.createdAt)} />
      ) : null}

      {formatDateBR(resource.updatedAt) ? (
        <IconInfoRow
          icon={CalendarClock}
          hint="Atualizado em"
          value={formatDateBR(resource.updatedAt)}
        />
      ) : null}

      {originSystem || notes ? (
        <div className="mt-1 border-t border-app-border pt-1">
          {originSystem ? (
            <IconInfoRow icon={Database} hint="Sistema de origem" value={originSystem} />
          ) : null}
          {notes ? <IconInfoRow icon={FileText} hint="Observações" value={notes} /> : null}
        </div>
      ) : null}
    </div>
  );
}
