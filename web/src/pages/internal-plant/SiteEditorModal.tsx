import {
  Activity,
  Boxes,
  Building2,
  FileText,
  Layers,
  Loader2,
  MapPin,
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
  getGeoSite,
  listGeoSiteSpecifications,
  type GeoAddress,
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
import { useVisualIdentityPreviewUrl } from '../../hooks/useVisualIdentityPreviewUrl';
import {
  STUDIO_GEO_CUSTOM_ICON_COLOR,
  STUDIO_GEO_NEUTRAL_ICON_COLOR,
} from '../../utils/studioGeoDefaults';
import { SITE_STATUS_OPTIONS, type StatusTone } from '../../utils/geoLabels';
import { StateSelect, formatStateDate } from './ResourceEditorModal';
import { locationCategoryIcon } from '../studio/location-model/locationCategoryPresentation';
import { SiteInstanceCharacteristics } from '../geo-tabs/SiteInstanceCharacteristics';
import { SiteSubSitesTab } from '../geo-tabs/SiteSubSitesTab';
import { SiteResourcesTab } from '../geo-tabs/SiteResourcesTab';
import { SiteAddressModal } from '../geo-tabs/SiteAddressModal';

type TabId = 'general' | 'characteristics' | 'states' | 'organization' | 'subsites' | 'resources';
const TABS: Array<{ id: TabId; label: string; icon: LucideIcon }> = [
  { id: 'general', label: 'Geral', icon: FileText },
  { id: 'characteristics', label: 'Características', icon: SlidersHorizontal },
  { id: 'states', label: 'Estado', icon: Activity },
  { id: 'organization', label: 'Organização', icon: Building2 },
  { id: 'subsites', label: 'Locais Internos', icon: Layers },
  { id: 'resources', label: 'Recursos', icon: Boxes },
];

const inputClass =
  'w-full rounded-[8px] border border-app-border bg-app-panel px-2.5 py-1.5 text-[0.85rem] text-app-text outline-none focus:border-app-accent aria-[invalid=true]:border-status-red disabled:opacity-60';
// Campo "<nome> <valor>" lado a lado (abas Geral e Características).
const rowLabelClass =
  'grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2 text-[0.78rem] font-semibold text-app-muted';
const stateHeadClass =
  'border-b border-app-border pb-1 text-[0.8rem] font-semibold uppercase tracking-wide text-app-text';
const SITE_STATUS_TONE: Record<string, StatusTone> = {
  Planned: 'amber',
  InConstruction: 'amber',
  Active: 'green',
  InDeactivation: 'red',
  Retired: 'neutral',
};
const compactLabelClass =
  'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 text-[0.78rem] font-semibold text-app-muted';

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

function SiteTypeIcon({ spec }: { spec?: GeoSpec | undefined }) {
  const previewUrl = useVisualIdentityPreviewUrl(spec?.visualIdentity, 26, {
    shape: 'none',
    color: STUDIO_GEO_NEUTRAL_ICON_COLOR,
    assetColor: STUDIO_GEO_CUSTOM_ICON_COLOR,
  });
  if (previewUrl) {
    return (
      <img src={previewUrl} alt="" className="h-[26px] w-[26px] shrink-0" aria-hidden="true" />
    );
  }
  const CategoryIcon = spec ? locationCategoryIcon(spec.category) : Building2;
  return <CategoryIcon size={26} aria-hidden="true" />;
}

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
  // Tipo do local pai: limita os tipos oferecidos a um local interno em edição.
  const [parentSpecId, setParentSpecId] = useState<string | undefined>(undefined);
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [subAddress, setSubAddress] = useState<GeoAddress['subAddress']>(undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Depois de uma tentativa de salvar, os obrigatórios vazios passam a ser sinalizados nos campos.
  const [attempted, setAttempted] = useState(false);

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
        const parentSite = snapshot?.site.parentSite?.id
          ? await getGeoSite(snapshot.site.parentSite.id)
          : undefined;
        if (cancelled) return;
        setCities(cityList);
        setSpecs(specList);
        setParentSpecId(parentSite?.siteSpecificationId);
        const city =
          snapshot?.administrativeCity ??
          cityList.find((candidate) => candidate.id === initialAdministrativeCityId);
        setSite(snapshot?.site ?? null);
        setSubAddress(snapshot?.address?.subAddress);
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

  const specById = useMemo(() => new Map(specs.map((spec) => [spec.id, spec])), [specs]);
  // Local raiz: tipos ativos que não são SubSite. Local interno: tipos ativos que a regra de
  // contenção admite sob o pai. Em edição, o tipo atual aparece mesmo que não se encaixe.
  const rootSpecs = useMemo(() => {
    const parentSpec = parentSpecId ? specById.get(parentSpecId) : undefined;
    const fits = (spec: GeoSpec) =>
      parentSpec
        ? spec.allowedParentSpecIds.includes(parentSpec.id) &&
          parentSpec.allowedChildSpecIds.includes(spec.id)
        : spec.category !== 'SubSite';
    return specs.filter(
      (spec) =>
        (spec.lifecycleStatus === 'Active' && fits(spec)) ||
        (Boolean(initialSiteId) && spec.id === site?.siteSpecificationId),
    );
  }, [specs, specById, parentSpecId, initialSiteId, site?.siteSpecificationId]);

  // Troca de tipo mantém `_origin.*` (C5) e as características que o novo tipo também define;
  // descartar valores já preenchidos pede confirmação.
  const changeSpec = async (nextSpecId: string) => {
    if (!draft) return;
    const nextNames = new Set(
      (specById.get(nextSpecId)?.specCharacteristic ?? []).map((c) => c.name.trim().toLowerCase()),
    );
    const keep = (c: Characteristic) =>
      c.name.startsWith('_origin.') || nextNames.has(c.name.trim().toLowerCase());
    const dropped = draft.characteristic.filter(
      (c) => !keep(c) && c.value !== undefined && c.value !== null && c.value !== '',
    );
    if (dropped.length > 0) {
      const ok = await confirm({
        title: 'Trocar o tipo de local?',
        message: `O novo tipo não define ${dropped.length === 1 ? 'a característica' : 'as características'} ${dropped
          .map((c) => `"${c.name}"`)
          .join(
            ', ',
          )}. ${dropped.length === 1 ? 'O valor será descartado' : 'Os valores serão descartados'} ao salvar.`,
        confirmLabel: 'Trocar tipo',
        destructive: true,
      });
      if (!ok) return;
    }
    patch({ specId: nextSpecId, characteristic: draft.characteristic.filter(keep) });
  };

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
  // Sub-local herda o endereço do pai: município/logradouro deixam de ser obrigatórios.
  const isSubSite = Boolean(site?.parentSite) || currentSpec?.category === 'SubSite';
  // Local já cadastrado sem endereço (ex.: importado só com coordenada) também salva sem um;
  // se o logradouro for informado, o município passa a ser exigido.
  const addressOptional = isSubSite || Boolean(site && !site.address?.id);
  const requireCity = !addressOptional || Boolean(draft?.street.trim());
  const requireStreet = !addressOptional;

  const save = async () => {
    if (!draft) return;
    const missingAddress =
      (requireCity && !draft.cityId) || (requireStreet && !draft.street.trim());
    if (!draft.name.trim() || !draft.specId || missingAddress) {
      setAttempted(true);
      setError(
        !addressOptional
          ? 'Informe nome, tipo, município e logradouro.'
          : draft.street.trim()
            ? 'Informe nome, tipo e município.'
            : 'Informe nome e tipo.',
      );
      setTab('general');
      const firstInvalid = !draft.name.trim()
        ? 'site-field-name'
        : !draft.specId
          ? 'site-field-spec'
          : !draft.cityId
            ? 'site-field-city'
            : 'site-field-street';
      // O painel Geral só monta depois do setTab; espera o commit antes de focar.
      setTimeout(() => document.getElementById(firstInvalid)?.focus(), 0);
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
        // Município sem logradouro não forma endereço; o backend rejeitaria o par incompleto.
        ...(draft.cityId && (draft.street.trim() || !addressOptional)
          ? { administrativeCityId: draft.cityId }
          : {}),
        ...(draft.street.trim() ? { street: draft.street.trim() } : {}),
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
      {addressModalOpen && siteId && site ? (
        <SiteAddressModal
          siteId={siteId}
          currentAddressId={site.address?.id}
          currentLocationId={site.place?.id}
          currentSubAddress={subAddress}
          onClose={() => setAddressModalOpen(false)}
          onSaved={() => {
            setAddressModalOpen(false);
            void fetchSiteEditor(siteId).then((snapshot) => {
              setSite(snapshot.site);
              setSubAddress(snapshot.address?.subAddress);
              onChanged(siteId);
            });
          }}
        />
      ) : null}
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
          className="flex w-[220px] shrink-0 flex-col gap-1 border-r border-app-border bg-app-sidebar p-4 max-sm:hidden"
        >
          <div className="mb-3.5 flex items-center gap-3 border-b border-app-border pb-3.5">
            <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-app-accent-soft text-app-text">
              <SiteTypeIcon spec={currentSpec} />
            </span>
            <span
              className="truncate text-[1.15rem] font-semibold leading-tight text-app-text"
              title={currentSpec?.name ?? 'Sem tipo'}
            >
              {currentSpec?.name ?? 'Sem tipo'}
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
          <header className="box-border flex h-[65px] shrink-0 items-center justify-between gap-3 border-b border-app-border px-6">
            <div className="min-w-0 flex-1">
              <h2 className="flex min-w-0 items-baseline gap-2 text-[1.15rem] font-semibold text-app-text">
                <span className="shrink-0 text-[0.72rem] font-semibold uppercase tracking-wide text-app-muted">
                  {title}
                </span>
                <span className="truncate" title={draft?.name || 'Sem nome'}>
                  {draft?.name || 'Sem nome'}
                </span>
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
              <div className="grid items-start gap-x-6 gap-y-3 sm:grid-cols-6">
                <label className={`${rowLabelClass} sm:col-span-3`}>
                  Nome
                  <input
                    id="site-field-name"
                    aria-required="true"
                    aria-invalid={attempted && !draft.name.trim()}
                    aria-describedby={
                      attempted && !draft.name.trim() ? 'site-editor-error' : undefined
                    }
                    className={inputClass}
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label className={`${rowLabelClass} sm:col-span-3`}>
                  Tipo de local
                  <select
                    id="site-field-spec"
                    aria-required="true"
                    aria-invalid={attempted && !draft.specId}
                    aria-describedby={attempted && !draft.specId ? 'site-editor-error' : undefined}
                    className={inputClass}
                    value={draft.specId}
                    onChange={(e) => void changeSpec(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {rootSpecs.map((spec) => (
                      <option key={spec.id} value={spec.id}>
                        {spec.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${compactLabelClass} sm:col-span-2`}>
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
                <label className={`${compactLabelClass} sm:col-span-1`}>
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
                <label className={`${compactLabelClass} sm:col-span-3`}>
                  Município
                  <select
                    id="site-field-city"
                    aria-required={requireCity}
                    aria-invalid={attempted && requireCity && !draft.cityId}
                    aria-describedby={
                      attempted && requireCity && !draft.cityId ? 'site-editor-error' : undefined
                    }
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
                <label className={`${compactLabelClass} sm:col-span-4`}>
                  Logradouro
                  <input
                    id="site-field-street"
                    aria-required={requireStreet}
                    aria-invalid={attempted && requireStreet && !draft.street.trim()}
                    aria-describedby={
                      attempted && requireStreet && !draft.street.trim()
                        ? 'site-editor-error'
                        : undefined
                    }
                    className={inputClass}
                    value={draft.street}
                    onChange={(e) => patch({ street: e.target.value })}
                  />
                </label>
                <label className={`${compactLabelClass} sm:col-span-2`}>
                  Número
                  <input
                    className={inputClass}
                    value={draft.streetNr}
                    onChange={(e) => patch({ streetNr: e.target.value })}
                  />
                </label>
                <div className="grid items-start gap-x-6 sm:col-span-6 sm:grid-cols-[1.4fr_4.6fr]">
                  <label className={`${compactLabelClass} !items-start`}>
                    <span className="pt-2">CEP</span>
                    <input
                      className={inputClass}
                      value={draft.postcode}
                      onChange={(e) => patch({ postcode: e.target.value })}
                    />
                  </label>
                  <label className={`${compactLabelClass} !items-start`}>
                    <span className="pt-2">Observação</span>
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={draft.note}
                      onChange={(e) => patch({ note: e.target.value })}
                    />
                  </label>
                </div>
                {siteId && site ? (
                  <div className="sm:col-span-6">
                    <Button variant="ghost" onClick={() => setAddressModalOpen(true)}>
                      <MapPin size={15} aria-hidden="true" /> Localizar no mapa
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : tab === 'characteristics' ? (
              <CharacteristicsTab spec={currentSpec} draft={draft} patch={patch} />
            ) : tab === 'states' ? (
              <div className="grid gap-3">
                <div className="grid grid-cols-[minmax(130px,0.8fr)_minmax(200px,1.4fr)_minmax(150px,1fr)] items-center gap-x-4 gap-y-3 max-sm:grid-cols-1">
                  <span className={stateHeadClass}>Estado</span>
                  <span className={stateHeadClass}>Valor</span>
                  <span className={stateHeadClass}>Última alteração</span>
                  <span className="text-[0.85rem] font-medium text-app-text">Status</span>
                  <StateSelect
                    value={draft.status}
                    options={SITE_STATUS_OPTIONS.map((o) => [o.value, o.label] as const)}
                    tones={SITE_STATUS_TONE}
                    ariaLabel="Status"
                    onChange={(value) => patch({ status: value as GeoSiteStatus })}
                  />
                  <span className="text-[0.82rem] text-app-muted">
                    {formatStateDate(site?.statusDate)}
                  </span>
                  <span className="self-start pt-2 text-[0.85rem] font-medium text-app-text">
                    Motivo do status
                  </span>
                  <textarea
                    aria-label="Motivo do status"
                    className={inputClass}
                    rows={3}
                    value={draft.statusReason}
                    onChange={(e) => patch({ statusReason: e.target.value })}
                  />
                  <span />
                </div>
                <p className="text-[0.75rem] text-app-muted">
                  O motivo é obrigatório para desativar, aposentar ou reativar o local.
                </p>
              </div>
            ) : tab === 'organization' ? (
              <OrganizationTab draft={draft} patch={patch} />
            ) : tab === 'resources' ? (
              siteId ? (
                <SiteResourcesTab siteId={siteId} canEdit onOpenResource={() => undefined} />
              ) : (
                <p className="text-[0.85rem] text-app-muted">
                  Salve o local para gerenciar seus recursos.
                </p>
              )
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
              id="site-editor-error"
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
    <div className="grid gap-x-6 sm:grid-cols-2">
      <SiteInstanceCharacteristics
        definitions={definitions}
        characteristic={draft.characteristic}
        canEdit
        onPatch={async ({ characteristic }) => patch({ characteristic })}
      />
    </div>
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
            placeholder="Papel (ex.: proprietário)"
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
