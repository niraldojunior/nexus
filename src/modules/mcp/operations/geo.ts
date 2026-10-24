// Operações de Geo expostas via MCP. Leitura executa direto; escrita é sempre prepare → commit,
// e ambos delegam ao GeoService com o RequestContext do ator (RBAC, audit e outbox do service).

import { AppError } from '../../../shared/errors/app-error.js';
import { createGoogleGeocodingGateway } from '../../geo/geocoding-gateway.js';
import type { NexusRuntime } from '../../../shared/runtime/nexus-runtime.js';
import type { McpToolContext, McpToolRegistry } from '../module.js';
import type { JsonSchema } from '../schema.js';

const str: JsonSchema = { type: 'string' };
const emptySchema: JsonSchema = { type: 'object', properties: {}, additionalProperties: false };
const idSchema = (extra: Record<string, JsonSchema> = {}, required: string[] = []): JsonSchema => ({
  type: 'object',
  properties: { id: str, ...extra },
  required: ['id', ...required],
  additionalProperties: false,
});
const payloadSchema: JsonSchema = {
  type: 'object',
  properties: { id: str, payload: { type: 'object', additionalProperties: true } },
  required: ['id', 'payload'],
  additionalProperties: false,
};
const confirmationTokenSchema: JsonSchema = {
  type: 'object',
  properties: { confirmationToken: str },
  required: ['confirmationToken'],
  additionalProperties: false,
};

export const registerGeoOperations = (registry: McpToolRegistry, runtime: NexusRuntime): void => {
  const geo = runtime.geoService;
  const tree = runtime.geoTreeService;
  const s = (value: unknown): string => String(value);
  const geocoder = createGoogleGeocodingGateway();
  const opt = (input: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(keys.filter((key) => input[key] !== undefined).map((k) => [k, input[k]]));

  const read = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    run: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
  ) =>
    registry.register({
      name: `geo.${operation}`,
      description,
      inputSchema,
      handler: async (input, context) =>
        registry.successResult('geo', operation, context, await run(input, context)),
    });

  const write = (
    operation: string,
    description: string,
    inputSchema: JsonSchema,
    summarize: (input: Record<string, unknown>) => string,
    execute: (input: Record<string, unknown>, context: McpToolContext) => Promise<unknown>,
  ) => {
    registry.register({
      name: `geo.${operation}`,
      description: `Prepara: ${description} Retorna confirmationToken; a execução exige confirmação do usuário.`,
      inputSchema,
      handler: (input, context) =>
        registry.prepareMutation('geo', operation, input, context, () => ({
          summary: summarize(input),
        })),
    });
    registry.register({
      name: `geo.commit_${operation}`,
      description: `Confirma e executa: ${description}`,
      inputSchema: confirmationTokenSchema,
      handler: (input, context) =>
        registry.commitMutation('geo', operation, s(input.confirmationToken), context, (pending) =>
          execute(pending.payload, context),
        ),
    });
  };

  const payloadOf = (input: Record<string, unknown>) =>
    (input.payload ?? {}) as Record<string, never>;

  // Leituras
  read('get_location', 'Obtém uma Geographic Location por id.', idSchema(), (i, c) =>
    geo.getLocation(s(i.id), c.requestContext),
  );
  read('get_location_references', 'Lista o que referencia uma Location.', idSchema(), (i, c) =>
    geo.getLocationReferences(s(i.id), c.requestContext),
  );
  read('get_site_tree', 'Árvore de sub-sites de um Site.', idSchema(), (i, c) =>
    geo.getSiteTree(s(i.id), c.requestContext),
  );
  read('list_site_relationships', 'Relações de um Site com outros.', idSchema(), (i, c) =>
    geo.listSiteRelationships(s(i.id), c.requestContext),
  );
  read(
    'get_site_deactivation_impact',
    'Impacto de desativar/aposentar um Site.',
    idSchema(),
    (i, c) => geo.getSiteDeactivationImpact(s(i.id), c.requestContext),
  );
  read('list_site_history', 'Histórico de status de um Site.', idSchema(), (i, c) =>
    geo.listSiteHistory(s(i.id), c.requestContext),
  );
  read('list_site_audit', 'Trilha de auditoria de um Site.', idSchema(), (i, c) =>
    geo.listSiteAudit(s(i.id), c.requestContext),
  );
  read('get_address_references', 'Lista o que referencia um Address.', idSchema(), (i, c) =>
    geo.getAddressReferences(s(i.id), c.requestContext),
  );
  read('list_relationship_types', 'Catálogo de tipos de relação de Geo.', emptySchema, (_i) =>
    geo.listRelationshipTypes(),
  );
  read(
    'tree_search',
    'Busca na árvore geográfica (UF, município, localidade, estação).',
    {
      type: 'object',
      properties: { term: str, limit: { type: 'number' } },
      required: ['term'],
      additionalProperties: false,
    },
    (i) => tree.search(s(i.term), opt(i, ['limit'])),
  );
  read('tree_roots', 'Raízes da árvore geográfica.', emptySchema, () => tree.roots());
  read(
    'tree_children',
    'Filhos de um nó da árvore geográfica.',
    idSchema({ limit: { type: 'number' }, offset: { type: 'number' } }),
    (i) => tree.children(s(i.id), opt(i, ['limit', 'offset'])),
  );
  read(
    'tree_sites_by_address',
    'Sites já cadastrados em um endereço (rua + número, com cidade/UF/CEP opcionais).',
    {
      type: 'object',
      properties: {
        street: str,
        streetNr: str,
        city: str,
        stateOrProvince: str,
        postcode: str,
        country: str,
      },
      required: ['street', 'streetNr'],
      additionalProperties: false,
    },
    (i) =>
      tree.sitesByAddress({
        street: s(i.street),
        streetNr: s(i.streetNr),
        ...(opt(i, ['city', 'stateOrProvince', 'postcode', 'country']) as Record<string, string>),
      }),
  );
  read(
    'tree_viewport',
    'Sites e recursos dentro de uma caixa geográfica (include: sites, resource-points, resource-lines).',
    {
      type: 'object',
      properties: {
        minLng: { type: 'number' },
        minLat: { type: 'number' },
        maxLng: { type: 'number' },
        maxLat: { type: 'number' },
        limit: { type: 'number' },
        include: { type: 'array', items: { type: 'string' } },
      },
      required: ['minLng', 'minLat', 'maxLng', 'maxLat'],
      additionalProperties: false,
    },
    async (i) => {
      const bounds = {
        minLng: Number(i.minLng),
        minLat: Number(i.minLat),
        maxLng: Number(i.maxLng),
        maxLat: Number(i.maxLat),
      };
      const include = Array.isArray(i.include) ? i.include.map(String) : undefined;
      const wants = (token: string) => include === undefined || include.includes(token);
      const limit = i.limit !== undefined ? { limit: Number(i.limit) } : {};
      const [resources, sites] = await Promise.all([
        wants('resource-points') || wants('resource-lines')
          ? tree.resourcesInViewport(bounds, {
              ...limit,
              shapes: { point: wants('resource-points'), line: wants('resource-lines') },
            })
          : Promise.resolve([]),
        wants('sites') ? tree.sitesInViewport(bounds, limit) : Promise.resolve([]),
      ]);
      return [...resources, ...sites];
    },
  );
  read(
    'tree_schematic',
    'Caminho esquemático (traceroute da fibra) a partir de um recurso.',
    idSchema(),
    (i) => tree.schematicPath(s(i.id)),
  );
  read(
    'get_site_origin',
    'Origem de um Site: importado (_origin), projeto ou cadastro manual.',
    idSchema(),
    async (i, c) => {
      const siteId = s(i.id);
      const site = await geo.getSite(siteId, c.requestContext);
      if (!site)
        throw new AppError('site not found', { code: 'GEO_SITE_NOT_FOUND', statusCode: 404 });
      const originSystem = site.characteristic.find((x) => x.name === '_origin.system')?.value;
      if (typeof originSystem === 'string' && originSystem) {
        return { kind: 'import', system: originSystem };
      }
      const project = await runtime.projectRepository.findProjectBySiteId(
        c.requestContext.tenantId,
        siteId,
      );
      if (project) {
        return { kind: 'project', projectId: project.projectId, projectName: project.projectName };
      }
      const audit = await geo.listSiteAudit(siteId, c.requestContext);
      const created = audit.find((entry) => entry.action === 'create');
      return {
        kind: 'manual',
        actorSub: created?.actorSub ?? 'desconhecido',
        createdAt: created?.eventTime ?? '',
      };
    },
  );
  read('tree_path', 'Caminho (ancestrais) até um nó da árvore.', idSchema(), (i) =>
    tree.pathTo(s(i.id)),
  );

  // Geocoding e fontes externas de endereço. Leitura transitória: nada é gravado no Nexus; o
  // resultado serve para o usuário escolher/confirmar antes de um create_address.
  read(
    'geocode_address',
    'Converte um endereço em texto em coordenada (Google Maps). Use para localizar endereços ainda não cadastrados. Aceita só CEP + número (sem logradouro).',
    {
      type: 'object',
      properties: { address: str, streetNr: str, city: str, stateOrProvince: str, postcode: str },
      additionalProperties: false,
    },
    async (i) => {
      if (!geocoder.configured) {
        return { status: 'not_configured', source: 'google-geocoding', result: null };
      }
      if (!i.address && !i.postcode) {
        return { status: 'not_found', source: 'google-geocoding', result: null };
      }
      const result = await geocoder.geocode([
        i.address,
        i.streetNr,
        i.city,
        i.stateOrProvince,
        i.postcode,
        'Brasil',
      ]);
      return { status: result ? 'ready' : 'not_found', source: 'google-geocoding', result };
    },
  );
  read(
    'search_geonet_addresses',
    'Busca candidatos de endereço no Geonet (fonte externa) por logradouro e número opcional.',
    {
      type: 'object',
      properties: { address: str, number: str },
      required: ['address'],
      additionalProperties: false,
    },
    async (i) => {
      if (!runtime.geonetAddressGateway) return { status: 'not_configured', candidates: [] };
      return {
        status: 'ready',
        candidates: await runtime.geonetAddressGateway.search(
          s(i.address),
          i.number ? s(i.number) : undefined,
        ),
      };
    },
  );
  read(
    'get_geonet_address',
    'Detalhe de um endereço do Geonet (inclui coordenadas) pelo addressId devolvido na busca.',
    {
      type: 'object',
      properties: { addressId: str },
      required: ['addressId'],
      additionalProperties: false,
    },
    async (i) => {
      if (!runtime.geonetAddressGateway) return { status: 'not_configured', address: null };
      return {
        status: 'ready',
        address: await runtime.geonetAddressGateway.detail(s(i.addressId)),
      };
    },
  );

  read(
    'get_site_editor',
    'Agregado de edição de um Site (site, endereço e location).',
    idSchema(),
    (i, c) => geo.getSiteEditor(s(i.id), c.requestContext),
  );
  read(
    'list_administrative_cities',
    'Cidades administrativas (município canônico) por país/UF.',
    {
      type: 'object',
      properties: { countryCode: str, stateCode: str },
      additionalProperties: false,
    },
    (i, c) => geo.listAdministrativeCities(opt(i, ['countryCode', 'stateCode']), c.requestContext),
  );
  read(
    'get_site_specification_instance_count',
    'Quantos Sites usam uma Site Specification.',
    idSchema(),
    (i, c) => geo.getSiteSpecificationInstanceCount(s(i.id), c.requestContext),
  );
  read(
    'analyze_containment_impact',
    'Simula o impacto de mudar as specs pai/filho permitidas de uma Site Specification.',
    payloadSchema,
    (i) => geo.analyzeContainmentImpact(s(i.id), payloadOf(i) as never),
  );
  read(
    'get_relationship_type',
    'Obtém um tipo de relação de Geo pelo código.',
    idSchema(),
    (i, c) => geo.getRelationshipType(s(i.id), c.requestContext),
  );

  // Escritas (prepare → commit)
  write(
    'update_site',
    'atualiza campos de um Site.',
    payloadSchema,
    (i) => `Site ${s(i.id)} será atualizado.`,
    (i, c) => geo.updateSite(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'transition_site',
    'muda o status de um Site (ex.: InDeactivation, Retired).',
    idSchema({ status: str, statusReason: str, statusDate: str }, ['status']),
    (i) => `Site ${s(i.id)} passará para o status ${s(i.status)}.`,
    (i, c) =>
      geo.transitionSite(
        s(i.id),
        { status: i.status as never, ...opt(i, ['statusReason', 'statusDate']) },
        c.requestContext,
      ),
  );
  write(
    'add_site_relationship',
    'cria uma relação entre dois Sites.',
    idSchema({ relatedSiteId: str, relationshipType: str }, ['relatedSiteId', 'relationshipType']),
    (i) => `Relação ${s(i.relationshipType)} entre ${s(i.id)} e ${s(i.relatedSiteId)} será criada.`,
    (i, c) =>
      geo.addSiteRelationship(
        s(i.id),
        s(i.relatedSiteId),
        s(i.relationshipType),
        undefined,
        c.requestContext,
      ),
  );
  write(
    'remove_site_relationship',
    'remove uma relação entre dois Sites.',
    idSchema({ relatedSiteId: str, relationshipType: str }, ['relatedSiteId', 'relationshipType']),
    (i) =>
      `Relação ${s(i.relationshipType)} entre ${s(i.id)} e ${s(i.relatedSiteId)} será removida.`,
    (i, c) =>
      geo.removeSiteRelationship(
        s(i.id),
        s(i.relatedSiteId),
        s(i.relationshipType),
        c.requestContext,
      ),
  );
  write(
    'update_location',
    'atualiza uma Location.',
    payloadSchema,
    (i) => `Location ${s(i.id)} será atualizada.`,
    (i, c) => geo.updateLocation(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'create_location',
    'cria uma Geographic Location.',
    {
      type: 'object',
      properties: { payload: { type: 'object', additionalProperties: true } },
      required: ['payload'],
      additionalProperties: false,
    },
    () => 'Uma Location será criada.',
    (i, c) => geo.createLocation(payloadOf(i) as never, c.requestContext),
  );
  write(
    'link_resource_to_site',
    'vincula um recurso a um Site (place do recurso).',
    {
      type: 'object',
      properties: { id: str, resourceId: str },
      required: ['id', 'resourceId'],
      additionalProperties: false,
    },
    (i) => `Recurso ${s(i.resourceId)} será vinculado ao Site ${s(i.id)}.`,
    async (i, c) => {
      const siteId = s(i.id);
      const resourceId = s(i.resourceId);
      const site = await geo.getSite(siteId, c.requestContext);
      if (!site)
        throw new AppError('site not found', { code: 'GEO_SITE_NOT_FOUND', statusCode: 404 });
      const resource = await runtime.resourceService.getResource(resourceId, c.requestContext);
      if (!resource)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      const placeInput = { placeId: siteId, placeType: 'GeographicSite' } as never;
      return resource['@type'] === 'PhysicalResource'
        ? runtime.resourceService.updatePhysicalResource(resourceId, placeInput, c.requestContext)
        : runtime.resourceService.updateLogicalResource(resourceId, placeInput, c.requestContext);
    },
  );
  write(
    'unlink_resource_from_site',
    'desvincula um recurso do Site (mode=unlink) ou o encerra por soft-delete (mode=terminate).',
    {
      type: 'object',
      properties: {
        id: str,
        resourceId: str,
        mode: { type: 'string', enum: ['unlink', 'terminate'] },
      },
      required: ['id', 'resourceId'],
      additionalProperties: false,
    },
    (i) =>
      i.mode === 'terminate'
        ? `Recurso ${s(i.resourceId)} será encerrado.`
        : `Recurso ${s(i.resourceId)} será desvinculado do Site ${s(i.id)}.`,
    async (i, c) => {
      const resourceId = s(i.resourceId);
      const resource = await runtime.resourceService.getResource(resourceId, c.requestContext);
      if (!resource)
        throw new AppError('resource not found', { code: 'RESOURCE_NOT_FOUND', statusCode: 404 });
      const physical = resource['@type'] === 'PhysicalResource';
      if (i.mode === 'terminate') {
        return physical
          ? runtime.resourceService.deletePhysicalResource(resourceId, c.requestContext)
          : runtime.resourceService.deleteLogicalResource(resourceId, c.requestContext);
      }
      const unlink = { placeId: null } as never;
      return physical
        ? runtime.resourceService.updatePhysicalResource(resourceId, unlink, c.requestContext)
        : runtime.resourceService.updateLogicalResource(resourceId, unlink, c.requestContext);
    },
  );
  write(
    'terminate_location',
    'encerra (soft-delete) uma Location.',
    idSchema(),
    (i) => `Location ${s(i.id)} será encerrada.`,
    (i, c) => geo.terminateLocation(s(i.id), c.requestContext),
  );
  write(
    'update_address',
    'atualiza um Address.',
    payloadSchema,
    (i) => `Address ${s(i.id)} será atualizado.`,
    (i, c) => geo.updateAddress(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'terminate_address',
    'encerra (soft-delete) um Address.',
    idSchema(),
    (i) => `Address ${s(i.id)} será encerrado.`,
    (i, c) => geo.terminateAddress(s(i.id), c.requestContext),
  );
  write(
    'update_site_specification',
    'atualiza uma Site Specification do catálogo.',
    payloadSchema,
    (i) => `Site Specification ${s(i.id)} será atualizada.`,
    (i, c) => geo.updateSpec(s(i.id), payloadOf(i), c.requestContext),
  );
  write(
    'retire_site_specification',
    'aposenta uma Site Specification do catálogo.',
    idSchema(),
    (i) => `Site Specification ${s(i.id)} será aposentada.`,
    (i, c) => geo.retireSpec(s(i.id), c.requestContext),
  );
  write(
    'create_site_specification',
    'cria uma Site Specification no catálogo.',
    {
      type: 'object',
      properties: { payload: { type: 'object', additionalProperties: true } },
      required: ['payload'],
      additionalProperties: false,
    },
    (i) => `Site Specification ${s((i.payload as { name?: unknown })?.name ?? '')} será criada.`,
    (i, c) => geo.createSpec(payloadOf(i) as never, c.requestContext),
  );
  write(
    'save_site_editor',
    'grava o agregado de edição de um Site (site, endereço e location) numa única operação.',
    {
      type: 'object',
      properties: { siteId: str, payload: { type: 'object', additionalProperties: true } },
      required: ['payload'],
      additionalProperties: false,
    },
    (i) => (i.siteId ? `Site ${s(i.siteId)} será salvo.` : 'Um novo Site será criado.'),
    (i, c) =>
      geo.saveSiteEditor(
        payloadOf(i) as never,
        i.siteId ? s(i.siteId) : undefined,
        c.requestContext,
      ),
  );
  write(
    'create_relationship_type',
    'cria um tipo de relação de Geo no catálogo.',
    {
      type: 'object',
      properties: { payload: { type: 'object', additionalProperties: true } },
      required: ['payload'],
      additionalProperties: false,
    },
    (i) => `Tipo de relação ${s((i.payload as { code?: unknown })?.code ?? '')} será criado.`,
    (i, c) => geo.createRelationshipType(payloadOf(i) as never, c.requestContext),
  );
  write(
    'update_relationship_type',
    'atualiza um tipo de relação de Geo (id = código).',
    payloadSchema,
    (i) => `Tipo de relação ${s(i.id)} será atualizado.`,
    (i, c) => geo.updateRelationshipType(s(i.id), payloadOf(i) as never, c.requestContext),
  );
  write(
    'retire_relationship_type',
    'aposenta um tipo de relação de Geo (id = código).',
    idSchema(),
    (i) => `Tipo de relação ${s(i.id)} será aposentado.`,
    (i, c) => geo.retireRelationshipType(s(i.id), c.requestContext),
  );
};
