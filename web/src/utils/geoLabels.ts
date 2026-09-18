// Dicionário único de rótulos pt-BR para o módulo Geo. Os valores canônicos (status,
// código/nome de GeographicSiteSpecification, categoria TMF) continuam em inglês no
// domínio/banco (C1, TMF-first) — este arquivo é a única fonte de tradução para exibição,
// para que nenhuma página mantenha seu próprio dicionário local duplicado.

import type { GeoSiteRole, GeoSiteStatus, GeoSpec, GeoSpecCategory } from '../services/geoApi';
import type { GeoProjectStatus } from '../services/geoProjectApi';

// --- Status de GeographicSite (5 estados canônicos, PascalCase) -----------------------

export const SITE_STATUS_OPTIONS: ReadonlyArray<{ value: GeoSiteStatus; label: string }> = [
  { value: 'Planned', label: 'Planejado' },
  { value: 'InConstruction', label: 'Em Construção' },
  { value: 'Active', label: 'Ativo' },
  { value: 'InDeactivation', label: 'Em Desativação' },
  { value: 'Retired', label: 'Aposentado' },
];

export function siteStatusLabel(status: string | undefined): string {
  return SITE_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status ?? '—';
}

// --- Status de GeoProject (vocabulário separado, 4 estados lowercase) -----------------

export const PROJECT_STATUS_OPTIONS: ReadonlyArray<{ value: GeoProjectStatus; label: string }> = [
  { value: 'planned', label: 'Planejado' },
  { value: 'active', label: 'Ativo' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'terminated', label: 'Terminado' },
  { value: 'cancelled', label: 'Cancelado' },
];

export function projectStatusLabel(status: string | undefined): string {
  return PROJECT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status ?? '—';
}

// --- StatusBadge: rótulo + tom de cor num só lookup, cobrindo os dois vocabulários ----
// acima (site e projeto nunca colidem — 'Active' vs 'active' são chaves distintas).

export type StatusTone = 'green' | 'red' | 'amber' | 'neutral';

// Classes do "pill" de tom — usadas por StatusBadge e TonePill (geo-tabs), e por qualquer
// outro selo colorido de estado. Extraído para cá para não duplicar o trio de classes a
// cada novo consumidor (já estava repetido em StatusBadge/PrecisionBadge/AddressSourceCard).
export const TONE_CLASS: Record<StatusTone, string> = {
  green: 'border-status-green/30 bg-status-green-soft text-status-green',
  red: 'border-status-red/30 bg-status-red-soft text-status-red',
  amber: 'border-status-amber/30 bg-status-amber-soft text-status-amber',
  neutral: 'border-app-border bg-app-sidebar text-app-muted',
};

const STATUS_BADGE_META: Record<string, { label: string; tone: StatusTone }> = {
  planned: { label: 'Planejado', tone: 'amber' },
  active: { label: 'Ativo', tone: 'green' },
  suspended: { label: 'Suspenso', tone: 'red' },
  terminated: { label: 'Terminado', tone: 'neutral' },
  cancelled: { label: 'Cancelado', tone: 'red' },
  Planned: { label: 'Planejado', tone: 'amber' },
  InConstruction: { label: 'Em Construção', tone: 'amber' },
  Active: { label: 'Ativo', tone: 'green' },
  InDeactivation: { label: 'Em Desativação', tone: 'red' },
  Retired: { label: 'Aposentado', tone: 'neutral' },
};

export function statusBadgeMeta(status: string | undefined): { label: string; tone: StatusTone } {
  return (status ? STATUS_BADGE_META[status] : undefined) ?? { label: status ?? '—', tone: 'neutral' };
}

// --- Categoria TMF de GeographicSiteSpecification -------------------------------------

const SITE_SPEC_CATEGORY_LABELS: Record<GeoSpecCategory, string> = {
  Region: 'Região',
  Site: 'Local',
  SubSite: 'Sub-local',
};

export function siteSpecCategoryLabel(category: string | undefined): string {
  return (category && SITE_SPEC_CATEGORY_LABELS[category as GeoSpecCategory]) ?? category ?? '—';
}

// --- Papel funcional (siteRole, C11) do site: o que o site É, não onde ele cabe ------

export const SITE_ROLE_OPTIONS: ReadonlyArray<{ value: GeoSiteRole; label: string }> = [
  { value: 'grouping', label: 'Agrupamento' },
  { value: 'network', label: 'Site de Rede' },
  { value: 'property', label: 'Imóvel' },
  { value: 'service', label: 'Site de Serviço' },
];

const SITE_ROLE_LABELS: Record<GeoSiteRole, string> = {
  grouping: 'Agrupamento',
  network: 'Site de Rede',
  property: 'Imóvel',
  service: 'Site de Serviço',
};

export function siteRoleLabel(role: string | undefined): string {
  return (role && SITE_ROLE_LABELS[role as GeoSiteRole]) ?? role ?? '—';
}

// --- Nome de GeographicSiteSpecification (tipos de site) ------------------------------
// O nome vem 100% da modelagem (Studio) — GeographicSiteSpecification não tem tradução
// fixa por dicionário: o rótulo exibido É o nome que o usuário configurou no catálogo.

// Para telas com a spec completa (código + nome).
export function siteSpecLabel(spec?: Pick<GeoSpec, 'code' | 'name'> | null): string {
  return spec?.name ?? '—';
}

// --- Containment (que tipo de sub-local cabe embaixo de qual pai) ---------------------

// Specs de categoria SubSite que a spec do pai aceita como filho — a mesma checagem
// bidirecional que o backend faz em validateContainment (src/modules/geo/service.ts), só
// para não oferecer no combo um tipo que o PATCH recusaria de qualquer forma. Único cálculo
// para os dois lugares que precisam dele: o combo de criação de sub-local (SiteSubSitesTab)
// e o combo de tipo no cabeçalho do painel ao visualizar um sub-local já existente
// (SitePanel/ViewHeader) — os dois usavam a mesma regra, um copiado do outro.
export function allowedChildSpecsOf(
  parentSpec: GeoSpec | undefined,
  specs: GeoSpec[],
): GeoSpec[] {
  if (!parentSpec) return [];
  return specs.filter(
    (spec) =>
      spec.category === 'SubSite' &&
      parentSpec.allowedChildSpecIds.includes(spec.id) &&
      spec.allowedParentSpecIds.includes(parentSpec.id),
  );
}
