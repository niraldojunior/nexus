// Dicionário único de rótulos pt-BR para o módulo Geo. Os valores canônicos (status,
// código/nome de GeographicSiteSpecification, categoria TMF) continuam em inglês no
// domínio/banco (C1, TMF-first) — este arquivo é a única fonte de tradução para exibição,
// para que nenhuma página mantenha seu próprio dicionário local duplicado.

import type { GeoSiteStatus, GeoSpec, GeoSpecCategory, GeoStatus } from '../services/geoApi';

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

export const PROJECT_STATUS_OPTIONS: ReadonlyArray<{ value: GeoStatus; label: string }> = [
  { value: 'planned', label: 'Planejado' },
  { value: 'active', label: 'Ativo' },
  { value: 'suspended', label: 'Suspenso' },
  { value: 'terminated', label: 'Terminado' },
];

export function projectStatusLabel(status: string | undefined): string {
  return PROJECT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status ?? '—';
}

// --- StatusBadge: rótulo + tom de cor num só lookup, cobrindo os dois vocabulários ----
// acima (site e projeto nunca colidem — 'Active' vs 'active' são chaves distintas).

export type StatusTone = 'green' | 'red' | 'amber' | 'neutral';

const STATUS_BADGE_META: Record<string, { label: string; tone: StatusTone }> = {
  planned: { label: 'Planejado', tone: 'amber' },
  active: { label: 'Ativo', tone: 'green' },
  suspended: { label: 'Suspenso', tone: 'red' },
  terminated: { label: 'Terminado', tone: 'neutral' },
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
  FunctionalGroup: 'Grupo Funcional',
  Site: 'Local',
  SubSite: 'Sub-local',
};

export function siteSpecCategoryLabel(category: string | undefined): string {
  return (category && SITE_SPEC_CATEGORY_LABELS[category as GeoSpecCategory]) ?? category ?? '—';
}

// --- Nome de GeographicSiteSpecification (tipos de site) ------------------------------
// Cobre os tipos do bootstrap canônico (src/modules/geo/service.ts BOOTSTRAP_SPECIFICATIONS).
// Tipos criados ad-hoc via catálogo (TypeManagementModal) não têm entrada aqui e caem no
// nome cru — não há como adivinhar a tradução de um tipo que o usuário acabou de inventar.
const SITE_SPEC_TRANSLATIONS: ReadonlyArray<{ code: string; name: string; label: string }> = [
  { code: 'REGION', name: 'Region', label: 'Região' },
  { code: 'FUNCTIONAL_GROUP', name: 'Functional Group', label: 'Grupo Funcional' },
  { code: 'CO', name: 'Central Office', label: 'Estação (CO)' },
  { code: 'POP', name: 'POP', label: 'POP' },
  { code: 'CABINET', name: 'Cabinet', label: 'Gabinete' },
  { code: 'INSTALLATION_POINT', name: 'Installation Point', label: 'Ponto de Instalação' },
  { code: 'CONDOMINIUM', name: 'Condominium', label: 'Condomínio' },
  { code: 'BLOCK', name: 'Building Block', label: 'Bloco' },
  { code: 'FLOOR', name: 'Floor', label: 'Pavimento' },
  { code: 'ROOM', name: 'Room', label: 'Sala' },
  { code: 'CAGE', name: 'Cage', label: 'Área Segmentada' },
];

const SITE_SPEC_LABEL_BY_CODE = new Map(
  SITE_SPEC_TRANSLATIONS.map((entry) => [entry.code, entry.label]),
);
const SITE_SPEC_LABEL_BY_NAME = new Map(
  SITE_SPEC_TRANSLATIONS.map((entry) => [entry.name, entry.label]),
);

// Para telas com a spec completa (código + nome) — resolução precisa por código.
export function siteSpecLabel(spec?: Pick<GeoSpec, 'code' | 'name'> | null): string {
  if (!spec) return '—';
  return (
    (spec.code && SITE_SPEC_LABEL_BY_CODE.get(spec.code)) ??
    SITE_SPEC_LABEL_BY_NAME.get(spec.name) ??
    spec.name
  );
}

// Para telas que só têm o nome cru da spec (ex.: `sublabel` da árvore/busca, que já vem
// resolvido pelo backend sem o código) — cai no próprio nome quando não reconhecido.
export function siteSpecNameLabel(name: string | undefined): string | undefined {
  if (!name) return undefined;
  return SITE_SPEC_LABEL_BY_NAME.get(name) ?? name;
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
