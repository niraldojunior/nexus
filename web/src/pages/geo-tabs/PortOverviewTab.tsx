import { Boxes, Cable, Layers, Waypoints } from 'lucide-react';
import type { ResourcePortDetail } from '../../services/resourceApi';
import { ADMIN_STATE_LABELS, OP_STATE_LABELS, USAGE_STATE_LABELS } from '../../utils/resourceStateLabels';
import { IconInfoRow } from './IconInfoRow';
import { ResourceStateLights } from './ResourceStateLights';

export function PortOverviewTab({
  detail,
  onOpenResource,
}: {
  detail: ResourcePortDetail;
  onOpenResource: (resourceId: string) => void;
}) {
  const currentDrop = detail.drops.find((drop) => drop.active);
  const portName = detail.role === 'FO.O' && detail.index !== undefined ? `FO.O.${detail.index}` : detail.role ?? detail.resource.name;

  return (
    <div className="grid gap-1">
      <IconInfoRow icon={Waypoints} hint="Porta" value={portName} />
      {detail.splitter ? (
        <IconInfoRow
          icon={Boxes}
          hint="Splitter pai"
          value={<button type="button" onClick={() => onOpenResource(detail.splitter!.id)} className="text-left font-medium text-app-accent hover:underline">{detail.splitter.name ?? detail.splitter.id}</button>}
        />
      ) : null}
      {detail.cto ? (
        <IconInfoRow
          icon={Boxes}
          hint="CTO continente"
          value={<button type="button" onClick={() => onOpenResource(detail.cto!.id)} className="text-left font-medium text-app-accent hover:underline">{detail.cto.name ?? detail.cto.id}</button>}
        />
      ) : null}
      {detail.splitRatio ? <IconInfoRow icon={Layers} hint="Razão de split" value={detail.splitRatio} /> : null}
      <div className="flex min-w-0 items-center gap-2.5 py-1">
        <ResourceStateLights
          administrativeState={detail.resource.administrativeState}
          operationalState={detail.resource.operationalState}
          usageState={detail.resource.usageState}
        />
        <span className="text-[0.84rem] text-app-text">
          {`${ADMIN_STATE_LABELS[detail.resource.administrativeState ?? ''] ?? detail.resource.administrativeState ?? '—'} · ${OP_STATE_LABELS[detail.resource.operationalState ?? ''] ?? detail.resource.operationalState ?? '—'} · ${USAGE_STATE_LABELS[detail.resource.usageState ?? ''] ?? detail.resource.usageState ?? '—'}`}
        </span>
      </div>
      {currentDrop ? (
        <IconInfoRow
          icon={Cable}
          hint="Drop atual"
          value={<button type="button" onClick={() => onOpenResource(currentDrop.resource.id)} className="text-left font-medium text-app-accent hover:underline">{currentDrop.resource.name}</button>}
        />
      ) : (
        <IconInfoRow icon={Cable} hint="Drop atual" value="Nenhum drop conectado" />
      )}
    </div>
  );
}
