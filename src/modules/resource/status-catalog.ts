import type { ResourceStatusCatalogEntry } from './domain.js';

/**
 * Forma de bootstrap: `resourceTypeCode` (não `resourceTypeId`) porque estes são dados estáticos,
 * sem tenant — o `id` do ResourceType só existe depois de materializado por tenant
 * (`createCanonicalId()` em runtime). O seed resolve `code → id` no tenant de destino antes de
 * gravar (`PostgresResourceRepository.seedStatusCatalog`).
 */
export type ResourceStatusDefault = Omit<
  ResourceStatusCatalogEntry,
  '@type' | 'resourceTypeId' | 'tenantId'
> & { resourceTypeCode?: string };

/**
 * Catálogo canônico de estados granulares do recurso (issue #171).
 *
 * O eixo SID (`ResourceBase.status`, CHECK fechado em active/inactive/suspended/terminated) diz
 * *o que* o recurso é para o inventário; este catálogo diz *por quê* — "Bloqueado por área de
 * risco" em vez de só "Bloqueado". Substitui a characteristic `substatus`, texto livre que as
 * cargas Netwin gravavam a partir de `ds_estado_controle` (`scripts/load-recursos-netwin.mjs`).
 *
 * Os codes abaixo cobrem os 45 valores distintos de `substatus` que existem hoje na base Oracle
 * de dev (~1,48M recursos); `resourceType` marca os específicos de CTO, `undefined` os que valem
 * para qualquer recurso (os estados de projeto dos cabos e dutos). O catálogo é bootstrapped por
 * tenant e extensível via API (C9) — acrescentar estado aqui não exige DDL.
 *
 * `behavior` é a projeção do estado no eixo SID, para a UI raciocinar sem conhecer cada code.
 */
export const RESOURCE_STATUS_DEFAULTS: ResourceStatusDefault[] = [
  // ---------------------------------------------------------------- transversais
  { code: 'planned', name: 'Em Projeto', sortOrder: 10, active: true, behavior: 'planned' },
  { code: 'designed', name: 'Projetado', sortOrder: 11, active: true, behavior: 'planned' },

  // ------------------------------------------------------- CTO · ciclo de projeto
  {
    code: 'project_completed',
    name: 'Projeto concluído',
    resourceTypeCode: 'CTO',
    sortOrder: 100,
    active: true,
    behavior: 'planned',
  },
  {
    code: 'project_incomplete_auth_denied',
    name: 'Projeto incompleto — autorização negada',
    resourceTypeCode: 'CTO',
    sortOrder: 101,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'project_discarded_auth_denied',
    name: 'Projeto descartado — autorização negada para projeto',
    resourceTypeCode: 'CTO',
    sortOrder: 102,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'project_supplementary_external',
    name: 'Projeto complementar — rede externa',
    resourceTypeCode: 'CTO',
    sortOrder: 103,
    active: true,
    behavior: 'planned',
  },
  {
    code: 'auth_denied_project',
    name: 'Autorização negada para projeto',
    resourceTypeCode: 'CTO',
    sortOrder: 104,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'docs_missing_information',
    name: 'Documentos com falta de informação',
    resourceTypeCode: 'CTO',
    sortOrder: 105,
    active: true,
    behavior: 'blocked',
  },

  // ----------------------------------------------------------- CTO · ciclo de obra
  {
    code: 'work_not_started',
    name: 'Obra não iniciada',
    resourceTypeCode: 'CTO',
    sortOrder: 200,
    active: true,
    behavior: 'planned',
  },
  {
    code: 'work_started',
    name: 'Obra iniciada',
    resourceTypeCode: 'CTO',
    sortOrder: 201,
    active: true,
    behavior: 'planned',
  },
  {
    code: 'work_partial_riser_pending',
    name: 'Obra parcial — prumada com pendência',
    resourceTypeCode: 'CTO',
    sortOrder: 202,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'auth_denied_construction',
    name: 'Autorização negada para construção',
    resourceTypeCode: 'CTO',
    sortOrder: 203,
    active: true,
    behavior: 'blocked',
  },

  // ---------------------------------------------- CTO · bloqueios transversais de inventário
  // Diferentes etapas da origem (obra descartada / instalação impedida / sem acesso) colapsam no
  // mesmo motivo que a operação pediu para o painel. A frase original continua em `substatus`.
  {
    code: 'blocked_risk_area',
    name: 'Bloqueado por área de risco',
    resourceTypeCode: 'CTO',
    sortOrder: 290,
    active: true,
    behavior: 'blocked',
  },

  // -------------------------------------------------- CTO · obra impedida (blocked)
  {
    code: 'work_blocked_riser_obstruction',
    name: 'Obra impedida — obstrução na prumada',
    resourceTypeCode: 'CTO',
    sortOrder: 300,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'work_blocked_access_obstruction',
    name: 'Obra impedida — obstrução no acesso',
    resourceTypeCode: 'CTO',
    sortOrder: 301,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'work_blocked_external_obstruction',
    name: 'Obra impedida — obstrução externa',
    resourceTypeCode: 'CTO',
    sortOrder: 302,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'work_blocked_third_party_infra',
    name: 'Obra impedida — infraestrutura de terceiro inadequada',
    resourceTypeCode: 'CTO',
    sortOrder: 303,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'work_blocked_embargoed',
    name: 'Obra impedida — obra embargada',
    resourceTypeCode: 'CTO',
    sortOrder: 304,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'work_blocked_inadequate_cdo',
    name: 'Obra impedida — CDO inadequada',
    resourceTypeCode: 'CTO',
    sortOrder: 305,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'work_blocked_awaiting_civil_works',
    name: 'Obra impedida — aguarda obra civil',
    resourceTypeCode: 'CTO',
    sortOrder: 306,
    active: true,
    behavior: 'blocked',
  },

  // ------------------------------------------------ CTO · obra descartada (inactive)
  {
    code: 'work_discarded_access_denied',
    name: 'Obra descartada — acesso negado para construção',
    resourceTypeCode: 'CTO',
    sortOrder: 401,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_riser_obstruction',
    name: 'Obra descartada — obstrução na prumada',
    resourceTypeCode: 'CTO',
    sortOrder: 402,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_access_obstruction',
    name: 'Obra descartada — obstrução no acesso',
    resourceTypeCode: 'CTO',
    sortOrder: 403,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_external_obstruction',
    name: 'Obra descartada — obstrução externa',
    resourceTypeCode: 'CTO',
    sortOrder: 404,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_auth_denied',
    name: 'Obra descartada — autorização negada para construção',
    resourceTypeCode: 'CTO',
    sortOrder: 405,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_no_authorization',
    name: 'Obra descartada — sem autorização',
    resourceTypeCode: 'CTO',
    sortOrder: 406,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_building_under_construction',
    name: 'Obra descartada — edificação em construção',
    resourceTypeCode: 'CTO',
    sortOrder: 407,
    active: true,
    behavior: 'inactive',
  },
  {
    code: 'work_discarded_no_room_for_cdo',
    name: 'Obra descartada — não comporta CDO',
    resourceTypeCode: 'CTO',
    sortOrder: 408,
    active: true,
    behavior: 'inactive',
  },

  // ------------------------------------------------ CTO · instalação impedida
  {
    code: 'install_blocked_access_obstructed',
    name: 'Instalação impedida — acesso obstruído ou inviável',
    resourceTypeCode: 'CTO',
    sortOrder: 501,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'install_blocked_access_denied',
    name: 'Instalação impedida — acesso negado',
    resourceTypeCode: 'CTO',
    sortOrder: 502,
    active: true,
    behavior: 'blocked',
  },

  // ------------------------------------------------------------- CTO · sem acesso
  {
    code: 'no_access_denied_construction',
    name: 'Sem acesso — acesso negado para construção',
    resourceTypeCode: 'CTO',
    sortOrder: 601,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'no_access_denied_project',
    name: 'Sem acesso — acesso negado para projeto',
    resourceTypeCode: 'CTO',
    sortOrder: 602,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'no_access_building_under_construction',
    name: 'Sem acesso — edificação em construção',
    resourceTypeCode: 'CTO',
    sortOrder: 603,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'no_access_test_denied',
    name: 'Sem acesso para teste — acesso negado',
    resourceTypeCode: 'CTO',
    sortOrder: 604,
    active: true,
    behavior: 'blocked',
  },
  // ------------------------------------------------- CTO · rede construída e aceite
  {
    code: 'network_built',
    name: 'Rede construída',
    resourceTypeCode: 'CTO',
    sortOrder: 700,
    active: true,
    behavior: 'active',
  },
  {
    code: 'network_validated',
    name: 'Rede validada',
    resourceTypeCode: 'CTO',
    sortOrder: 701,
    active: true,
    behavior: 'active',
  },
  {
    code: 'as_built_completed',
    name: 'As-built concluído',
    resourceTypeCode: 'CTO',
    sortOrder: 702,
    active: true,
    behavior: 'active',
  },
  {
    code: 'as_built_accepted',
    name: 'As-built aceito',
    resourceTypeCode: 'CTO',
    sortOrder: 703,
    active: true,
    behavior: 'active',
  },
  {
    code: 'optical_test_ok',
    name: 'Teste óptico OK',
    resourceTypeCode: 'CTO',
    sortOrder: 704,
    active: true,
    behavior: 'active',
  },
  {
    code: 'optical_test_nok',
    name: 'Teste óptico NOK',
    resourceTypeCode: 'CTO',
    sortOrder: 705,
    active: true,
    behavior: 'blocked',
  },
  {
    code: 'optical_test_nok_checklist',
    name: 'Teste óptico NOK / não liberado para checklist',
    resourceTypeCode: 'CTO',
    sortOrder: 706,
    active: true,
    behavior: 'blocked',
  },

  // ----------------------------------------------------------------- CTO · campo
  {
    code: 'equipment_vandalized',
    name: 'Equipamento vandalizado',
    resourceTypeCode: 'CTO',
    sortOrder: 800,
    active: true,
    behavior: 'blocked',
  },
];

/**
 * Normaliza um texto de estado da origem (Netwin `ds_estado_controle`) para comparação: decompõe,
 * tira acento e reduz tudo que não é alfanumérico a um único espaço. Isso já absorve pontuação e
 * caixa — mas **não** absorve mojibake que comeu uma letra ("INSTALA¿¿ÃO" perde o `Ç`), porque a
 * letra não está mais lá. Esses casos entram como alias explícito em `SUBSTATUS_ALIASES`.
 */
export const foldStatusText = (raw: string): string =>
  raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();

/** Tokens de 4+ letras — o esqueleto da frase, que sobrevive à corrupção de acentuação. */
const skeleton = (folded: string): string[] => folded.split(' ').filter((t) => t.length >= 4);

/**
 * `substatus` de texto livre → `code` do catálogo. Chaves já normalizadas por `foldStatusText`,
 * o que absorve as variantes com mojibake sem precisar listá-las uma a uma. Usado pelo backfill
 * (`scripts/backfill-resource-status-code.mjs`) e pelas cargas novas.
 */
export const SUBSTATUS_TO_STATUS_CODE: Record<string, string> = Object.fromEntries(
  (
    [
      ['Em Projeto', 'planned'],
      ['Projetado', 'designed'],
      ['PROJETO CONCLUÍDO', 'project_completed'],
      ['PROJETO INCOMPLETO - AUTORIZAÇÃO NEGADA', 'project_incomplete_auth_denied'],
      ['PROJETO DESCARTADO - AUTORIZAÇÃO NEGADA P/ PROJETO', 'project_discarded_auth_denied'],
      ['PROJETO COMPLEMENTAR - REDE EXTERNA', 'project_supplementary_external'],
      ['AUTORIZAÇÃO NEGADA PARA PROJETO', 'auth_denied_project'],
      ['DOCUMENTOS COM FALTA DE INFORMAÇÃO', 'docs_missing_information'],
      ['OBRA NÃO INICIADA', 'work_not_started'],
      ['OBRA INICIADA', 'work_started'],
      ['OBRA PARCIAL - PRUMADA COM PENDÊNCIA', 'work_partial_riser_pending'],
      ['AUTORIZAÇÃO NEGADA PARA CONSTRUÇÃO', 'auth_denied_construction'],
      ['OBRA IMPEDIDA - OBSTRUÇÃO NA PRUMADA', 'work_blocked_riser_obstruction'],
      ['OBRA IMPEDIDA - OBSTRUÇÃO NO ACESSO', 'work_blocked_access_obstruction'],
      ['OBRA IMPEDIDA - OBSTRUÇÃO EXTERNA', 'work_blocked_external_obstruction'],
      ['OBRA IMPEDIDA - INFRAESTR. DE TERCEIRO INADEQUADA', 'work_blocked_third_party_infra'],
      ['OBRA IMPEDIDA - OBRA EMBARGADA', 'work_blocked_embargoed'],
      ['OBRA IMPEDIDA - CDO INADEQUADA', 'work_blocked_inadequate_cdo'],
      ['OBRA IMPEDIDA - AGUARDA OBRA CIVIL', 'work_blocked_awaiting_civil_works'],
      ['OBRA DESCARTADA - ÁREA DE RISCO', 'blocked_risk_area'],
      ['OBRA DESCARTADA - ACESSO NEGADO PARA CONSTRUÇÃO', 'work_discarded_access_denied'],
      ['OBRA DESCARTADA - OBSTRUÇÃO NA PRUMADA', 'work_discarded_riser_obstruction'],
      ['OBRA DESCARTADA - OBSTRUÇÃO NO ACESSO', 'work_discarded_access_obstruction'],
      ['OBRA DESCARTADA - OBSTRUÇÃO EXTERNA', 'work_discarded_external_obstruction'],
      ['OBRA DESCARTADA - AUTORIZAÇÃO NEGADA P/ CONSTRUÇÃO', 'work_discarded_auth_denied'],
      ['OBRA DESCARTADA - SEM AUTORIZAÇÃO', 'work_discarded_no_authorization'],
      [
        'OBRA DESCARTADA - EDIFICAÇÃO EM CONSTRUÇÃO',
        'work_discarded_building_under_construction',
      ],
      ['OBRA DESCARTADA - NÃO COMPORTA CDO', 'work_discarded_no_room_for_cdo'],
      ['INSTALAÇÃO IMPEDIDA - ÁREA DE RISCO', 'blocked_risk_area'],
      ['INSTALAÇÃO IMPEDIDA - ACESSO OBSTRUÍDO OU INVIÁVEL', 'install_blocked_access_obstructed'],
      ['INSTALAÇÃO IMPEDIDA - ACESSO NEGADO', 'install_blocked_access_denied'],
      ['SEM ACESSO - ÁREA DE RISCO', 'blocked_risk_area'],
      ['SEM ACESSO - ACESSO NEGADO PARA CONSTRUÇÃO', 'no_access_denied_construction'],
      ['SEM ACESSO - ACESSO NEGADO PARA PROJETO', 'no_access_denied_project'],
      ['SEM ACESSO - EDIFICAÇÃO EM CONSTRUÇÃO', 'no_access_building_under_construction'],
      ['SEM ACESSO PARA TESTE - ACESSO NEGADO', 'no_access_test_denied'],
      ['SEM ACESSO PARA TESTE - ÁREA DE RISCO', 'blocked_risk_area'],
      ['REDE CONSTRUÍDA', 'network_built'],
      ['REDE VALIDADA', 'network_validated'],
      ['AS-BUILT CONCLUÍDO', 'as_built_completed'],
      ['AS-BUILT ACEITO', 'as_built_accepted'],
      ['TESTE ÓPTICO OK', 'optical_test_ok'],
      ['TESTE ÓPTICO NOK', 'optical_test_nok'],
      ['TESTE ÓPTICO NOK / NÃO LIBERADO PARA CHECKLIST', 'optical_test_nok_checklist'],
      ['EQUIPAMENTO VANDALIZADO', 'equipment_vandalized'],
    ] as const
  ).map(([text, code]) => [foldStatusText(text), code]),
);

// Aliases exatos das grafias corrompidas observadas na base. A extração substituiu letras por
// `¿`, então só remover pontuação não recompõe "concluído"/"instalação"/"construção".
const CORRUPTED_STATUS_ALIASES: Readonly<Record<string, string>> = Object.fromEntries(
  (
    [
      ['AS-BUILT CONCLU¿¿¿¿DO', 'as_built_completed'],
      [
        'INSTALA¿¿ÃO IMPEDIDA - ACESSO OBSTRUÍDO OU INVIÁVEL',
        'install_blocked_access_obstructed',
      ],
      [
        'INSTALAÇÃO IMPEDIDA - ACESSO OBSTRUÃ DO OU INVIÃ VEL',
        'install_blocked_access_obstructed',
      ],
      ['AUTORIZAÇÃO NEGADA PARA CONSTRU¿¿¿¿ÃO', 'auth_denied_construction'],
    ] as const
  ).map(([text, code]) => [foldStatusText(text), code]),
);

/** Índice auxiliar para o fallback por esqueleto: cada entrada com seus tokens longos. */
const SKELETON_INDEX: readonly { tokens: string[]; code: string }[] = Object.entries(
  SUBSTATUS_TO_STATUS_CODE,
).map(([folded, code]) => ({ tokens: skeleton(folded), code }));

/**
 * Resolve o `status_code` de um `substatus` cru.
 *
 * Casa primeiro pelo texto normalizado. Se não casar, tenta pelo esqueleto (tokens de 4+ letras),
 * o que recupera as ~7 linhas cuja acentuação foi destruída pela extração Latin-1 lida como UTF-8
 * ("INSTALA¿¿ÃO IMPEDIDA - ACESSO OBSTRUÍDO..." casa com a frase canônica pelos tokens intactos).
 * Exige que todos os tokens do candidato estejam presentes e que a contagem bata, para não colapsar
 * frases parecidas ("OBRA IMPEDIDA - ..." vs "OBRA DESCARTADA - ...") no mesmo code.
 */
export const resolveStatusCode = (substatus: string | null | undefined): string | undefined => {
  if (!substatus) return undefined;
  const folded = foldStatusText(substatus);
  const exact = SUBSTATUS_TO_STATUS_CODE[folded] ?? CORRUPTED_STATUS_ALIASES[folded];
  if (exact) return exact;

  const tokens = skeleton(folded);
  if (tokens.length === 0) return undefined;
  const matches = SKELETON_INDEX.filter(
    (entry) =>
      entry.tokens.length === tokens.length && entry.tokens.every((t) => tokens.includes(t)),
  );
  return matches.length === 1 ? matches[0]!.code : undefined;
};
