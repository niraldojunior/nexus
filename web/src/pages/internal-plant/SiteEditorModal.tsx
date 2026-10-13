import {
  Activity,
  Building2,
  FileText,
  Layers,
  Loader2,
  SlidersHorizontal,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import { useConfirmDialog } from '../../hooks/useConfirmDialog';
import { useModalDialog } from '../../hooks/useModalDialog';
import {
  listGeoSiteSpecifications,
  type GeoSite,
  type GeoSiteStatus,
  type GeoSpec,
} from '../../services/geoApi';
import { listParties, type Party } from '../../services/partyApi';
import {
  fetchSiteEditor,
  loadAdministrativeCities,
  saveSiteEditor,
  type AdministrativeCity,
  type SiteEditorPayload,
} from '../../services/siteEditorApi';
import { SITE_STATUS_OPTIONS } from '../../utils/geoLabels';
import { SiteInstanceCharacteristics } from '../geo-tabs/SiteInstanceCharacteristics';
import { SiteSubSitesTab } from '../geo-tabs/SiteSubSitesTab';

type TabId = 'general' | 'characteristics' | 'states' | 'organization' | 'subsites';
const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'general', label: 'Geral', icon: FileText },
  { id: 'characteristics', label: 'Características', icon: SlidersHorizontal },
  { id: 'states', label: 'Estado', icon: Activity },
  { id: 'organization', label: 'Organização', icon: Building2 },
  { id: 'subsites', label: 'Locais Internos', icon: Layers },
];

const inputClass =
  'w-full rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.85rem] text-app-text outline-none focus:border-app-accent disabled:opacity-60';
const labelClass = 'grid gap-1 text-[0.78rem] font-semibold text-app-muted';

type Characteristic = { group?: string; name: string; value: unknown; valueType?: string };
type PartyRef = { id: string; role?: string | undefined };

type Draft = {
  name: string;
  specId: string;
  countryCode: string;
  stateCode: string;
  cityId: string;
  street: string;
  streetNr: string;
  postcode: string;
  note: string;
  status: GeoSiteStatus;
  statusReason: string;
  statusDate: string;
  characteristic: Characteristic[];
  parties: PartyRef[];
};

const isTenantRole = (role?: string) => role?.toLowerCase() === 'tenant';

export type SiteEditorModalProps = {
  /** Edição quando presente; criação caso contrário. */
  siteId?: string | undefined;
  /** Município pré-selecionado na criação (botão "+" do município). */
  initialAdministrativeCityId?: string | undefined;
  onClose: () => void;
  /** Chamado após cada gravação, para a árvore recarregar. O modal permanece aberto. */
  onChanged: (siteId: string) => void;
};

export function SiteEditorModal({
  siteId: initialSiteId,
  initialAdministrativeCityId,
  onClose,
  onChanged,
}: SiteEditorModalProps) {
  const [siteId, setSiteId] = useState(initialSiteId);
  const [tab, setTab] = useState<TabId>('general');
  const [cities, setCities] = useState<AdministrativeCity[]>([]);
  const [specs, setSpecs] = useState<GeoSpec[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [site, setSite] = useState<GeoSite | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const { confirm, dialog: confirmDialog, open: confirmOpen } = useConfirmDialog();
  const panelRef = useRef<HTMLDivElement>(null);
  useModalDialog(panelRef, !confirmOpen);

  const patch = (change: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...change } : current));
    setDirty(true);
  };

  // Preenchimentos automáticos (opção única) não contam como edição do usuário.
  const autofill = (change: Partial<Draft>) =>
    setDraft((current) => (current ? { ...current, ...change } : current));

  const requestClose = () => {
    if (!dirty) return onClose();
    void confirm({
      title: 'Descartar as alterações?',
      message: 'As alterações não salvas serão perdidas.',
      confirmLabel: 'Descartar',
      destructive: true,
    }).then((ok) => {
      if (ok) onClose();
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirmOpen) requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [cityList, specList, snapshot] = await Promise.all([
          loadAdministrativeCities(),
          listGeoSiteSpecifications(),
          initialSiteId ? fetchSiteEditor(initialSiteId) : Promise.resolve(undefined),
        ]);
        if (cancelled) return;
        setCities(cityList);
        setSpecs(specList);
        const city =
          snapshot?.administrativeCity ??
          cityList.find((candidate) => candidate.id === initialAdministrativeCityId);
        setSite(snapshot?.site ?? null);
        setDraft({
          name: snapshot?.site.name ?? '',
          specId: snapshot?.site.siteSpecificationId ?? '',
          countryCode: city?.countryCode ?? '',
          stateCode: city?.stateCode ?? '',
          cityId: city?.id ?? '',
          street: snapshot?.address?.street ?? '',
          streetNr: snapshot?.address?.streetNr ?? '',
          postcode: snapshot?.address?.postcode ?? '',
          note: snapshot?.site.note ?? '',
          status: snapshot?.site.status ?? 'Planned',
          statusReason: '',
          statusDate: '',
          characteristic: snapshot?.site.characteristic ?? [],
          parties: (snapshot?.site.relatedParty ?? []).map((party) => ({
            id: party.id,
            role: party.role,
          })),
        });
      } catch (cause) {
        if (!cancelled)
          setError(cause instanceof Error ? cause.message : 'Falha ao carregar o editor.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialSiteId, initialAdministrativeCityId]);

  const rootSpecs = useMemo(
    () => specs.filter((spec) => spec.category !== 'SubSite' && spec.lifecycleStatus === 'Active'),
    [specs],
  );
  const specById = useMemo(() => new Map(specs.map((spec) => [spec.id, spec])), [specs]);

  // País → UF → município; um único candidato é selecionado automaticamente.
  const countries = useMemo(
    () => [...new Map(cities.map((c) => [c.countryCode, c.countryName])).entries()],
    [cities],
  );
  const states = useMemo(
    () =>
      [
        ...new Set(
          cities.filter((c) => c.countryCode === draft?.countryCode).map((c) => c.stateCode),
        ),
      ].sort(),
    [cities, draft?.countryCode],
  );
  const cityOptions = useMemo(
    () =>
      cities
        .filter((c) => c.countryCode === draft?.countryCode && c.stateCode === draft?.stateCode)
        .sort((a, b) => a.cityName.localeCompare(b.cityName, 'pt-BR')),
    [cities, draft?.countryCode, draft?.stateCode],
  );

  useEffect(() => {
    if (!draft) return;
    if (!draft.countryCode && countries.length === 1) autofill({ countryCode: countries[0]![0] });
    else if (draft.countryCode && !draft.stateCode && states.length === 1)
      autofill({ stateCode: states[0]! });
    else if (draft.stateCode && !draft.cityId && cityOptions.length === 1)
      autofill({ cityId: cityOptions[0]!.id });
  }, [draft?.countryCode, draft?.stateCode, draft?.cityId, countries, states, cityOptions]);

  useEffect(() => {
    if (draft && !draft.specId && rootSpecs.length === 1) autofill({ specId: rootSpecs[0]!.id });
  }, [rootSpecs, draft?.specId]);

  const currentSpec = draft ? specById.get(draft.specId) : undefined;

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim() || !draft.specId || !draft.cityId || !draft.street.trim()) {
      setError('Informe nome, tipo, município e logradouro.');
      setTab('general');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload: SiteEditorPayload = {
        site: {
          name: draft.name.trim(),
          siteSpecificationId: draft.specId,
          status: draft.status,
          note: draft.note.trim() || null,
          characteristic: draft.characteristic,
          relatedParty: draft.parties.map((party) => ({
            id: party.id,
            ...(party.role ? { role: party.role } : {}),
          })),
          ...(draft.statusReason.trim() ? { statusReason: draft.statusReason.trim() } : {}),
          ...(draft.statusDate ? { statusDate: draft.statusDate } : {}),
        },
        administrativeCityId: draft.cityId,
        street: draft.street.trim(),
        ...(draft.streetNr.trim() ? { streetNr: draft.streetNr.trim() } : {}),
        ...(draft.postcode.trim() ? { postcode: draft.postcode.trim() } : {}),
      };
      const saved = await saveSiteEditor(payload, siteId);
      setSiteId(saved.site.id);
      setSite(saved.site);
      patch({ statusReason: '', statusDate: '', status: saved.site.status });
      setDirty(false);
      onChanged(saved.site.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar o local.');
    } finally {
      setSaving(false);
    }
  };

  const title = siteId ? 'Editar local' : 'Novo local';

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[var(--scrim)] p-4">
      {confirmDialog}
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="flex h-[min(720px,calc(100vh-32px))] w-full max-w-[960px] overflow-hidden rounded-[24px] border border-app-border bg-app-panel shadow-modal outline-none"
      >
        <nav
          aria-label="Local"
          className="flex w-[210px] shrink-0 flex-col gap-1 border-r border-app-border bg-app-sidebar p-4 max-sm:hidden"
        >
          <div className="mb-3 flex items-center gap-2.5 border-b border-app-border pb-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-app-accent-soft text-app-text">
              <Building2 size={18} aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[0.86rem] font-semibold text-app-text">
                {draft?.name || 'Novo local'}
              </span>
              <span className="truncate text-[0.72rem] text-app-muted">
                {currentSpec?.name ?? 'Sem tipo'}
              </span>
            </span>
          </div>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-current={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2.5 rounded-[10px] border px-3 py-2 text-left text-[0.85rem] text-app-text transition ${
                tab === t.id
                  ? 'border-app-accent-border bg-app-accent-soft font-semibold'
                  : 'border-transparent hover:bg-app-hover'
              }`}
              style={{ borderWidth: 1, borderStyle: 'solid' }}
            >
              <t.icon size={16} aria-hidden="true" className="shrink-0" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-3 border-b border-app-border px-6 py-4">
            <div className="min-w-0">
              <p className="text-[0.72rem] font-semibold uppercase tracking-wide text-app-muted">
                {title}
              </p>
              <h2 className="truncate text-[1.15rem] font-semibold text-app-text">
                {draft?.name || 'Sem nome'}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={requestClose}
              className="grid size-8 shrink-0 place-items-center rounded-lg text-app-muted hover:bg-app-hover hover:text-app-text"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="flex gap-1 overflow-x-auto border-b border-app-border px-3 py-1.5 sm:hidden">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-[0.8rem] ${tab === t.id ? 'bg-app-accent-soft font-semibold' : 'text-app-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {loading || !draft ? (
              error ? (
                <p role="alert" className="text-[0.9rem] text-status-red">
                  {error}
                </p>
              ) : (
                <Loader2 className="animate-spin text-app-muted" aria-label="Carregando" />
              )
            ) : tab === 'general' ? (
              <div className="grid gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className={labelClass}>
                    Nome
                    <input
                      className={inputClass}
                      value={draft.name}
                      onChange={(e) => patch({ name: e.target.value })}
                    />
                  </label>
                  <label className={labelClass}>
                    Tipo de local
                    <select
                      className={inputClass}
                      value={draft.specId}
                      disabled={Boolean(siteId)}
                      onChange={(e) => patch({ specId: e.target.value, characteristic: [] })}
                    >
                      <option value="">Selecione…</option>
                      {rootSpecs.map((spec) => (
                        <option key={spec.id} value={spec.id}>
                          {spec.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className={labelClass}>
                    País
                    <select
                      className={inputClass}
                      value={draft.countryCode}
                      onChange={(e) =>
                        patch({ countryCode: e.target.value, stateCode: '', cityId: '' })
                      }
                    >
                      <option value="">Selecione…</option>
                      {countries.map(([code, name]) => (
                        <option key={code} value={code}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    UF
                    <select
                      className={inputClass}
                      value={draft.stateCode}
                      disabled={!draft.countryCode}
                      onChange={(e) => patch({ stateCode: e.target.value, cityId: '' })}
                    >
                      <option value="">Selecione…</option>
                      {states.map((code) => (
                        <option key={code} value={code}>
                          {code}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={labelClass}>
                    Município
                    <select
                      className={inputClass}
                      value={draft.cityId}
                      disabled={!draft.stateCode}
                      onChange={(e) => patch({ cityId: e.target.value })}
                    >
                      <option value="">Selecione…</option>
                      {cityOptions.map((city) => (
                        <option key={city.id} value={city.id}>
                          {city.cityName}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-[1fr_120px_160px]">
                  <label className={labelClass}>
                    Logradouro
                    <input
                      className={inputClass}
                      value={draft.street}
                      onChange={(e) => patch({ street: e.target.value })}
                    />
                  </label>
                  <label className={labelClass}>
                    Número
                    <input
                      className={inputClass}
                      value={draft.streetNr}
                      onChange={(e) => patch({ streetNr: e.target.value })}
                    />
                  </label>
                  <label className={labelClass}>
                    CEP
                    <input
                      className={inputClass}
                      value={draft.postcode}
                      onChange={(e) => patch({ postcode: e.target.value })}
                    />
                  </label>
                </div>
                <label className={labelClass}>
                  Observação
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={draft.note}
                    onChange={(e) => patch({ note: e.target.value })}
                  />
                </label>
              </div>
            ) : tab === 'characteristics' ? (
              <CharacteristicsTab spec={currentSpec} draft={draft} patch={patch} />
            ) : tab === 'states' ? (
              <div className="grid max-w-[480px] gap-4">
                <label className={labelClass}>
                  Status
                  <select
                    className={inputClass}
                    value={draft.status}
                    onChange={(e) => patch({ status: e.target.value as GeoSiteStatus })}
                  >
                    {SITE_STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={labelClass}>
                  Data da mudança
                  <input
                    type="date"
                    className={inputClass}
                    value={draft.statusDate}
                    onChange={(e) => patch({ statusDate: e.target.value })}
                  />
                </label>
                <label className={labelClass}>
                  Motivo
                  <textarea
                    className={inputClass}
                    rows={3}
                    value={draft.statusReason}
                    onChange={(e) => patch({ statusReason: e.target.value })}
                  />
                </label>
                <p className="text-[0.75rem] text-app-muted">
                  O motivo é obrigatório para desativar, aposentar ou reativar o local.
                </p>
              </div>
            ) : tab === 'organization' ? (
              <OrganizationTab draft={draft} patch={patch} />
            ) : siteId && site ? (
              <SiteSubSitesTab
                siteId={siteId}
                siteSpecificationId={site.siteSpecificationId}
                specs={specs}
                specById={specById}
                canEdit
                onOpenSubSite={() => undefined}
                onChanged={() => onChanged(siteId)}
              />
            ) : (
              <p className="text-[0.85rem] text-app-muted">
                Salve o local para cadastrar os locais internos (salas, andares, gavetas…).
              </p>
            )}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-app-border bg-app-sidebar px-6 py-3">
            <p
              role="alert"
              className="min-w-0 flex-1 truncate text-[0.82rem] text-status-red"
              title={error ?? ''}
            >
              {!loading && error ? error : ''}
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="ghost" onClick={requestClose} disabled={saving}>
                Fechar
              </Button>
              <Button
                variant="primary"
                onClick={() => void save()}
                loading={saving}
                disabled={loading || !draft}
              >
                {saving ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

function CharacteristicsTab({
  spec,
  draft,
  patch,
}: {
  spec: GeoSpec | undefined;
  draft: Draft;
  patch: (change: Partial<Draft>) => void;
}) {
  const definitions = (spec?.specCharacteristic ?? []).filter(
    (c) => c.characteristicLevel === 'instance',
  );
  if (!spec)
    return <p className="text-[0.85rem] text-app-muted">Selecione o tipo de local na aba Geral.</p>;
  if (definitions.length === 0) {
    return (
      <p className="text-[0.85rem] text-app-muted">
        Este tipo de local não define características.
      </p>
    );
  }
  return (
    <SiteInstanceCharacteristics
      definitions={definitions}
      characteristic={draft.characteristic}
      canEdit
      onPatch={async ({ characteristic }) => patch({ characteristic })}
    />
  );
}

function OrganizationTab({
  draft,
  patch,
}: {
  draft: Draft;
  patch: (change: Partial<Draft>) => void;
}) {
  const [term, setTerm] = useState('');
  const [role, setRole] = useState('');
  const [results, setResults] = useState<Party[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (term.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void listParties({ name: term.trim(), partyType: 'Organization', limit: 10, offset: 0 })
        .then((list) => {
          if (cancelled) return;
          setResults(list);
          setNames((current) => ({
            ...current,
            ...Object.fromEntries(list.map((p) => [p.id, p.name])),
          }));
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [term]);

  const tenants = draft.parties.filter((party) => isTenantRole(party.role));
  const others = draft.parties.filter((party) => !isTenantRole(party.role));

  return (
    <div className="grid gap-5">
      <section className="grid gap-2" aria-label="Tenant">
        <h3 className="text-[0.85rem] font-semibold text-app-text">Tenant</h3>
        <p className="text-[0.82rem] text-app-muted">
          {tenants.length > 0
            ? tenants.map((t) => names[t.id] ?? t.id).join(', ')
            : 'O Tenant é vinculado automaticamente ao salvar.'}
        </p>
      </section>
      <section className="grid gap-2" aria-label="Organizações">
        <h3 className="text-[0.85rem] font-semibold text-app-text">Organizações</h3>
        <div className="grid gap-2 sm:grid-cols-[1fr_200px]">
          <input
            className={inputClass}
            placeholder="Buscar organização…"
            aria-label="Buscar organização"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <input
            className={inputClass}
            placeholder="Papel (ex.: owner)"
            aria-label="Papel da organização"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </div>
        {results.length > 0 ? (
          <ul className="grid gap-1 rounded-[10px] border border-app-border p-1">
            {results.map((party) => (
              <li key={party.id}>
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-[0.85rem] hover:bg-app-hover"
                  onClick={() => {
                    const nextRole = role.trim() || undefined;
                    if (!draft.parties.some((p) => p.id === party.id && p.role === nextRole)) {
                      patch({ parties: [...draft.parties, { id: party.id, role: nextRole }] });
                    }
                    setTerm('');
                    setResults([]);
                  }}
                >
                  {party.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="grid gap-1.5">
          {others.map((party) => (
            <li
              key={`${party.id}:${party.role ?? ''}`}
              className="flex items-center justify-between rounded-[10px] border border-app-border px-3 py-1.5 text-[0.85rem]"
            >
              <span>
                {party.role ? <span className="text-app-muted">{party.role}: </span> : null}
                {names[party.id] ?? party.id}
              </span>
              <button
                type="button"
                aria-label={`Remover ${names[party.id] ?? party.id}`}
                className="text-app-muted hover:text-status-red"
                onClick={() => patch({ parties: draft.parties.filter((p) => p !== party) })}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
