import { Building2, Crosshair, Database, FileText, MapPin, Activity } from 'lucide-react';
import type {
  GeoAddress,
  GeoLocation,
  GeoSite,
  GeoSpec,
  SiteOrigin,
} from '../../services/geoApi';
import { formatAddressWithSource } from '../../utils/placeLabel';
import { StatusBadge } from './StatusBadge';
import { IconInfoRow } from './IconInfoRow';
import { SiteInstanceCharacteristics } from './SiteInstanceCharacteristics';

export type SiteOverviewTabProps = {
  site: GeoSite;
  address: GeoAddress | null;
  location?: GeoLocation | null;
  origin: SiteOrigin | null;
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
};

const originLabel = (origin: SiteOrigin | null): string => {
  if (!origin) return '—';
  if (origin.kind === 'import') return `Importação Sistema ${origin.system}`;
  if (origin.kind === 'project') return `Projeto ${origin.projectName}`;
  return `Cadastro Livre usuário ${origin.actorSub}`;
};

// Somente leitura: a edição acontece no SiteEditorModal (compartilhado com a Planta Interna),
// aberto pelo botão "Editar" da barra do painel.
export function SiteOverviewTab({
  site,
  address,
  location,
  origin,
  sites,
  specById,
}: SiteOverviewTabProps) {
  const currentSpec = specById.get(site.siteSpecificationId);
  const parentSite = site.parentSite ? sites.find((item) => item.id === site.parentSite?.id) : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1">
      <IconInfoRow icon={Activity} hint="Status" value={<StatusBadge status={site.status} />} />
      <IconInfoRow icon={Building2} hint="Local Pai" value={parentSite?.name ?? 'Nenhum'} />
      <IconInfoRow
        icon={MapPin}
        hint="Endereço"
        value={address ? formatAddressWithSource(address) : 'Sem endereço'}
      />

      {!address && location?.geometry.type === 'Point' ? (
        <div className="flex min-w-0 items-start gap-2.5 py-1" title="Coordenadas">
          <span
            className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted"
            aria-hidden="true"
          >
            <Crosshair className="h-[18px] w-[18px]" />
          </span>
          <span className="sr-only">Coordenadas</span>
          <div className="min-w-0 flex-1 break-words px-1.5 py-1 text-[0.84rem] leading-snug text-app-text">
            {location.geometry.coordinates[1].toFixed(6)},{' '}
            {location.geometry.coordinates[0].toFixed(6)}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 items-start gap-2.5 py-1" title="Origem">
        <span
          className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted"
          aria-hidden="true"
        >
          <Database className="h-[18px] w-[18px]" />
        </span>
        <span className="sr-only">Origem</span>
        <div className="min-w-0 flex-1 break-words px-1.5 py-1 text-[0.84rem] leading-snug text-app-text">
          {originLabel(origin)}
        </div>
      </div>

      <IconInfoRow icon={FileText} hint="Observação" value={site.note?.trim() || '—'} />

      {currentSpec?.specCharacteristic && (
        <SiteInstanceCharacteristics
          definitions={currentSpec.specCharacteristic.filter(
            (c) => c.characteristicLevel === 'instance',
          )}
          characteristic={site.characteristic}
          canEdit={false}
          onPatch={async () => undefined}
        />
      )}
    </div>
  );
}
