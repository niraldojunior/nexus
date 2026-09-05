// Kernel de Governance do Nexus Studio (D-ARQ-005, issue #191/#193).
//
// O envelope aqui NÃO substitui as entidades TMF de cada domínio (ResourceCatalog, Party,
// GeographicSiteSpecification etc.) — elas continuam canônicas. `StudioVersion.snapshot` guarda o
// conjunto de mudanças que um domínio propõe; o adapter do domínio (registrado em
// `StudioService`) é quem sabe validar e materializar esse snapshot nas tabelas reais na
// publicação. Ver plano `docs/5-delivery-plan/architecture-decisions.md` D-ARQ-005.

/** Os 8 domínios governados pelo Studio. `governance` (visão agregada) não é um domínio em si. */
export type StudioDomain =
  | 'resource-model'
  | 'location-model'
  | 'spatial'
  | 'studio-geo'
  | 'parties'
  | 'reference-data'
  | 'rules-workflows'
  | 'templates';

export const STUDIO_DOMAINS: StudioDomain[] = [
  'resource-model',
  'location-model',
  'spatial',
  'studio-geo',
  'parties',
  'reference-data',
  'rules-workflows',
  'templates',
];

export const isStudioDomain = (value: unknown): value is StudioDomain =>
  typeof value === 'string' && (STUDIO_DOMAINS as string[]).includes(value);

export type StudioVersionStatus = 'draft' | 'published' | 'discarded';

export type StudioValidationSeverity = 'error' | 'warning';

export type StudioValidationIssue = {
  severity: StudioValidationSeverity;
  code: string;
  message: string;
  /** Caminho opcional dentro do snapshot (ex.: "nodes[3].code") apontando a origem do problema. */
  path?: string;
};

export type StudioValidationResult = {
  valid: boolean;
  issues: StudioValidationIssue[];
  validatedAt: string;
};

/**
 * Snapshot imutável de uma versão (draft ou publicada) de um domínio, para um tenant.
 * `snapshot` é opaco ao kernel — só o adapter do domínio interpreta seu conteúdo.
 */
export type StudioVersion = {
  '@type': 'StudioVersion';
  id: string;
  href: string;
  tenantId: string;
  domain: StudioDomain;
  /** Sequencial por workspace (tenant+domain), começando em 1. Nunca reutilizado. */
  versionNumber: number;
  status: StudioVersionStatus;
  snapshot: Record<string, unknown>;
  /**
   * Estado vivo do domínio capturado no instante em que este draft foi aberto ("Editar").
   * Imutável após a criação do draft — nunca é atualizado por `saveDraft` em drafts existentes.
   * Usado por `discardDraft` para restaurar o domínio ao estado anterior à edição (revert real),
   * já que cada ação do Studio grava imediatamente nas tabelas canônicas (sem draft em memória).
   */
  baselineSnapshot?: Record<string, unknown>;
  /** SHA-256 do snapshot serializado — usado como precondição otimista (`If-Match`). */
  checksum: string;
  validation?: StudioValidationResult;
  /** Versão publicada da qual este draft partiu, se houver (para diff/compare). */
  baseVersionId?: string;
  createdAt: string;
  createdBy: string;
  publishedAt?: string;
  publishedBy?: string;
  discardedAt?: string;
  discardedBy?: string;
};

/**
 * Estado corrente do par draft/published de um tenant+domínio. No máximo um draft por vez
 * (C9-like: sem lista aberta de rascunhos concorrentes).
 */
export type StudioWorkspace = {
  '@type': 'StudioWorkspace';
  id: string;
  href: string;
  tenantId: string;
  domain: StudioDomain;
  publishedVersionId?: string;
  draftVersionId?: string;
  updatedAt: string;
};

export type StudioAuditEntry = {
  '@type': 'StudioAuditEntry';
  id: string;
  tenantId: string;
  domain: StudioDomain;
  action: 'draft-created' | 'draft-updated' | 'draft-validated' | 'published' | 'discarded';
  versionId: string;
  versionNumber: number;
  actorSub: string;
  eventTime: string;
};

export type CreateOrUpdateDraftInput = {
  tenantId: string;
  domain: StudioDomain;
  snapshot: Record<string, unknown>;
  actorSub: string;
  /** Checksum da versão draft atual — obrigatório ao atualizar um draft já existente. */
  ifMatch?: string;
};

export type PublishDraftInput = {
  tenantId: string;
  domain: StudioDomain;
  actorSub: string;
  ifMatch: string;
};

export type DiscardDraftInput = {
  tenantId: string;
  domain: StudioDomain;
  actorSub: string;
  ifMatch: string;
};

/** Contrato que cada domínio implementa para participar da Governance. Registro em `StudioService`. */
export interface StudioDomainAdapter {
  domain: StudioDomain;
  /** Valida a forma/consistência do snapshot antes de permitir publicação. */
  validate(snapshot: Record<string, unknown>): Promise<StudioValidationResult> | StudioValidationResult;
  /**
   * Materializa o snapshot publicado nas tabelas canônicas do domínio. Chamado dentro da mesma
   * transação da publicação do kernel. Adapters ainda não implementados (PR3+) usam o no-op padrão
   * (`createNoopStudioDomainAdapter`), que bloqueia a publicação até existir uma implementação
   * capaz de materializar a projeção canônica.
   */
  materialize(snapshot: Record<string, unknown>, context: { tenantId: string }): Promise<void> | void;
}

export const createNoopStudioDomainAdapter = (domain: StudioDomain): StudioDomainAdapter => ({
  domain,
  // O envelope pode guardar draft antes da chegada do editor de domínio, mas nunca simula uma
  // publicação. Só um adapter real (PR do domínio) pode validar e materializar sua projeção.
  validate: () => ({
    valid: false,
    issues: [
      {
        severity: 'error',
        code: 'STUDIO_DOMAIN_ADAPTER_PENDING',
        message: `O domínio ${domain} ainda não está habilitado para publicação.`,
      },
    ],
    validatedAt: new Date().toISOString(),
  }),
  materialize: () => undefined,
});
