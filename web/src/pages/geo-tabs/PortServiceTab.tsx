import { Building2, Cable, Radio, User } from 'lucide-react';
import type { PortService } from '../../hooks/usePortService';
import { IconInfoRow } from './IconInfoRow';

export function PortServiceTab({ service }: { service: PortService }) {
  const { rfs, cfs } = service;
  const resources = rfs.supportingResource.map((resource) => resource.name ?? resource.id).join(' · ');
  const tenant = cfs.relatedParty.find((party) => party.role === 'subscriber');
  const place = cfs.place[0] ?? rfs.place[0];
  const characteristics = cfs.serviceCharacteristic
    .filter((item) => ['velocidade_download', 'modelo_comercial'].includes(item.name))
    .map((item) => `${item.name.replace(/_/g, ' ')}: ${String(item.value)}`)
    .join(' · ');

  return (
    <div className="grid gap-1">
      <IconInfoRow icon={Radio} hint="RFS técnico" value={rfs.name} />
      <IconInfoRow icon={Cable} hint="Recursos suportados" value={resources || '—'} />
      <IconInfoRow icon={User} hint="CFS comercial" value={cfs.name} />
      <IconInfoRow icon={User} hint="SubscriberID" value={cfs.subscriberId} mono />
      {tenant ? <IconInfoRow icon={Building2} hint="Tenant" value={tenant.name ?? tenant.id} /> : null}
      {place ? <IconInfoRow icon={Building2} hint="Local de instalação" value={place.name ?? place.id} /> : null}
      {characteristics ? <IconInfoRow icon={Radio} hint="Características comerciais" value={characteristics} /> : null}
    </div>
  );
}
