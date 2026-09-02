import {
  Activity,
  AlertCircle,
  Barcode,
  Boxes,
  Building2,
  Calendar,
  Cpu,
  Crosshair,
  Database,
  Factory,
  Layers,
  MapPin,
  Radio,
  Tag,
  Wrench,
} from 'lucide-react';
import type { PhysicalResourceDetail } from '../../services/resourceApi';
import { IconInfoRow } from './IconInfoRow';
import { TonePill } from './TonePill';
import { formatCoordinatePoint } from './CoordinateStreetView';
import { formatDateBR } from '../../utils/helpers';
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

// Perfil e ordem alinhados ao padrão Netwin/CDOE usado pelo time de negócio (ver plano
// da issue #184) — os 19 campos "padrão" + os 2 characteristics são sempre renderizados,
// mesmo vazios (`—`), em vez de somem quando não há valor.
export function ResourceOverviewTab({ detail, onOpenResource }: ResourceOverviewTabProps) {
  const { resource, specification, statusCatalogEntry, parent, place, location, servingSite, project } =
    detail;

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

      <IconInfoRow icon={Tag} hint="Etiqueta física" value={resource.label ?? '—'} />

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

      <IconInfoRow icon={Crosshair} hint="Localização" value={coordinates ?? '—'} mono={!!coordinates} />

      <IconInfoRow
        icon={Building2}
        hint="Estação abastecedora"
        value={servingSite ? (servingSite.name ?? servingSite.id) : '—'}
      />

      <IconInfoRow
        icon={Building2}
        hint="Projeto de implantação"
        value={project ? (project.name ?? project.id) : '—'}
      />

      <IconInfoRow icon={Tag} hint="Imobilizado (SAP)" value={resource.assetReference ?? '—'} mono />

      <IconInfoRow icon={Barcode} hint="Nº de série" value={resource.serialNumber ?? '—'} mono />

      <IconInfoRow icon={Tag} hint="Part Number" value={resource.partNumber ?? '—'} mono />

      <IconInfoRow icon={Calendar} hint="Criado em" value={formatDateBR(resource.createdAt) ?? '—'} />

      <IconInfoRow icon={Calendar} hint="Atualizado em" value={formatDateBR(resource.updatedAt) ?? '—'} />

      <div className="mt-1 border-t border-app-border pt-1">
        <IconInfoRow icon={Database} hint="Sistema de origem" value={originSystem ?? '—'} />

        <IconInfoRow icon={AlertCircle} hint="Observações" value={notes ?? '—'} />
      </div>
    </div>
  );
}
