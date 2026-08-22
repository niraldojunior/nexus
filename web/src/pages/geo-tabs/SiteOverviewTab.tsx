import { useState } from 'react';
import { Building2, Crosshair, Database, FileText, MapPin, Activity } from 'lucide-react';
import type { GeoAddress, GeoLocation, GeoSite, GeoSiteStatus, GeoSpec, SiteOrigin } from '../../services/geoApi';
import { SITE_STATUS_OPTIONS, siteSpecLabel } from '../../utils/geoLabels';
import { formatAddressWithSource } from '../../utils/placeLabel';
import { StatusBadge } from './StatusBadge';
import { InlineEditRow } from './InlineEditRow';
import { useAutoResizeTextarea } from '../../hooks/useAutoResizeTextarea';

export type SiteOverviewTabProps = {
  site: GeoSite;
  address: GeoAddress | null;
  location?: GeoLocation | null;
  origin: SiteOrigin | null;
  sites: GeoSite[];
  specById: Map<string, GeoSpec>;
  // Nome do projeto que ainda está em curso e mantém o status herdado (RN-007) — `undefined`
  // fora desse fluxo, e o campo Status vira editável normalmente.
  lockedByProjectName?: string;
  onPatchSite: (patch: {
    status?: GeoSiteStatus;
    parentSiteId?: string | null;
    note?: string | null;
  }) => Promise<void>;
  onEditAddress: () => void;
};

const originLabel = (origin: SiteOrigin | null): string => {
  if (!origin) return '—';
  if (origin.kind === 'import') return `Importação Sistema ${origin.system}`;
  if (origin.kind === 'project') return `Projeto ${origin.projectName}`;
  return `Cadastro Livre usuário ${origin.actorSub}`;
};

export function SiteOverviewTab({
  site,
  address,
  location,
  origin,
  sites,
  specById,
  lockedByProjectName,
  onPatchSite,
  onEditAddress,
}: SiteOverviewTabProps) {
  const [editingStatus, setEditingStatus] = useState(false);
  const [editingParent, setEditingParent] = useState(false);
  const [parentQuery, setParentQuery] = useState('');
  const [noteDraft, setNoteDraft] = useState(site.note ?? '');
  const noteRef = useAutoResizeTextarea(noteDraft, 160);

  const currentSpec = specById.get(site.siteSpecificationId);
  const parentSite = site.parentSite ? sites.find((item) => item.id === site.parentSite?.id) : null;

  const parentOptions = currentSpec
    ? sites.filter((candidate) => {
        if (candidate.id === site.id) return false;
        const candidateSpec = specById.get(candidate.siteSpecificationId);
        if (!candidateSpec) return false;
        return (
          currentSpec.allowedParentSpecIds.includes(candidateSpec.id) &&
          candidateSpec.allowedChildSpecIds.includes(currentSpec.id)
        );
      })
    : [];
  const parentMatches = parentOptions.filter((candidate) =>
    candidate.name.toLowerCase().includes(parentQuery.trim().toLowerCase()),
  );

  const commitStatus = async (status: GeoSiteStatus) => {
    setEditingStatus(false);
    if (status === site.status) return;
    await onPatchSite({ status });
  };

  const startEditParent = () => {
    setParentQuery(parentSite?.name ?? '');
    setEditingParent(true);
  };

  const selectParent = async (candidate: GeoSite) => {
    setEditingParent(false);
    if (candidate.id === site.parentSite?.id) return;
    await onPatchSite({ parentSiteId: candidate.id });
  };

  const clearParent = async () => {
    setEditingParent(false);
    if (!site.parentSite) return;
    await onPatchSite({ parentSiteId: null });
  };

  const commitNote = () => {
    const next = noteDraft.trim();
    if (next !== (site.note ?? '')) void onPatchSite({ note: next || null });
  };

  return (
    <div className="grid gap-1">
      <InlineEditRow
        label="Status"
        icon={Activity}
        editing={editingStatus}
        onActivate={() => setEditingStatus(true)}
        readOnlyNote={lockedByProjectName ? `herdado do projeto ${lockedByProjectName}` : undefined}
        value={<StatusBadge status={site.status} />}
      >
        <select
          autoFocus
          value={site.status}
          onChange={(event) => void commitStatus(event.target.value as GeoSiteStatus)}
          onBlur={() => setEditingStatus(false)}
          aria-label="Status do local"
          className="geo-input"
        >
          {SITE_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </InlineEditRow>

      <InlineEditRow
        label="Local Pai"
        icon={Building2}
        editing={editingParent}
        onActivate={startEditParent}
        value={parentSite?.name ?? 'Nenhum'}
      >
        <div className="relative">
          <input
            autoFocus
            value={parentQuery}
            onChange={(event) => setParentQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setEditingParent(false);
            }}
            placeholder="Digite o nome do local pai…"
            aria-label="Buscar local pai"
            className="geo-input"
          />
          <div className="fixed inset-0 z-40" onClick={() => setEditingParent(false)} />
          <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-[12px] border border-app-border bg-white py-1 shadow-soft">
            {site.parentSite ? (
              <button
                type="button"
                onClick={() => void clearParent()}
                className="flex w-full items-center px-3 py-2 text-left text-[0.82rem] text-status-red transition hover:bg-status-red-soft"
              >
                Remover local pai
              </button>
            ) : null}
            {parentMatches.length === 0 ? (
              <p className="px-3 py-2 text-[0.8rem] text-app-muted">Nenhum local compatível encontrado.</p>
            ) : (
              parentMatches.map((candidate) => (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => void selectParent(candidate)}
                  className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-[0.82rem] text-app-text transition hover:bg-app-accent-soft"
                >
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <span className="shrink-0 text-[0.7rem] text-app-muted">
                    {siteSpecLabel(specById.get(candidate.siteSpecificationId))}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      </InlineEditRow>

      <div className="flex min-w-0 items-start gap-2.5 py-1" title="Endereço">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted" aria-hidden="true">
          <MapPin className="h-[18px] w-[18px]" />
        </span>
        <span className="sr-only">Endereço</span>
        <button
          type="button"
          onClick={onEditAddress}
          className="-mx-1.5 -my-1 flex w-full min-w-0 items-start gap-2 rounded-[8px] px-1.5 py-1 text-left text-[0.84rem] leading-snug text-app-text outline-none transition hover:bg-app-accent-soft"
        >
          <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
            {address ? formatAddressWithSource(address) : 'Sem endereço — clique para adicionar'}
          </span>
        </button>
      </div>

      {!address && location?.geometry.type === 'Point' ? (
        <div className="flex min-w-0 items-start gap-2.5 py-1" title="Coordenadas">
          <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted" aria-hidden="true"><Crosshair className="h-[18px] w-[18px]" /></span>
          <span className="sr-only">Coordenadas</span>
          <div className="min-w-0 break-words px-1.5 py-1 text-[0.84rem] leading-snug text-app-text [overflow-wrap:anywhere]">
            {location.geometry.coordinates[1].toFixed(6)}, {location.geometry.coordinates[0].toFixed(6)}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 items-start gap-2.5 py-1" title="Origem">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted" aria-hidden="true"><Database className="h-[18px] w-[18px]" /></span>
        <span className="sr-only">Origem</span>
        <div className="min-w-0 break-words px-1.5 py-1 text-[0.84rem] leading-snug text-app-text [overflow-wrap:anywhere]">
          {originLabel(origin)}
        </div>
      </div>

      <div className="flex min-w-0 items-start gap-2.5 py-1" title="Observação">
        <span className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center text-app-muted" aria-hidden="true"><FileText className="h-[18px] w-[18px]" /></span>
        <span className="sr-only">Observação</span>
        <textarea
          ref={noteRef}
          value={noteDraft}
          onChange={(event) => setNoteDraft(event.target.value)}
          onBlur={commitNote}
          placeholder="Adicione uma observação para este local…"
          rows={1}
          aria-label="Observação do local"
          className="-mx-1.5 -my-1 w-full resize-none rounded-[8px] border border-transparent bg-transparent px-1.5 py-1 text-[0.84rem] leading-snug text-app-text outline-none transition placeholder:text-app-muted hover:border-app-border focus:border-app-accent-border focus:bg-white"
        />
      </div>
    </div>
  );
}
