// Operações do Nexus Studio via MCP (D-ARQ-005). Papéis iguais aos de routeStudioRequest: leitura
// STUDIO_READ, rascunho/validação/templates STUDIO_EDIT, publicar/descartar STUDIO_ADMIN.
// Publish e discard exigem If-Match: o prepare lê o checksum do draft e o guarda no payload; se
// o draft mudar até a confirmação, o commit falha em vez de publicar algo que o usuário não viu.

import { AppError } from '../../../shared/errors/app-error.js';
import {
  STUDIO_ADMIN_ROLES,
  STUDIO_EDIT_ROLES,
  STUDIO_READ_ROLES,
} from '../../../shared/http/roles.js';
import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import {
  StudioTemplateImportPlanner,
  type ComputePlanInput,
} from '../../studio/template-import-planner.js';
import { STUDIO_DOMAINS, type StudioDomain } from '../../studio/domain.js';
import type { McpToolRegistry } from '../module.js';
import type { JsonSchema } from '../schema.js';
import { createOperationHelpers, idSchema, listPaging, obj, opt, s, str } from './helpers.js';

const domainProp: JsonSchema = { type: 'string', enum: [...STUDIO_DOMAINS] };
const domainSchema = (
  extra: Record<string, JsonSchema> = {},
  required: string[] = [],
): JsonSchema => ({
  type: 'object',
  properties: { domain: domainProp, ...extra },
  required: ['domain', ...required],
  additionalProperties: false,
});
const dom = (input: Record<string, unknown>) => input.domain as StudioDomain;

export const registerStudioOperations = (
  registry: McpToolRegistry,
  runtime: NexusRuntime,
): void => {
  const studio = runtime.studioService;
  const assets = runtime.studioAssetService;
  const { read, write, simpleWrite } = createOperationHelpers(registry, 'studio', {
    read: STUDIO_READ_ROLES,
    write: STUDIO_EDIT_ROLES,
  });

  /** Checksum do draft aberto; sem draft não há o que publicar/descartar. */
  const draftChecksum = async (
    input: Record<string, unknown>,
    context: Parameters<typeof studio.getStatus>[1],
  ): Promise<string> => {
    const status = await studio.getStatus(dom(input), context);
    if (!status.draftVersion) {
      throw new AppError(`Não há draft aberto em ${dom(input)}.`, {
        code: 'STUDIO_NO_ACTIVE_DRAFT',
        statusCode: 409,
      });
    }
    return status.draftVersion.checksum;
  };

  // ── Leitura ──────────────────────────────────────────────────────────────────────────────────
  read(
    'get_status',
    'Estado do Studio num domínio: versão publicada e draft aberto.',
    domainSchema(),
    (i, c) => studio.getStatus(dom(i), c.requestContext),
  );
  read(
    'list_versions',
    'Histórico de versões de um domínio do Studio.',
    domainSchema(listPaging),
    (i, c) => studio.listVersions(dom(i), c.requestContext, opt(i, ['limit', 'offset'])),
  );
  read(
    'list_audit',
    'Trilha de auditoria de um domínio do Studio.',
    domainSchema(listPaging),
    (i, c) => studio.listAudit(dom(i), c.requestContext, opt(i, ['limit', 'offset'])),
  );
  read(
    'plan_template_import',
    'Calcula o plano de importação de um template (não grava).',
    {
      type: 'object',
      properties: { planInput: obj },
      required: ['planInput'],
      additionalProperties: false,
    },
    async (i) => StudioTemplateImportPlanner.computePlan(i.planInput as ComputePlanInput),
    STUDIO_EDIT_ROLES,
  );
  read(
    'list_assets',
    'Lista os assets do Studio (sem o conteúdo SVG).',
    { type: 'object', properties: {}, additionalProperties: false },
    async (_i, c) =>
      (await assets.list(c.requestContext)).map(({ content: _content, ...asset }) => asset),
  );

  // ── Draft, validação, publicação ─────────────────────────────────────────────────────────────
  write(
    'save_draft',
    'grava o snapshot do draft de um domínio (cria o draft se não houver).',
    domainSchema({ snapshot: obj, ifMatch: str }, ['snapshot']),
    async (i, c) => {
      const status = await studio.getStatus(dom(i), c.requestContext);
      const ifMatch = (i.ifMatch as string | undefined) ?? status.draftVersion?.checksum;
      return {
        summary: `O draft de ${dom(i)} será ${status.draftVersion ? 'atualizado' : 'criado'}.`,
        payload: { ...i, ...(ifMatch ? { ifMatch } : {}) },
      };
    },
    (i, c) =>
      studio.saveDraft(
        dom(i),
        i.snapshot as Record<string, unknown>,
        c.requestContext,
        i.ifMatch as string | undefined,
      ),
  );
  simpleWrite(
    'validate_draft',
    'valida o draft aberto de um domínio.',
    domainSchema(),
    (i) => `O draft de ${dom(i)} será validado.`,
    (i, c) => studio.validateDraft(dom(i), c.requestContext),
  );
  write(
    'publish',
    'publica o draft aberto de um domínio. O draft muda o comportamento do Nexus para todos os usuários.',
    domainSchema(),
    async (i, c) => ({
      summary: `O draft de ${dom(i)} será publicado.`,
      payload: { ...i, ifMatch: await draftChecksum(i, c.requestContext) },
    }),
    (i, c) => studio.publish(dom(i), c.requestContext, s(i.ifMatch)),
    STUDIO_ADMIN_ROLES,
  );
  write(
    'discard_draft',
    'descarta o draft aberto de um domínio e restaura o estado anterior à edição.',
    domainSchema(),
    async (i, c) => ({
      summary: `O draft de ${dom(i)} será descartado.`,
      payload: { ...i, ifMatch: await draftChecksum(i, c.requestContext) },
    }),
    (i, c) => studio.discardDraft(dom(i), c.requestContext, s(i.ifMatch)),
    STUDIO_ADMIN_ROLES,
  );

  // ── Templates: plan (read) → apply (write) ───────────────────────────────────────────────────
  write(
    'apply_template_import',
    'aplica um plano de importação de template nos drafts dos domínios-alvo.',
    {
      type: 'object',
      properties: { planInput: obj, planChecksum: str, targetDrafts: obj },
      required: ['planInput', 'planChecksum'],
      additionalProperties: false,
    },
    (i) => {
      const plan = StudioTemplateImportPlanner.computePlan(i.planInput as ComputePlanInput);
      if (plan.planChecksum !== i.planChecksum) {
        throw new AppError('plan checksum mismatch — recompute plan and try again', {
          code: 'STUDIO_TEMPLATE_PLAN_CHECKSUM_MISMATCH',
          statusCode: 412,
        });
      }
      if (!plan.canApply) {
        throw new AppError('cannot apply template import plan with unresolved conflicts', {
          code: 'STUDIO_TEMPLATE_PLAN_CONFLICTS_UNRESOLVED',
          statusCode: 422,
        });
      }
      const domains = Object.keys(plan.resultSnapshots).join(', ');
      return { summary: `O template será aplicado nos drafts de: ${domains}.` };
    },
    (i, c) => {
      const plan = StudioTemplateImportPlanner.computePlan(i.planInput as ComputePlanInput);
      const targetDrafts = (i.targetDrafts ?? {}) as Partial<
        Record<StudioDomain, { ifMatch?: string }>
      >;
      const batch: Partial<
        Record<StudioDomain, { snapshot: Record<string, unknown>; ifMatch?: string }>
      > = {};
      for (const [key, snapshot] of Object.entries(plan.resultSnapshots)) {
        const target = key as StudioDomain;
        const ifMatch = targetDrafts[target]?.ifMatch;
        batch[target] = { snapshot, ...(ifMatch ? { ifMatch } : {}) };
      }
      return studio
        .applyBatchDrafts(batch, c.requestContext)
        .then((versions) => ({ applied: true, planChecksum: plan.planChecksum, versions }));
    },
  );

  // ── Assets ───────────────────────────────────────────────────────────────────────────────────
  simpleWrite(
    'create_asset',
    'cria um asset (SVG) do Studio.',
    {
      type: 'object',
      properties: { payload: obj },
      required: ['payload'],
      additionalProperties: false,
    },
    (i) => `Asset ${s((i.payload as { name?: unknown })?.name ?? '')} será criado.`,
    (i, c) => assets.create((i.payload ?? {}) as Record<string, unknown>, c.requestContext),
  );
  simpleWrite(
    'retire_asset',
    'aposenta um asset do Studio.',
    idSchema(),
    (i) => `Asset ${s(i.id)} será aposentado.`,
    (i, c) => assets.retire(s(i.id), c.requestContext),
  );
};
