import {
  Activity,
  AlertCircle,
  Barcode,
  Boxes,
  Building2,
  Cpu,
  Database,
  Factory,
  Layers,
  MapPin,
  Radio,
  Tag,
  Wrench,
} from 'lucide-react';
import type { PhysicalResourceDetail } from '../../services/resourceApi';
import { StatusBadge } from './StatusBadge';
import { IconInfoRow } from './IconInfoRow';
import { ADMIN_STATE_LABELS, OP_STATE_LABELS, USAGE_STATE_LABELS } from '../../utils/resourceStateLabels';

export type ResourceOverviewTabProps = {
  detail: PhysicalResourceDetail;
  onOpenResource?: (resourceId: string) => void;
};

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
  if (parts.length > 0) return parts.join(', ');
  return place.name ?? place.id;
}

export function ResourceOverviewTab({ detail, onOpenResource }: ResourceOverviewTabProps) {
  const { resource, specification, statusCatalogEntry, parent, place, servingSite, project } = detail;

  const manufacturer = specification.manufacturer;
  const model = specification.model;
  const resourceLayer = specification.resourceLayer;
  const placeFormatted = formatPlaceAddress(place);

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
      <IconInfoRow
        icon={Boxes}
        hint="Tipo do recurso"
        value={specification.resourceTypeName || resource.resourceType || 'Recurso Físico'}
      />

      <IconInfoRow
        icon={Database}
        hint="Especificação do catálogo"
        value={specification.name}
      />

      {resource.label ? (
        <IconInfoRow icon={Tag} hint="Etiqueta física" value={resource.label} />
      ) : null}

      <IconInfoRow
        icon={Activity}
        hint="Status SID"
        value={<StatusBadge status={resource.status ?? 'active'} />}
      />

      {statusCatalogEntry ? (
        <IconInfoRow
          icon={AlertCircle}
          hint="Estado granular"
          value={statusCatalogEntry.name}
        />
      ) : legacySubstatus ? (
        <IconInfoRow icon={AlertCircle} hint="Substatus" value={legacySubstatus} />
      ) : null}

      {resource.administrativeState ? (
        <IconInfoRow
          icon={Wrench}
          hint="Estado administrativo"
          value={ADMIN_STATE_LABELS[resource.administrativeState] ?? resource.administrativeState}
        />
      ) : null}

      {resource.operationalState ? (
        <IconInfoRow
          icon={Activity}
          hint="Estado operacional"
          value={OP_STATE_LABELS[resource.operationalState] ?? resource.operationalState}
        />
      ) : null}

      {resource.usageState ? (
        <IconInfoRow
          icon={Layers}
          hint="Estado de uso"
          value={USAGE_STATE_LABELS[resource.usageState] ?? resource.usageState}
        />
      ) : null}

      {manufacturer ? (
        <IconInfoRow icon={Factory} hint="Fabricante" value={manufacturer.name ?? manufacturer.id} />
      ) : null}

      {model ? <IconInfoRow icon={Cpu} hint="Modelo" value={model} /> : null}

      {resourceLayer ? (
        <IconInfoRow icon={Radio} hint="Camada de recurso" value={resourceLayer.name} />
      ) : null}

      {resource.serialNumber ? (
        <IconInfoRow icon={Barcode} hint="Nº de série" value={resource.serialNumber} mono />
      ) : null}

      {resource.partNumber ? (
        <IconInfoRow icon={Tag} hint="Part Number" value={resource.partNumber} mono />
      ) : null}

      {resource.assetReference ? (
        <IconInfoRow icon={Tag} hint="Imobilizado (SAP)" value={resource.assetReference} mono />
      ) : null}

      {placeFormatted ? (
        <IconInfoRow icon={MapPin} hint="Local" value={placeFormatted} />
      ) : null}

      {servingSite ? (
        <IconInfoRow
          icon={Building2}
          hint="Estação abastecedora"
          value={servingSite.name ?? servingSite.id}
        />
      ) : null}

      {project ? (
        <IconInfoRow
          icon={Building2}
          hint="Projeto de implantação"
          value={project.name ?? project.id}
        />
      ) : null}

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
      ) : null}

      {originSystem ? (
        <IconInfoRow icon={Database} hint="Sistema de origem" value={originSystem} />
      ) : null}

      {notes ? (
        <IconInfoRow icon={AlertCircle} hint="Observações" value={notes} />
      ) : null}
    </div>
  );
}
