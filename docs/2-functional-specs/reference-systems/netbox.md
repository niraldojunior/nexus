# Relatório do Frontend do NetBox

## 1. Resumo inicial: menu principal e propósito

| Menu principal | Propósito |
|---|---|
| Organization | Estruturar contexto organizacional e geográfico (sites, regiões, locações, contatos e tenancy). |
| Racks | Modelar infraestrutura física de racks, reservas, tipos e organização interna de racks. |
| Devices | Gerenciar ativos de rede e computação, seus tipos, papéis e componentes físicos/lógicos. |
| Connections | Representar conectividade física e lógica entre equipamentos (cabos, conexões de interface/console/energia). |
| Wireless | Controlar redes wireless e agrupamentos de SSIDs/LANs sem fio. |
| IPAM | Administrar endereçamento IP, prefixes, ASN, VRF, VLAN e serviços de aplicação relacionados a IP. |
| VPN | Gerenciar túneis, L2VPN e políticas de segurança de VPN (IKE/IPSec). |
| Virtualization | Inventariar VMs, discos, interfaces e clusters de virtualização. |
| Circuits | Gerenciar circuitos de operadoras, circuitos virtuais, grupos e provedores. |
| Power | Controlar painéis e feeds de energia da infraestrutura. |
| Provisioning | Definir contexto e templates de configuração para automação/provisionamento. |
| Customization | Personalizar comportamento e interface com campos, links, tags, filtros, export e scripts. |
| Operations | Integrar sistemas externos, jobs assíncronos e trilhas operacionais (logs/eventos). |
| Admin | Administração de usuários, permissões, ownership e controles de sistema. |
| Plugins (dinâmico) | Menus extras adicionados por plugins instalados. |

---

## 2. Visão do frontend: como a interface funciona

## 2.1 Arquitetura de UI
O frontend do NetBox é uma UI web administrativa orientada a dados de infraestrutura. A experiência é baseada em páginas de listagem, detalhe, edição em formulário, importação em massa e operações em lote. A navegação é hierárquica por domínio funcional (menus principais e submenus por grupos).

## 2.2 Tecnologias e estilo de interface
A camada visual usa Bootstrap/Tabler, ícones Material Design Icons e componentes dinâmicos para produtividade operacional (filtros, tabelas, seleção avançada, calendário, clipboard, dashboard em grid).  
A lógica de interação usa TypeScript e recursos para atualização dinâmica da UI sem recarga integral em vários fluxos.

## 2.3 Padrões de uso no frontend
1. Navegação por domínio: cada menu representa um bloco funcional de operação.
2. Estrutura consistente por objeto: lista, criação, edição, visualização detalhada, importação e ações em massa.
3. Controle por permissões: itens e ações aparecem conforme perfil, permissões por objeto e, em alguns casos, acesso staff.
4. Operação orientada a busca/filtro: praticamente toda entidade relevante é filtrável e navegável por tabelas.
5. Extensibilidade nativa: plugins podem acrescentar menus e páginas sem quebrar o fluxo principal.

---

## 3. Detalhamento completo dos submenus e funcionalidades

## 3.1 Organization

### 3.1.1 Escopo funcional do domínio

O domínio Organization no NetBox é a base de contexto organizacional e geográfico para os demais módulos. Ele define onde os ativos existem e como são agrupados por geografia e classificação de negócio.

Entidades centrais do domínio:
1. Regions: hierarquia geográfica para classificar sites.
2. Site Groups: hierarquia funcional para classificar sites por tipo/papel.
3. Sites: unidade principal de local físico (campus, prédio, POP, DC, filial).
4. Locations: subdivisão interna de um site (andar, sala, cage, zona).

Entidades relacionadas no menu Organization:
1. Tenancy: Tenants e Tenant Groups para segmentação lógica e governança.
2. Contacts: Contacts, Contact Groups, Contact Roles e Contact Assignments para gestão de pontos de contato.

### 3.1.2 Entidade Region

Finalidade:
Organizar sites por uma árvore geográfica (por exemplo: continente > país > estado > cidade).

Campos funcionais:
1. parent: região pai opcional.
2. name: nome da região.
3. slug: identificador URL-friendly.
4. description: descrição opcional.
5. owner: responsável opcional.
6. comments: comentários livres.
7. tags e custom_fields: metadados extensíveis.

Regras de negócio:
1. Hierarquia MPTT: suporta árvore com vários níveis.
2. name único por parent.
3. slug único por parent.
4. Para regiões de topo (sem parent), name e slug também são únicos entre si.
5. Não permite autorreferência ou apontar parent para descendente.

Comportamento em relacionamento:
1. Site.region usa SET_NULL, portanto excluir uma Region não exclui Sites; apenas remove o vínculo.
2. Possui escopo para Prefixes e VLAN Groups via GenericRelation (integração com IPAM).

APIs e consulta:
1. REST endpoint: /api/dcim/regions/.
2. Operações: list, retrieve, create, update, delete.
3. Filtros relevantes: parent, ancestor, name, slug, description.
4. Campos adicionais em API: site_count acumulado na árvore e prefix_count.

### 3.1.3 Entidade Site Group

Finalidade:
Classificar sites por função de negócio (por exemplo: corporate, branch, colo, edge).

Campos funcionais:
1. parent: grupo pai opcional.
2. name: nome do grupo.
3. slug: identificador URL-friendly.
4. description: descrição opcional.
5. owner, comments, tags e custom_fields.

Regras de negócio:
1. Hierarquia MPTT com múltiplos níveis.
2. name único por parent.
3. slug único por parent.
4. Para grupos de topo, name e slug únicos.
5. Não permite parent inválido dentro da própria subárvore.

Comportamento em relacionamento:
1. Site.group usa SET_NULL; exclusão do grupo não exclui sites.
2. Também pode atuar como escopo de Prefixes e VLAN Groups.

APIs e consulta:
1. REST endpoint: /api/dcim/site-groups/.
2. Operações: list, retrieve, create, update, delete.
3. Filtros relevantes: parent, ancestor, name, slug, description.
4. Campos adicionais em API: site_count acumulado e prefix_count.

### 3.1.4 Entidade Site

Finalidade:
Representar o local físico principal da operação (instalação macro) e servir de âncora para racks, devices, IPAM e circuitos.

Campos funcionais (modelo):
1. name: nome único global do site.
2. slug: identificador URL-friendly único global.
3. status: estado operacional do site.
4. region: referência opcional para Region.
5. group: referência opcional para Site Group.
6. tenant: referência opcional para Tenant.
7. facility: designação local da instalação.
8. asns: coleção de ASNs associados ao site.
9. time_zone: fuso horário local.
10. physical_address: endereço físico.
11. shipping_address: endereço de entrega.
12. latitude: coordenada GPS.
13. longitude: coordenada GPS.
14. description e comments.
15. owner, tags e custom_fields.

Status padrão:
1. planned
2. staging
3. active
4. decommissioning
5. retired

Regras de negócio e validações:
1. name e slug são únicos globalmente.
2. latitude deve estar entre -90 e 90.
3. longitude deve estar entre -180 e 180.
4. status é extensível por FIELD_CHOICES (chave Site.status).
5. tenant usa PROTECT, evitando exclusão de tenant referenciado por site.

Comportamento em relacionamento e integridade:
1. Location.site usa CASCADE: remover site remove suas locations.
2. Rack.site usa PROTECT: não remove site que tenha racks vinculados.
3. Device.site usa PROTECT: não remove site que tenha devices vinculados.
4. Site concentra contagens operacionais: devices, racks, circuits, VLANs, VMs e prefixes.

APIs e consulta:
1. REST endpoint: /api/dcim/sites/.
2. Operações: list, retrieve, create, update, delete.
3. Filtros relevantes: status, region, group, asn, time_zone, name, slug, facility, latitude, longitude, tenancy.
4. Busca textual inclui name, facility, description, addresses, comments e ASN numérico.
5. Campos de contagem na API: circuit_count, device_count, rack_count, prefix_count, vlan_count, virtualmachine_count.

Funcionalidades frontend:
1. Cadastro e manutenção do ciclo de vida de sites.
2. Segmentação por geografia (Region) e função (Site Group).
3. Associação com contatos, tenancy, ownership e taxonomias (tags).
4. Base para filtro de praticamente todo inventário físico e lógico.

### 3.1.5 Entidade Location

Finalidade:
Representar divisão interna do site para organizar racks e devices com granularidade operacional.

Campos funcionais (modelo):
1. site: site pai obrigatório.
2. parent: location pai opcional.
3. name: nome da location.
4. slug: identificador URL-friendly.
5. status: estado operacional da location.
6. tenant: tenant opcional.
7. facility: designação local.
8. description e comments.
9. owner, tags e custom_fields.

Status padrão:
1. planned
2. staging
3. active
4. decommissioning
5. retired

Regras de negócio e validações:
1. Hierarquia em árvore (MPTT) por parent.
2. parent, quando informado, deve ser do mesmo site.
3. Não permite autorreferência ou parent em descendente.
4. Unicidade de name:
	1. Topo (sem parent): único por site.
	2. Com parent: único por site + parent.
5. Unicidade de slug com a mesma lógica de escopo.
6. status é extensível por FIELD_CHOICES (chave Location.status).

Comportamento em relacionamento e integridade:
1. Rack.location usa SET_NULL: excluir location remove vínculo de rack para null.
2. Device.location usa PROTECT: não permite excluir location com devices vinculados.
3. Location pode escopar Prefixes e VLAN Groups.

APIs e consulta:
1. REST endpoint: /api/dcim/locations/.
2. Operações: list, retrieve, create, update, delete.
3. Filtros relevantes: region/site_group (via site), site, parent, ancestor, status, name, slug, facility, tenancy.
4. Busca textual inclui campos comuns da hierarquia e facility.
5. Campos de contagem na API: rack_count, device_count, prefix_count.

Funcionalidades frontend:
1. Navegação hierárquica de áreas internas de um site.
2. Organização de ocupação física para racks/dispositivos.
3. Segmentação operacional por zona, sala, andar, cage etc.

### 3.1.6 Regras transversais de consistência com inventário físico

As regras abaixo são críticas para a gestão funcional de locais físicos, pois impedem inconsistência de dados:

1. Em Rack:
	1. Se rack.location estiver definido, essa location deve pertencer ao rack.site.

2. Em Device:
	1. Se device.rack estiver definido, rack.site deve ser igual a device.site.
	2. Se device.location estiver definido, location.site deve ser igual a device.site.
	3. Se rack e location estiverem definidos simultaneamente, rack.location deve ser igual a device.location.

3. Efeito prático:
	1. Evita alocação cruzada entre sites distintos.
	2. Mantém coerência entre localidade macro (Site) e localidade interna (Location).

### 3.1.7 APIs existentes no domínio Organization

REST API (dcim):
1. /api/dcim/regions/
2. /api/dcim/site-groups/
3. /api/dcim/sites/
4. /api/dcim/locations/

Padrão funcional dos endpoints:
1. CRUD completo via viewsets.
2. Suporte a filtros avançados por IDs e slugs.
3. Suporte a paginação e ordenação padrão NetBox.
4. Respostas com campos de metadados e contadores de objetos relacionados.

GraphQL:
1. Types disponíveis: RegionType, SiteGroupType, SiteType, LocationType.
2. Exposição de relações com racks, devices, circuit terminations, clusters, prefixes, VLANs e ASNs (conforme tipo).

### 3.1.8 Funcionalidades de uso no frontend (visão de processo)

Fluxo típico de implantação:
1. Criar a árvore de Regions (geografia).
2. Criar a árvore de Site Groups (classificação funcional).
3. Cadastrar Sites com status, timezone, endereço, geolocalização e ASN(s).
4. Criar Locations por site em estrutura hierárquica.
5. Associar racks e devices nas Locations corretas.
6. Aplicar contatos, tenancy, owner e tags para governança.

Capacidades operacionais entregues:
1. Inventário físico coerente e consultável por geografia e função.
2. Filtros consistentes para operações de NOC/engenharia.
3. Base de contexto para módulos DCIM, IPAM, Circuits e Virtualization.
4. Pronto para automação via REST e GraphQL.

## 3.2 Racks

| Grupo | Item | Função |
|---|---|---|
| Racks | Racks | Cadastro e gestão de racks físicos. |
| Racks | Reservations | Reserva posições/slots no rack para planejamento. |
| Racks | Elevations | Visualização frontal/traseira de ocupação do rack. |
| Rack Organization | Rack Groups | Agrupa racks por área, função ou domínio. |
| Rack Organization | Rack Roles | Define papéis de racks (produção, borda, laboratório etc.). |
| Rack Types | Rack Types | Modelos/tipos de rack com características padronizadas. |
### 3.2.1 Escopo funcional do domínio

O domínio Racks modela a infraestrutura de acomodação física de equipamentos. Ele define estrutura mecânica, ocupação em U, organização por grupos/funções e reserva antecipada de unidades.

Entidades centrais do domínio:
1. Rack Groups: agrupamento físico/operacional de racks.
2. Rack Roles: classificação funcional dos racks.
3. Rack Types: definição de modelo físico padrão de rack.
4. Racks: instâncias físicas instaladas em site/location.
5. Rack Reservations: reserva de unidades para uso futuro.

### 3.2.2 Entidade Rack Group

Finalidade:
Organizar racks por critérios de posicionamento físico (por exemplo: fileira, corredor, bloco).

Campos funcionais:
1. name: nome único.
2. slug: identificador URL-friendly único.
3. description: descrição opcional.
4. owner, comments, tags e custom_fields.

Regras de negócio:
1. Modelo organizacional plano (sem hierarquia).
2. Unicidade de name e slug.

Funcionalidades e relacionamentos:
1. Agrupamento secundário de racks além de location.
2. Pode ser usado como escopo de VLAN Groups (integração com IPAM).

APIs e filtros:
1. REST endpoint: /api/dcim/rack-groups/.
2. Filtros principais: id, name, slug, description.
3. Campo de apoio: rack_count (contagem de racks vinculados).

### 3.2.3 Entidade Rack Role

Finalidade:
Classificar função do rack no ambiente (compute, storage, customer, network, etc.).

Campos funcionais:
1. name: nome único.
2. slug: identificador URL-friendly único.
3. color: cor de exibição no frontend.
4. description: descrição opcional.
5. owner, comments, tags e custom_fields.

Regras de negócio:
1. Unicidade de name e slug.
2. color padroniza representação visual de função na UI.

APIs e filtros:
1. REST endpoint: /api/dcim/rack-roles/.
2. Filtros principais: id, name, slug, color, description.
3. Campo de apoio: rack_count.

### 3.2.4 Entidade Rack Type

Finalidade:
Definir características físicas reutilizáveis de um modelo de rack, reduzindo inconsistência entre instâncias.

Campos funcionais:
1. manufacturer: fabricante (obrigatório).
2. model: modelo do rack.
3. slug: identificador URL-friendly.
4. form_factor: formato físico (2-post, 4-post, cabinet, wall variants).
5. width: largura entre trilhos (10/19/21/23 pol).
6. u_height: altura em U.
7. starting_unit: menor unidade numérica disponível no rack.
8. desc_units: indica numeração descendente das unidades.
9. outer_width, outer_height, outer_depth: dimensões externas.
10. outer_unit: unidade das dimensões externas (mm ou in).
11. mounting_depth: profundidade útil de montagem.
12. weight e weight_unit: peso do rack.
13. max_weight: capacidade máxima de carga.
14. description, owner, comments, tags e custom_fields.

Regras de negócio e validações:
1. Unicidade composta: manufacturer + model.
2. Unicidade composta: manufacturer + slug.
3. Se houver qualquer dimensão externa (outer_*), outer_unit é obrigatório.
4. Se max_weight for preenchido, weight_unit é obrigatório.
5. U height validado por limites mínimos/máximos do sistema.
6. Ao salvar RackType, atributos físicos são propagados para todos os racks que o referenciam.

Comportamento operacional:
1. RackType mantém consistência mecânica entre racks iguais.
2. Alterações em RackType podem impactar racks existentes (atualização automática dos atributos copiados).

APIs e filtros:
1. REST endpoint: /api/dcim/rack-types/.
2. Filtros principais: manufacturer, form_factor, width, model, slug, u_height, dimensões, pesos.
3. Busca textual: model, description, comments.
4. Campo de apoio: rack_count.

### 3.2.5 Entidade Rack

Finalidade:
Representar um rack físico instalado em um site (e opcionalmente em uma location) para acomodar devices e recursos de energia.

Campos funcionais:
1. name: identificador principal do rack.
2. facility_id: identificador externo/local da instalação (opcional).
3. site: site obrigatório.
4. location: location opcional dentro do site.
5. group: rack group opcional.
6. tenant: tenant opcional.
7. status: estado operacional do rack.
8. role: rack role opcional.
9. serial: serial físico.
10. asset_tag: etiqueta patrimonial única.
11. airflow: direção de fluxo de ar.
12. rack_type: referência opcional para RackType.
13. Campos físicos (form_factor, width, u_height, starting_unit, desc_units, dimensões, peso etc.).
14. description, owner, comments, tags, custom_fields.

Status padrão de Rack:
1. reserved
2. available
3. planned
4. active
5. deprecated

Regras de negócio e validações:
1. Integridade Site/Location:
	1. Se location for informada, ela deve pertencer ao mesmo site do rack.
2. Unicidade contextual:
	1. (location, name) único.
	2. (location, facility_id) único.
3. Unicidade global:
	1. asset_tag único no sistema.
4. Dimensões:
	1. Se qualquer outer_* for preenchido, outer_unit é obrigatório.
5. Peso:
	1. Se max_weight for preenchido, weight_unit é obrigatório.
6. Compatibilidade com dispositivos já montados (edição de rack existente):
	1. Não permite reduzir altura efetiva abaixo da necessária para os devices instalados.
	2. Não permite aumentar starting_unit além da menor posição ocupada.
7. Quando rack_type é definido:
	1. Campos físicos do rack são sobrescritos/copiados do rack type automaticamente no save.

Operações de domínio (métodos funcionais):
1. Cálculo de unidades:
	1. Lista de unidades em incrementos de 0.5U.
	2. Suporte a numeração ascendente ou descendente.
2. Elevação:
	1. get_rack_units() para visão JSON de ocupação por face (front/rear).
	2. get_elevation_svg() para renderização visual SVG.
3. Capacidade:
	1. get_available_units() retorna posições livres para uma altura específica.
4. Utilização:
	1. get_utilization() calcula utilização de U considerando ocupação e reservas.
	2. get_power_utilization() calcula percentual de uso de energia do rack.

Relacionamentos e impacto:
1. on_delete:
	1. site: PROTECT.
	2. location: SET_NULL.
	3. group/tenant/role/rack_type: PROTECT.
2. Relaciona-se diretamente com devices, powerfeeds e reservations.

APIs e filtros:
1. REST endpoint: /api/dcim/racks/.
2. Filtros principais:
	1. Contexto: region, site_group, site, location.
	2. Organização: group, role.
	3. Modelo físico: manufacturer, rack_type, form_factor, width, airflow, dimensões.
	4. Identidade: name, facility_id, serial, asset_tag.
	5. Estado: status.
3. Busca textual: name, facility_id, serial, asset_tag, description, comments.
4. Campos de apoio na API: device_count e powerfeed_count.
5. Endpoint operacional adicional:
	1. /api/dcim/racks/{id}/elevation/?render=json|svg&face=front|rear...
	2. Permite obter elevação em JSON ou SVG para uso de UI/integração.

### 3.2.6 Entidade Rack Reservation

Finalidade:
Reservar uma ou mais unidades de rack para planejamento de instalação futura.

Campos funcionais:
1. rack: rack alvo da reserva.
2. units: lista de U(s) reservadas.
3. status: status da reserva.
4. tenant: tenant opcional.
5. user: usuário responsável.
6. description: descrição obrigatória.
7. owner, comments, tags e custom_fields.
8. unit_count (calculado na API).

Status padrão de Rack Reservation:
1. pending
2. active
3. stale

Regras de negócio e validações:
1. Todas as units informadas devem existir no intervalo de unidades do rack.
2. Não permite conflito de reserva: uma mesma unit não pode estar em duas reservas do mesmo rack.
3. Reservas não podem atravessar racks (cada objeto aponta para um único rack).
4. Status da reserva é documental e não bloqueia, por si só, instalação de devices.

Relacionamentos e impacto:
1. rack usa CASCADE: excluir rack exclui reservas associadas.
2. tenant e user usam PROTECT.

APIs e filtros:
1. REST endpoint: /api/dcim/rack-reservations/.
2. Filtros principais:
	1. rack, site, region, site_group, location, group.
	2. status, user, tenant.
	3. unit (contém unidade específica).
	4. unit_count_min e unit_count_max.
3. Busca textual: rack name/facility_id, username e description.

### 3.2.7 APIs existentes no domínio Racks

REST API (dcim):
1. /api/dcim/rack-groups/
2. /api/dcim/rack-roles/
3. /api/dcim/rack-types/
4. /api/dcim/racks/
5. /api/dcim/rack-reservations/

Operações REST:
1. CRUD completo para todas as entidades.
2. Filtros por IDs, slugs, contexto geográfico e atributos físicos.
3. Contadores de objetos relacionados em serializers.
4. Endpoint de elevação para racks com renderização SVG/JSON.

GraphQL:
1. Types expostos: RackGroupType, RackRoleType, RackTypeType, RackType (modelo Rack), RackReservationType.
2. Relações com site/location, devices, powerfeeds, reservations e circuit/path contexts conforme tipo.

### 3.2.8 Funcionalidades frontend (visão de processo)

Fluxo típico de operação:
1. Criar Rack Groups e Rack Roles conforme padrão de operação.
2. Cadastrar Rack Types por fabricante/modelo com atributos físicos padronizados.
3. Instanciar Racks por site/location e, quando aplicável, vincular rack_type.
4. Validar ocupação por elevação e disponibilidade de U antes de movimentações.
5. Registrar Rack Reservations para planejamento.
6. Monitorar utilização de espaço e energia do rack.

Capacidades operacionais entregues:
1. Governança física consistente da camada de acomodação.
2. Planejamento de ocupação com granularidade de 0.5U.
3. Redução de conflito de instalação via validações de capacidade e reservas.
4. Base visual e analítica para operações de data center.

## 3.3 Devices

| Grupo | Item | Função |
|---|---|---|
| Devices | Devices | Inventário de equipamentos (switches, roteadores, servidores etc.). |
| Devices | Modules | Módulos instaláveis em dispositivos (line cards, módulos ópticos etc.). |
| Devices | Device Roles | Função operacional do equipamento. |
| Devices | Platforms | Plataforma/OS para padronizar automação e gestão. |
| Devices | Virtual Chassis | Agrupamento lógico de múltiplos devices como um chassis virtual. |
| Devices | Virtual Device Contexts | Contextos virtuais dentro de um equipamento físico. |
| Device Types | Device Types | Modelos de dispositivos com templates de componentes. |
| Device Types | Module Types | Tipos de módulos reutilizáveis. |
| Device Types | Module Type Profiles | Perfis de tipos de módulo para padronização. |
| Device Types | Manufacturers | Fabricantes dos equipamentos e componentes. |
| Device Components | Interfaces | Portas/interfaces lógicas e físicas. |
| Device Components | Front Ports | Portas frontais para patching/cross-connect. |
| Device Components | Rear Ports | Portas traseiras associadas a front ports. |
| Device Components | Console Ports | Portas de console do equipamento. |
| Device Components | Console Server Ports | Portas em console servers para acesso serial. |
| Device Components | Power Ports | Entradas de energia de equipamentos. |
| Device Components | Power Outlets | Saídas de energia em PDUs/painéis. |
| Device Components | Module Bays | Baias onde módulos podem ser instalados. |
| Device Components | Device Bays | Baias para equipamentos em chassis/racks específicos. |
| Device Components | Inventory Items | Itens de inventário não modelados como device completo. |
| Device Components | Inventory Item Roles | Classificação funcional dos itens de inventário. |
| Addressing | MAC Addresses | Controle de endereços MAC vinculados a interfaces/objetos. |

## 3.4 Connections

| Grupo | Item | Função |
|---|---|---|
| Connections | Cables | Conexões físicas entre terminação A e B. |
| Connections | Cable Bundles | Agrupa cabos para organização de feixes/troncos. |
| Connections | Wireless Links | Relações de enlace sem fio entre endpoints. |
| Connections | Interface Connections | Visão consolidada de conexões por interfaces. |
| Connections | Console Connections | Visão de conexões de console para operação out-of-band. |
| Connections | Power Connections | Mapeamento de conexões de energia entre origem e carga. |

## 3.5 Wireless

| Grupo | Item | Função |
|---|---|---|
| Wireless | Wireless LANs | Definição e gestão de redes sem fio (SSID/LAN). |
| Wireless | Wireless LAN Groups | Agrupamento de WLANs para padronização e segmentação. |

## 3.6 IPAM

| Grupo | Item | Função |
|---|---|---|
| IP Addresses | IP Addresses | Inventário de endereços IP e seus vínculos. |
| IP Addresses | IP Ranges | Faixas contínuas de IP para reserva/alocação. |
| Prefixes | Prefixes | Gestão de redes/sub-redes e hierarquia de blocos. |
| Prefixes | Prefix & VLAN Roles | Papéis para redes e VLANs com semântica operacional. |
| ASNs | ASN Ranges | Faixas de ASN para delegação interna. |
| ASNs | ASNs | Cadastro de ASN usados no ambiente. |
| Aggregates | Aggregates | Blocos agregados de endereçamento em nível superior. |
| Aggregates | RIRs | Entidades RIR associadas a alocação de blocos. |
| VRFs | VRFs | Domínios de roteamento virtual independentes. |
| VRFs | Route Targets | Targets para políticas de roteamento/MP-BGP em VRFs. |
| VLANs | VLANs | Cadastro de VLANs e seus atributos. |
| VLANs | VLAN Groups | Agrupamento de VLANs por escopo/domínio. |
| VLANs | VLAN Translation Policies | Políticas de tradução de VLAN entre domínios. |
| VLANs | VLAN Translation Rules | Regras específicas de tradução VLAN-to-VLAN. |
| Other | FHRP Groups | Grupos de redundância de gateway (FHRP). |
| Other | Application Service Templates | Templates de serviços de aplicação por padrão. |
| Other | Application Services | Instâncias de serviços de aplicação vinculadas a IPs/objetos. |

## 3.7 VPN

| Grupo | Item | Função |
|---|---|---|
| Tunnels | Tunnels | Cadastro de túneis VPN ponto a ponto. |
| Tunnels | Tunnel Groups | Agrupamento de túneis por cliente, região ou política. |
| Tunnels | Tunnel Terminations | Terminações/endpoints de túneis. |
| L2VPNs | L2VPNs | Serviços L2VPN e suas propriedades. |
| L2VPNs | L2VPN Terminations | Pontos de terminação de serviços L2VPN. |
| Security | IKE Proposals | Propostas criptográficas para negociação IKE. |
| Security | IKE Policies | Políticas IKE aplicáveis a túneis/perfis. |
| Security | IPSec Proposals | Propostas de criptografia/integridade para IPSec. |
| Security | IPSec Policies | Políticas IPSec que consolidam parâmetros de segurança. |
| Security | IPSec Profiles | Perfis reutilizáveis para aplicar padrões IPSec. |

## 3.8 Virtualization

| Grupo | Item | Função |
|---|---|---|
| Virtual Machines | Virtual Machines | Inventário de VMs com recursos e metadados. |
| Virtual Machines | Interfaces | Interfaces de rede de VMs. |
| Virtual Machines | Virtual Disks | Discos virtuais associados às VMs. |
| Virtual Machines | Virtual Machine Types | Tipos/modelos de VM para padronização. |
| Clusters | Clusters | Agrupamentos de hosts/plataformas de virtualização. |
| Clusters | Cluster Types | Tipos de cluster (tecnologia/provedor). |
| Clusters | Cluster Groups | Agrupamento de clusters por contexto operacional. |

## 3.9 Circuits

| Grupo | Item | Função |
|---|---|---|
| Circuits | Circuits | Circuitos contratados junto a provedores. |
| Circuits | Circuit Types | Classificação de circuitos por tecnologia/serviço. |
| Circuits | Circuit Terminations | Pontos de terminação física/lógica de circuitos. |
| Virtual Circuits | Virtual Circuits | Circuitos virtuais sobre infraestrutura de transporte. |
| Virtual Circuits | Virtual Circuit Types | Tipos de circuitos virtuais. |
| Virtual Circuits | Virtual Circuit Terminations | Terminações de circuitos virtuais. |
| Groups | Circuit Groups | Agrupa circuitos para gestão por serviço/cliente. |
| Groups | Group Assignments | Associação de circuitos a grupos. |
| Providers | Providers | Cadastro de operadoras/provedores. |
| Providers | Provider Accounts | Contas/contratos por provedor. |
| Providers | Provider Networks | Redes pertencentes/geridas pelo provedor. |

## 3.10 Power

| Grupo | Item | Função |
|---|---|---|
| Power | Power Feeds | Alimentações elétricas de entrada para a infraestrutura. |
| Power | Power Panels | Painéis de distribuição elétrica e seus circuitos lógicos. |

## 3.11 Provisioning

| Grupo | Item | Função |
|---|---|---|
| Configurations | Config Contexts | Dados contextuais para renderização de configuração por objeto. |
| Configurations | Config Context Profiles | Perfis para reaproveitar conjuntos de contexto. |
| Configurations | Config Templates | Templates de configuração para gerar configs de dispositivos/serviços. |

## 3.12 Customization

| Grupo | Item | Função |
|---|---|---|
| Customization | Custom Fields | Cria campos adicionais em modelos sem alterar código-fonte. |
| Customization | Custom Field Choices | Conjuntos de opções reutilizáveis para campos customizados. |
| Customization | Custom Links | Links personalizados contextuais em páginas de objetos. |
| Customization | Export Templates | Templates para exportar dados em formatos customizados. |
| Customization | Saved Filters | Salva filtros recorrentes para consultas rápidas. |
| Customization | Table Configs | Preferências/configurações de exibição de tabelas. |
| Customization | Tags | Classificação transversal de objetos por etiquetas. |
| Customization | Image Attachments | Associação de imagens a objetos para documentação visual. |
| Scripts | Scripts | Execução e gestão de scripts operacionais/automação dentro da UI. |

## 3.13 Operations

| Grupo | Item | Função |
|---|---|---|
| Integrations | Data Sources | Origens externas de dados para sincronização/importação. |
| Integrations | Event Rules | Regras para acionar automações com base em eventos do sistema. |
| Integrations | Webhooks | Envio de eventos para sistemas externos via HTTP. |
| Jobs | Jobs | Catálogo e acompanhamento de jobs assíncronos. |
| Logging | Notification Groups | Grupos de notificação para eventos e alertas. |
| Logging | Journal Entries | Registro textual de observações operacionais em objetos. |
| Logging | Change Log | Histórico de mudanças para auditoria e rastreabilidade. |

## 3.14 Admin (Administração)

| Grupo | Item | Função |
|---|---|---|
| Authentication | Users | Gestão de usuários locais da plataforma. |
| Authentication | Groups | Gestão de grupos para concessão de permissões em lote. |
| Authentication | API Tokens | Tokens para autenticação em integrações via API. |
| Authentication | Permissions | Permissões granulares por objeto/ação, inclusive com restrições. |
| Ownership | Owner Groups | Grupos de propriedade para governança de responsabilidade. |
| Ownership | Owners | Entidades proprietárias para vincular accountability aos ativos. |
| System | System | Visão/estado geral da instância para administração. |
| System | Plugins | Gestão e visibilidade de plugins instalados. |
| System | Configuration History | Histórico de revisões de configuração da instância. |
| System | Background Tasks | Monitoramento de tarefas em background e filas operacionais. |

## 3.15 Plugins (dinâmico)

| Grupo | Item | Função |
|---|---|---|
| Variável | Menus de plugin | Funcionalidades adicionais definidas por cada plugin instalado. |
| Variável | Itens de plugin | Objetos e fluxos customizados que estendem o NetBox nativo. |

---
 
## 4. Conclusão prática

O frontend do NetBox é estruturado para operação diária de infraestrutura em escala, com foco em consistência de navegação, governança por permissões e extensibilidade por plugins.  
Na prática, o menu principal cobre o ciclo completo de modelagem e operação: organização, ativos físicos/lógicos, conectividade, endereçamento, segurança, virtualização, automação, auditoria e administração.

Se quiser, eu posso gerar uma versão 2 deste relatório em formato “manual de uso” por persona (NOC, engenharia, segurança, automação e administração), com trilhas de navegação recomendadas para cada perfil.

Created 3 todos