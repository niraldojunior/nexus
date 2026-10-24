// Mapa de paridade MCP ↔ frontend. Cada caminho de API chamado por `web/src` aponta para as
// operações MCP que o cobrem, ou é excluído com justificativa. `test/mcp-parity.spec.ts`
// extrai os caminhos do frontend e falha quando surge um sem entrada aqui, e quando uma operação
// citada deixa de existir no registro. Caminhos normalizados: `${...}` -> `{}`, sem query string.

export type ParityEntry = { ops: readonly string[] } | { excluded: string };

const ops = (...names: string[]): ParityEntry => ({ ops: names });
const excluded = (reason: string): ParityEntry => ({ excluded: reason });

const OUT_OF_SCOPE_USERS = 'Administração de usuários/perfil/senha fora do escopo do épico #387.';
const OUT_OF_SCOPE_MAP =
  'Renderização de mapa (tile/densidade/linhas) é visual, sem uso pelo Copilot.';
const OUT_OF_SCOPE_RESEARCH =
  'Sessões do próprio Copilot: o chat é o cliente, não uma operação de domínio.';

export const PARITY_MAP: Record<string, ParityEntry> = {
  // ── Party / Service / Resource: rotas TMF montadas a partir de constantes de base ──────────────
  '/tmf-api/partyManagement/v4/party': ops('party.list_parties', 'party.create_party'),
  '/tmf-api/partyManagement/v4/party/{}': ops(
    'party.get_party',
    'party.update_party',
    'party.delete_party',
  ),
  '/tmf-api/partyRoleManagement/v4/partyRole': ops(
    'party.list_party_roles',
    'party.create_party_role',
  ),
  '/tmf-api/partyRoleManagement/v4/partyRole/{}': ops(
    'party.get_party_role',
    'party.update_party_role',
    'party.delete_party_role',
  ),
  '/tmf-api/resourceInventoryManagement/v4/resource/{}/relationships': ops(
    'resource.list_resource_relationships',
    'resource.add_resource_relationship',
  ),
  '/tmf-api/resourceInventoryManagement/v4/resource/{}/relationships/{}/{}': ops(
    'resource.remove_resource_relationship',
  ),
  '/tmf-api/serviceCatalogManagement/v4': ops(
    'service.list_service_specifications',
    'service.get_service_specification',
    'service.create_service_specification',
    'service.update_service_specification',
    'service.delete_service_specification',
    'service.list_service_categories',
    'service.create_service_category',
    'service.list_service_candidates',
    'service.create_service_candidate',
  ),
  '/tmf-api/serviceInventoryManagement/v4/service': ops(
    'service.list_services',
    'service.get_service',
    'service.update_service',
    'service.terminate_service',
  ),

  // ── Chat / sessões do Copilot ───────────────────────────────────────────────────────────────
  '/v1/chat/completions': excluded(OUT_OF_SCOPE_RESEARCH),
  '/v1/research/sessions/{}/confirmations': excluded(
    'Botão de confirmar do chat: é o transporte da confirmação humana, não uma operação de domínio.',
  ),
  '/v1/research/sessions/{}/messages/stream': excluded(OUT_OF_SCOPE_RESEARCH),

  // ── Reference data / party-role-types ───────────────────────────────────────────────────────
  '/v1/geo/address-sources/geonet/{}': ops('geo.get_geonet_address'),
  '/v1/geo/search-history/{}': excluded(
    'Histórico de busca do usuário fora do escopo do épico #387.',
  ),
  '/v1/party-role-types/{}': ops(
    'party.update_party_role_type',
    'party.deactivate_party_role_type',
  ),
  '/v1/party-role-types/{}/usage': ops('party.get_party_role_type_usage'),
  '/v1/reference-data/sets/{}': ops('reference_data.update_set', 'reference_data.deactivate_set'),
  '/v1/reference-data/sets/{}/values': ops(
    'reference_data.list_values',
    'reference_data.create_value',
    'reference_data.update_value',
    'reference_data.deactivate_value',
  ),

  // ── Planta interna ──────────────────────────────────────────────────────────────────────────
  '/v1/resource/internal-plant/locations/children': ops('resource.internal_plant_children'),
  '/v1/resource/internal-plant/locations/roots': ops('resource.internal_plant_roots'),
  '/v1/resource/internal-plant/resources': ops(
    'resource.internal_plant_list_resources',
    'resource.save_resource_aggregate',
  ),
  '/v1/resource/internal-plant/resources/{}': ops(
    'resource.save_resource_aggregate',
    'resource.terminate_resource',
  ),
  '/v1/resource/internal-plant/resources/{}/audit': ops('resource.list_resource_audit'),
  '/v1/resource/internal-plant/resources/{}/editor': ops('resource.get_resource_detail'),
  '/v1/resource/internal-plant/sites': ops('resource.internal_plant_search_sites'),
  '/v1/resource/internal-plant/sites/{}/context': ops('resource.internal_plant_site_context'),

  // ── Auth / usuários ─────────────────────────────────────────────────────────────────────────
  '/v1/users/{}': excluded(OUT_OF_SCOPE_USERS),
  '/v1/users/{}/password': excluded(OUT_OF_SCOPE_USERS),
  '/v1/users/{}/roles': excluded(OUT_OF_SCOPE_USERS),
  '/v1/users/{}/status': excluded(OUT_OF_SCOPE_USERS),

  // ── Resource (TMF) ──────────────────────────────────────────────────────────────────────────
  '/tmf-api/resourceCatalogManagement/v4/resourceSpecification': ops(
    'resource.list_resource_specifications',
  ),
  '/tmf-api/resourceCatalogManagement/v4/resourceSpecification/{}': ops(
    'resource.get_resource_specification',
    'resource.update_resource_specification',
    'resource.delete_resource_specification',
  ),
  '/tmf-api/resourceCatalogManagement/v4/resourceCategory': ops('resource.list_resource_catalogs'),
  '/tmf-api/resourceCatalogManagement/v4/resourceType': ops('resource.list_resource_types'),
  '/tmf-api/resourceInventoryManagement/v4/resource': ops('resource.list_resources'),
  '/tmf-api/resourceInventoryManagement/v4/resource/{}': ops(
    'resource.update_physical_resource',
    'resource.update_logical_resource',
    'resource.terminate_resource',
  ),
  '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-access': excluded(
    'Ids de categoria padrão embutidos em serviceCatalogDefaults.ts (dado estático de UI).',
  ),
  '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-enterprise': excluded(
    'Ids de categoria padrão embutidos em serviceCatalogDefaults.ts (dado estático de UI).',
  ),
  '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-transport': excluded(
    'Ids de categoria padrão embutidos em serviceCatalogDefaults.ts (dado estático de UI).',
  ),
  '/tmf-api/serviceCatalogManagement/v4/serviceCategory/svc-cat-voice': excluded(
    'Ids de categoria padrão embutidos em serviceCatalogDefaults.ts (dado estático de UI).',
  ),

  // ── Auth / usuários ─────────────────────────────────────────────────────────────────────────
  '/v1/auth/*': excluded(OUT_OF_SCOPE_USERS),
  '/v1/auth/login': excluded(OUT_OF_SCOPE_USERS),
  '/v1/auth/logout': excluded(OUT_OF_SCOPE_USERS),
  '/v1/auth/me': excluded(OUT_OF_SCOPE_USERS),
  '/v1/auth/password': excluded(OUT_OF_SCOPE_USERS),
  '/v1/auth/profile': excluded(OUT_OF_SCOPE_USERS),
  '/v1/users': excluded(OUT_OF_SCOPE_USERS),

  // ── Geo ─────────────────────────────────────────────────────────────────────────────────────
  '/v1/geo/addresses': ops('geo.list_addresses', 'geo.create_address'),
  '/v1/geo/addresses/{}': ops('geo.get_address', 'geo.update_address', 'geo.terminate_address'),
  '/v1/geo/administrative-cities': ops('geo.list_administrative_cities'),
  '/v1/geo/address-sources/geonet': ops('geo.search_geonet_addresses', 'geo.get_geonet_address'),
  '/v1/geo/coverage': excluded(OUT_OF_SCOPE_MAP),
  '/v1/geo/locations': ops('geo.create_location'),
  '/v1/geo/locations/{}': ops('geo.get_location', 'geo.update_location', 'geo.terminate_location'),
  '/v1/geo/locations/{}/references': ops('geo.get_location_references'),
  '/v1/geo/map/density': excluded(OUT_OF_SCOPE_MAP),
  '/v1/geo/map/lines': excluded(OUT_OF_SCOPE_MAP),
  '/v1/geo/map/resources': excluded(OUT_OF_SCOPE_MAP),
  '/v1/geo/map/sites': excluded(OUT_OF_SCOPE_MAP),
  '/v1/geo/map-layer-catalog': ops('studio.get_status'),
  '/v1/geo/nearby-cdos': ops('geo.find_nearby_cdos'),
  '/v1/geo/search-history': excluded('Histórico de busca do usuário fora do escopo do épico #387.'),
  '/v1/geo/site-editor': ops('geo.save_site_editor'),
  '/v1/geo/site-editor/{}': ops('geo.get_site_editor'),
  '/v1/geo/site-specifications': ops(
    'geo.list_site_specifications',
    'geo.create_site_specification',
  ),
  '/v1/geo/site-specifications/{}': ops(
    'geo.update_site_specification',
    'geo.retire_site_specification',
  ),
  '/v1/geo/site-specifications/{}/containment-impact': ops('geo.analyze_containment_impact'),
  '/v1/geo/site-specifications/{}/instance-count': ops('geo.get_site_specification_instance_count'),
  '/v1/geo/sites': ops('geo.list_sites', 'geo.create_site'),
  '/v1/geo/sites/{}': ops('geo.get_site', 'geo.update_site', 'geo.transition_site'),
  '/v1/geo/sites/{}/audit': ops('geo.list_site_audit'),
  '/v1/geo/sites/{}/deactivation-impact': ops('geo.get_site_deactivation_impact'),
  '/v1/geo/sites/{}/events': ops('geo.list_site_history'),
  '/v1/geo/sites/{}/origin': ops('geo.get_site_origin'),
  '/v1/geo/sites/{}/resources': ops('geo.link_resource_to_site'),
  '/v1/geo/sites/{}/resources/{}': ops('geo.unlink_resource_from_site'),
  '/v1/geo/tree/*': ops('geo.tree_search', 'geo.tree_roots', 'geo.tree_children', 'geo.tree_path'),
  '/v1/geo/tree/children': ops('geo.tree_children'),
  '/v1/geo/tree/node': ops('geo.get_site_tree'),
  '/v1/geo/tree/path': ops('geo.tree_path'),
  '/v1/geo/tree/roots': ops('geo.tree_roots'),
  '/v1/geo/tree/schematic': ops('geo.tree_schematic'),
  '/v1/geo/tree/search': ops('geo.tree_search'),
  '/v1/geo/tree/sites-by-address': ops('geo.tree_sites_by_address'),
  '/v1/geo/tree/viewport': ops('geo.tree_viewport'),
  '/v1/geo/workspace/site-at-address': ops('geo.create_site'),

  // ── Projetos ────────────────────────────────────────────────────────────────────────────────
  '/v1/project-statuses': ops('project.list_project_statuses', 'project.create_project_status'),
  '/v1/project-statuses/{}': ops('project.update_project_status', 'project.delete_project_status'),
  '/v1/project-workflow': ops('project.get_project_workflow'),
  '/v1/projects': ops('project.list_projects', 'project.create_project'),
  '/v1/projects/*': ops('project.get_project', 'project.update_project'),
  '/v1/projects/{}': ops(
    'project.get_project',
    'project.update_project',
    'project.archive_project',
  ),
  '/v1/projects/{}/areas': ops('project.list_project_areas'),
  '/v1/projects/{}/resource-creation-options': ops('project.get_resource_creation_options'),
  '/v1/projects/{}/resources': ops(
    'project.list_project_resources',
    'project.create_project_resource',
  ),
  '/v1/projects/{}/resources/{}': ops(
    'project.link_project_resource',
    'project.detach_project_resource',
  ),
  '/v1/projects/{}/search': ops('project.search_project_items'),
  '/v1/projects/{}/transitions': ops(
    'project.get_project_transitions',
    'project.transition_project',
  ),
  '/v1/projects/{}/sites': ops('project.list_project_sites', 'project.create_project_site'),
  '/v1/projects/{}/sites/{}': ops('project.update_project_site', 'project.remove_project_site'),
  '/v1/projects/{}/resource-candidates': ops('project.list_project_resource_candidates'),

  // ── Party ───────────────────────────────────────────────────────────────────────────────────
  '/v1/party-role-types': ops('party.list_party_role_types'),
  '/v1/party-role-types/{}/characteristics': ops('party.list_party_role_type_characteristics'),
  '/v1/reference-data/sets': ops('reference_data.list_sets'),

  // ── Pesquisa (Copilot) ──────────────────────────────────────────────────────────────────────
  '/v1/research/sessions': excluded(OUT_OF_SCOPE_RESEARCH),
  '/v1/research/sessions/{}': excluded(OUT_OF_SCOPE_RESEARCH),
  '/v1/research/sessions/{}/messages': excluded(OUT_OF_SCOPE_RESEARCH),

  // ── Resource Catalog / tipos / regras ───────────────────────────────────────────────────────
  '/v1/resource-catalogs': ops(
    'resource.list_resource_catalogs',
    'resource.create_resource_catalog',
  ),
  '/v1/resource-catalogs/{}': ops(
    'resource.get_resource_catalog_tree',
    'resource.update_resource_catalog',
    'resource.delete_resource_catalog',
  ),
  '/v1/resource-catalogs/{}/ai-optimization/apply': ops(
    'resource.apply_resource_catalog_ai_proposal',
  ),
  '/v1/resource-catalogs/{}/ai-optimization/preview': ops(
    'resource.preview_resource_catalog_ai_optimization',
  ),
  '/v1/resource-catalogs/{}/nodes': ops(
    'resource.list_resource_catalog_nodes',
    'resource.create_resource_catalog_node',
  ),
  '/v1/resource-catalogs/{}/nodes/reorder': ops('resource.reorder_resource_catalog_nodes'),
  '/v1/resource-catalogs/{}/nodes/{}': ops(
    'resource.get_resource_catalog_node',
    'resource.update_resource_catalog_node',
    'resource.delete_resource_catalog_node',
  ),
  '/v1/resource-catalogs/{}/nodes/{}/impact': ops('resource.get_resource_catalog_node_impact'),
  '/v1/resource-catalogs/{}/nodes/{}/move': ops('resource.move_resource_catalog_node'),
  '/v1/resource-catalogs/{}/nodes/{}/path': ops('resource.get_resource_catalog_node_path'),
  '/v1/resource-catalogs/{}/snapshot-source': ops('resource.get_resource_model_snapshot_source'),
  '/v1/resource-catalogs/{}/tree': ops('resource.get_resource_catalog_tree'),
  '/v1/resource-layers': ops('resource.create_resource_catalog'),
  '/v1/resource-layers/{}': ops(
    'resource.update_resource_catalog',
    'resource.delete_resource_catalog',
  ),
  '/v1/resource-statuses': ops('resource.list_resource_status_catalog'),
  '/v1/resource-types': ops('resource.list_resource_types'),
  '/v1/resource-types/{}': ops('resource.update_resource_type'),
  '/v1/resource-types/{}/catalog-context': ops('resource.get_resource_type_catalog_context'),
  '/v1/resource-types/{}/relationship-rules': ops(
    'resource.list_resource_type_relationship_rules',
    'resource.create_resource_type_relationship_rule',
  ),
  '/v1/resource-types/{}/relationship-rules/{}': ops(
    'resource.update_resource_type_relationship_rule',
  ),
  '/v1/resource/internal-plant': ops(
    'resource.internal_plant_roots',
    'resource.internal_plant_children',
    'resource.internal_plant_site_context',
    'resource.internal_plant_search_sites',
    'resource.internal_plant_list_resources',
  ),
  '/v1/resource/relationship-types': ops(
    'resource.list_resource_relationship_types',
    'resource.create_resource_relationship_type',
  ),
  '/v1/resource/relationship-types/bootstrap': excluded(
    'Bootstrap canônico roda no boot do backend (C9); não é ação do usuário via Copilot.',
  ),
  '/v1/resource/relationship-types/{}': ops(
    'resource.update_resource_relationship_type',
    'resource.retire_resource_relationship_type',
  ),
  '/v1/resource/specifications/bulk-import': ops('resource.bulk_create_resource_specifications'),
  '/v1/resource/workspace': ops('resource.list_resources'),
  '/v1/resources/{}/audit': ops('resource.list_resource_audit'),
  '/v1/resources/{}/components': ops('resource.get_resource_components'),
  '/v1/resources/{}/connections': ops('resource.get_resource_connections'),
  '/v1/resources/{}/detail': ops('resource.get_resource_detail'),
  '/v1/resources/{}/port-detail': ops('resource.get_resource_port_detail'),
  '/v1/resources/{}/ports': ops('resource.get_resource_ports_view'),

  // ── Service ─────────────────────────────────────────────────────────────────────────────────
  '/v1/service/specifications/bulk-import': ops('service.bulk_create_service_specifications'),
  '/v1/service/workspace': ops('service.list_services', 'service.count_services'),

  // ── Studio ──────────────────────────────────────────────────────────────────────────────────
  '/v1/studio': ops('studio.get_status', 'studio.list_versions'),
  '/v1/studio/assets': ops('studio.list_assets', 'studio.create_asset'),
  '/v1/studio/assets/{}': ops('studio.list_assets', 'studio.retire_asset'),
  '/v1/studio/templates/apply': ops('studio.apply_template_import'),
  '/v1/studio/templates/plan': ops('studio.plan_template_import'),
};
