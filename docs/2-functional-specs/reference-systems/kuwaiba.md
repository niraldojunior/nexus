# Relatório do Frontend do Kuwaiba

## 1. Visão geral do frontend
O frontend do Kuwaiba é construído em Vaadin Flow sobre Spring Boot, com renderização server-side e roteamento por classes Java.  
A composição da interface é modular: cada funcionalidade entra como um módulo registrado, e o menu principal é montado dinamicamente em runtime com base em:

1. categoria do módulo
2. permissão do usuário logado
3. status habilitado do módulo

## 2. Como o frontend está construído

| Camada | Como funciona |
|---|---|
| UI framework | Vaadin Flow, com rotas Java e componentes server-side |
| Container de aplicação | Spring Boot |
| Registro de módulos | ModuleRegistry centraliza módulos carregados |
| Layout base | ModuleLayout define cabeçalho, menu e área de conteúdo |
| Segurança de navegação | beforeEnter valida sessão e privilégios |
| Internacionalização | textos por chaves em arquivos de idioma |
| Tema/estilo | CSS e CssImport por componente/tema |

## 3. Fluxo principal de uso
1. Usuário acessa a tela de login.
2. Login cria sessão via Application Entity Manager.
3. Ao entrar em Home, o ModuleLayout monta o menu superior.
4. Cada item de submenu aponta para a rota do módulo ou abre ação popup.
5. A área central carrega a UI do módulo selecionado.

## 4. Resumo inicial do menu principal e propósito

| Menu principal | Propósito |
|---|---|
| Administration | Governança do sistema, metamodelo, auditoria e operações administrativas |
| Navigation | Exploração e acesso rápido aos ativos de inventário |
| Physical | Gestão de infraestrutura e conexões físicas |
| Logical | Gestão de recursos lógicos de rede |
| Services | Gestão de serviços, contratos e processos |
| Planning | Planejamento de projetos e atividades |
| Other | Funcionalidades auxiliares e integrações sem categoria dedicada |
| Settings | Configurações técnicas e de comportamento |
| About | Informações institucionais e da aplicação |

## 5. Detalhamento completo de cada submenu

### 5.1 Administration

| Submenu | Função |
|---|---|
| Data Model Manager | Gerencia a estrutura do modelo de dados, hierarquia de classes e list types |
| Containment Manager | Define e mantém hierarquias especiais de contenção entre classes |
| List Type Manager | Gerencia list types e seus itens, incluindo CRUD e uso por objetos |
| User Manager | Cria e gerencia usuários, grupos e privilégios |
| Session Manager | Lista, monitora e encerra sessões; envia mensagens broadcast |
| Template Manager | Gerencia templates de serviços, classes e recursos relacionados |
| Audit Trail | Rastreia mudanças globais e suporta auditoria de modificações |
| Job Scheduler | Gerencia agendamentos e execução de jobs |
| Reporting | Cria relatórios complexos com Groovy e Persistence API |
| Task Manager | Gerencia e executa tarefas operacionais |

### 5.2 Navigation

| Submenu | Função |
|---|---|
| Navigation | Busca, exploração e navegação pelos ativos de inventário |
| Favorites | Acesso rápido a objetos usados com frequência |
| Queries | Criação, salvamento e execução de consultas (gráficas e low-level) |
| Pools | Criação e organização de pools customizados de objetos |
| Warehouse Manager | Gestão de armazéns |

### 5.3 Physical

| Submenu | Função |
|---|---|
| Connectivity Manager | Gestão de conectividade física |
| Outside Plant | Gestão de infraestrutura externa (postes, manholes, torres, edifícios etc.) |
| Physical Connections | Criação e gestão de conexões físicas ópticas/elétricas/energia |

Observação: Physical Connections está desabilitado no código atual, então tende a não aparecer no menu para uso normal.

#### 5.3.1 Análise detalhada do menu Physical

O menu Physical é composto por três frentes funcionais principais:

1. Connectivity Manager (optional module)
2. Outside Plant (commercial module)
3. Physical Connections (optional module, atualmente desabilitado no bootstrap do módulo)

##### A. Connectivity Manager

Objetivo funcional:

1. montar circuitos físicos passo a passo entre portas
2. converter circuito físico em conexão lógica de última milha
3. usar links existentes, criar novos links ou espelhamentos (mirror)

Operações principais:

1. Circuit tab
1. selecionar Source port
2. selecionar Target port
3. escolher Action por linha
1. Select Link
2. New Link
3. New Mirror
4. New Link From Container Template
4. visualizar/editar Link selecionado na coluna de link
5. criar circuito completo (Create Circuit)
2. Logical connection tab (habilitado após circuito válido)
1. definir nome da conexão lógica
2. selecionar/confirmar endpoint A e endpoint B
3. escolher classe da conexão lógica (subclasses de GenericLastMileCircuit)
4. opcionalmente associar a um serviço (GenericService)
5. criar logical connection

Campos de entrada relevantes:

1. Source Port
2. Target Port
3. Action type
4. Link name
5. Link class (subclasses de GenericPhysicalLink)
6. Container template path (no modo New Link From Container Template)
7. Logical connection name
8. Logical connection class (GenericLastMileCircuit)
9. Service (opcional)

Regras de negócio e validações:

1. Circuito com múltiplos segmentos exige continuidade: target da linha N deve ser igual ao source da linha N+1.
2. Para New Link:
1. endpoints não podem já estar conectados por endpointA/endpointB
2. deve existir common parent entre endpoints
3. nome e classe do link são obrigatórios
3. Para New Mirror:
1. endpoints devem ser portas (GenericPort)
2. regra de exclusividade entre mirror e mirrorMultiple é validada
4. Para New Link From Container Template:
1. endpoint A/B obrigatórios
2. nome do container obrigatório
3. classe/template obrigatórios
4. o último elemento do template deve ser subclasse de GenericPhysicalLink
5. Para criação de last mile logical connection:
1. classe deve ser subclasse de GenericLastMileCircuit
2. endpoint A/B devem ser GenericPort
3. portas precisam estar sob GenericCommunicationsElement

Saídas/efeitos:

1. criação de objetos físicos e relacionamentos especiais de endpoint
2. criação de last mile logical connection
3. relacionamento opcional uses com serviço
4. geração de activity logs

##### B. Outside Plant

Objetivo funcional:

1. gerenciar vistas geográficas (OSP views)
2. desenhar e manter nós e containers em mapa
3. operar ferramentas de campo (splicing, corte/emenda, medição, filtros)

Operações principais no frontend:

1. OSP View lifecycle
1. criar view
2. abrir view existente
3. salvar view
4. atualizar view
5. excluir view
2. Ferramentas de mapa
1. Add Node
2. Connect two nodes using a container
3. Run a container through single/multiple containers
4. Search node/connection
5. Measure distance
6. Filter nodes by class
3. Operações de localização/dispositivo
1. seleção de location
2. refresh da location view
3. splicing de fibra
4. cut and splice
5. show/hide leftover fiber
6. change device position

Campos e propriedades relevantes:

1. OSP View metadata
1. name
2. description
3. structure (XML serializado em Base64)
2. Mapa
1. centerLatitude
2. centerLongitude
3. zoom
4. map type
5. unit of length
6. compute edges length
7. syncGeoPosition
3. Nó/objeto de inventário no mapa
1. parent
2. name
3. latitude
4. longitude

Regras de negócio e validações:

1. create/update de OSP View exige structure em Base64 válida.
2. XML de structure deve seguir o contrato esperado de view (class, center, zoom, nodes, edges).
3. Novo nó exige parent e name.
4. Parent precisa aceitar a classe do novo nó na contenção.
5. Em syncGeoPosition ativo, mudanças no mapa podem persistir latitude/longitude no inventário.
6. Persistência de geo exige atributos latitude/longitude na classe e tipo float/double.

APIs dedicadas (Outside Plant):

1. POST /v2.1.1/osp-manager/createOSPView/{name}/{description}/{structure}/{sessionId}
2. GET /v2.1.1/osp-manager/getOSPView/{id}/{sessionId}
3. GET /v2.1.1/osp-manager/getOSPViews/{sessionId}
4. PUT /v2.1.1/osp-manager/updateOSPView/{id}/{name}/{description}/{structure}/{sessionId}
5. DELETE /v2.1.1/osp-manager/deleteOSPView/{id}/{sessionId}

##### C. Physical Connections

Objetivo funcional:

1. criar/deletar conexões físicas (links e containers)
2. rastrear caminho físico e árvore física
3. prover ações avançadas para conexão de portas/locations e espelhamento

Importante sobre disponibilidade:

1. o módulo registra ações/widgets, mas está com setEnabled(false) no init do módulo
2. portanto pode não aparecer no menu em runtime padrão

Operações principais de serviço:

1. createPhysicalConnection
1. valida subclasse de GenericPhysicalConnection
2. exige common parent entre endpoints
3. para links (GenericPhysicalLink), endpoints devem ser GenericPort
4. impede endpoint já conectado
5. nome obrigatório
6. cria objeto e relacionamentos endpointA/endpointB
2. deletePhysicalConnection
1. valida se objeto é GenericPhysicalConnection
2. remove objeto com cascata lógica do contexto
3. getPhysicalPath
1. retorna trilha física linear via relações especiais (endpoint e mirror)
4. getPhysicalTree
1. retorna representação em árvore das trilhas físicas

Campos de entrada típicos:

1. aObjectClassName
2. aObjectId
3. bObjectClassName
4. bObjectId
5. name
6. connectionClassName
7. templateId
8. userName

APIs dedicadas (Physical Connections):

1. POST /v2.1.1/physical-connections/createPhysicalConnection/{aObjectClassName}/{aObjectId}/{bObjectClassName}/{bObjectId}/{name}/{connectionClassName}/{templateId}/{userName}/{sessionId}
2. DELETE /v2.1.1/physical-connections/deletePhysicalConnection/{objectClassName}/{objectId}/{userName}/{sessionId}
3. GET /v2.1.1/physical-connections/getPhysicalPath/{objectClassName}/{objectId}/{sessionId}
4. GET /v2.1.1/physical-connections/getPhysicalTree/{objectClassName}/{objectId}/{sessionId}

##### D. Mapa consolidado de regras do menu Physical

1. Regras de contenção (common parent, canBeChild) impactam criação de links, containers e nós.
2. Regras de classe (subclass checks) são obrigatórias para tipos de conexão e endpoints.
3. Regras de conectividade evitam duplicidade de endpoint conectado.
4. Regras geográficas controlam persistência de latitude/longitude conforme metamodelo.
5. Regras de fluxo no Connectivity Manager exigem continuidade de segmentos para fechar circuito.

### 5.4 Logical

| Submenu | Função |
|---|---|
| New Logical Circuit | Operações de circuito lógico |
| IP Address Manager | Gestão de endereçamento e subnetting IPv4/IPv6 |
| MPLS Networks | Criação de topologias MPLS e circuitos virtuais |
| SDH Networks Module | Criação de links STMX, circuitos e cálculo de rotas SDH |
| Software Manager | Gestão de licenças de software e hardware associadas a equipamentos |

### 5.5 Services

| Submenu | Função |
|---|---|
| Service Manager | Gestão de clientes, serviços e recursos de rede associados |
| Contract Manager | Criação de contratos e associação de recursos de rede |
| Process Manager | Desenho, execução e orquestração de processos de negócio |
| Process Editor | Criação e edição de diagramas BPMN |

### 5.6 Planning

| Submenu | Função |
|---|---|
| Project Manager | Gestão de projetos e atividades, relacionando recursos humanos e de rede |

### 5.7 Other

| Submenu | Função |
|---|---|
| Contact Manager | Criação e gestão de contatos |
| Layout Editor | Gestão de layouts e formas customizadas |
| Reporting | Relatórios com Groovy e Persistence API |
| Synchronization Framework | Sincronização do inventário com dispositivos/NMS/sistemas legados |
| Impact Analysis | Módulo de análise de impacto |

Observação: Impact Analysis está em categoria de integração e cai em Other porque não há aba própria de Integration no menu principal. Além disso, o nome está com chave vazia no módulo, podendo aparecer sem rótulo amigável dependendo da configuração.

### 5.8 Settings

| Submenu | Função |
|---|---|
| Configuration Variables | Gestão de variáveis de configuração do sistema |
| Validator Definition | Gestão de validadores (regras de código avaliadas ao recuperar objetos) |
| Proxy Management | Gestão de proxies de inventário para integração com terceiros |
| Filter Management | Gestão de filtros de busca/expansão de filhos, muito usados na navegação |

### 5.9 About

| Submenu | Função |
|---|---|
| About | Informações gerais da aplicação e módulos carregados |

## 6. Regras de exibição que impactam o menu
1. O item só aparece se o usuário tiver privilégio de leitura e escrita para o módulo.
2. O item só aparece se o módulo estiver habilitado.
3. O rótulo exibido depende da tradução ativa.
4. A ordem de categorias de topo é fixa no layout.

## 7. Conclusão executiva
O frontend é modular e orientado a privilégios: a estrutura principal é estável, mas os submenus efetivos variam por perfil e habilitação dos módulos.  
O menu principal cobre todo o ciclo de operação do inventário: modelagem, exploração, gestão física/lógica, processos de negócio, planejamento, configuração e auditoria.

## 8. Fontes no código
- ModuleLayout.java
- AbstractModule.java
- ModuleRegistry.java
- LoginUI.java
- HomeUI.java
- SpringConfiguration.java
- messages_en_US.properties
- PhysicalConnectionsModule.java
- ImpactAnalysisModule.java

## 9. Domínio de Locais Físicos (detalhamento funcional)

### 9.1 Premissa arquitetural importante
No Kuwaiba, o domínio de locais físicos é orientado a metamodelo (metadata runtime). Isso significa que parte relevante das entidades e campos não é fixa no código Java: ela é definida no modelo de dados ativo no ambiente.

Em termos práticos:

1. Existem classes base hardcoded para localização.
2. Subclasses concretas (por exemplo, Site, Region, SiteGroup) podem existir no ambiente mesmo sem aparecerem como constantes no código.
3. O formulário de propriedades é montado dinamicamente a partir da metadata da classe selecionada.

### 9.2 Entidades de localização existentes no código-base

#### 9.2.1 Hierarquia geográfica base
Filtro de navegação por localização aplica explicitamente às classes:

1. Contintent (como está escrito no código)
2. Country
3. State
4. City
5. GenericLocation

#### 9.2.2 Classe raiz de localização física
Há uma classe raiz para objetos com localização geográfica:

1. GenericLocation

E há referência histórica no DATAMODEL de que classes sob GenericPhysicalLocation receberam latitude/longitude.

#### 9.2.3 Entidades físicas relacionadas (histórico de modelo)
O DATAMODEL registra evolução de classes de localização física e estrutura de site/planta externa, por exemplo:

1. Building (com atributo type adicionado historicamente)
2. Room (com hasRaisedFloor)
3. Pole
4. Manhole
5. House
6. Lot
7. Zone

Observação: este arquivo é histórico evolutivo, então a existência final depende da metadata efetiva carregada no ambiente.

### 9.3 Sobre Sites, Regiões e Site Groups

No código analisado não há constante hardcoded para Site, Region ou SiteGroup como classe base obrigatória. Portanto:

1. Site, Region e SiteGroup podem existir como subclasses de GenericLocation no metamodelo do ambiente.
2. Se não estiverem modeladas na metadata, não aparecem nas operações/filtros.
3. O comportamento funcional permanece o mesmo para qualquer subclasse válida de GenericLocation: criação, contenção, edição de propriedades e operações de navegação seguem as mesmas regras gerais.

### 9.4 Campos do domínio de locais físicos

#### 9.4.1 Campos transversais de objeto de inventário
Na criação de objetos, o backend inicializa/espera campos base como:

1. uuid
2. name
3. creationDate

#### 9.4.2 Campos geoespaciais
Para localização em mapa e sincronização geográfica, os atributos de classe são:

1. latitude
2. longitude

Condição técnica para uso no OSP:

1. Classe precisa ter ambos os atributos.
2. Tipos devem ser float ou double.
3. No objeto, os atributos precisam estar disponíveis para leitura/escrita no fluxo usado.

#### 9.4.3 Campos dinâmicos por metamodelo
Além dos campos acima, cada entidade (Site, Region, SiteGroup, Building etc.) pode ter atributos próprios definidos via metadata, com regras como:

1. obrigatório (mandatory)
2. único (unique)
3. tipo primitivo
4. tipo lista (GenericObjectList)

### 9.5 Regras de negócio

#### 9.5.1 Regras gerais de criação (backend)
Ao criar objetos de localização/físicos, o backend aplica validações estruturais:

1. não permite instanciar classes inDesign
2. não permite instanciar classes abstratas
3. não permite classes fora da hierarquia InventoryObject
4. valida contenção com canBeChild/canBeSpecialChild
5. valida template compatível com a classe

#### 9.5.2 Regras de atributos
Durante createObject/copyTemplate:

1. atributo mandatory sem valor gera erro
2. atributo unique duplicado gera erro
3. atributo list-type exige IDs válidos dos itens de lista

#### 9.5.3 Regras de criação de nó no OSP
Na janela de novo nó (fluxo de localização física em mapa):

1. parent é obrigatório
2. name é obrigatório
3. parent selecionado deve aceitar a classe do nó via getPossibleChildren/isSubclassOf

#### 9.5.4 Regras de criação de container/conexão em localização

1. criação de container entre endpoints exige pai comum entre source e target
2. ação ConnectLocationVisualAction aplica a GenericLocation
3. target de conexão deve ser compatível com GenericPhysicalNode (validação de subclasse)

#### 9.5.5 Regra de sincronização geográfica
No Outside Plant, se syncGeoPosition estiver ativo:

1. mover nó no mapa atualiza latitude/longitude no objeto de inventário
2. atualização só ocorre quando os atributos existem e possuem tipo numérico permitido

### 9.6 Funcionalidades existentes no frontend para locais físicos

1. Navigation: filtro por hierarquia geográfica (Continent/Country/State/City/GenericLocation).
2. Home widget de mapa: carrega objetos de GenericLocation com latitude/longitude válidos (amostra limitada).
3. Outside Plant: visualização, posicionamento, edição de nós e persistência geográfica.
4. Physical Connections (quando habilitado): conexão entre locais e nós físicos.

### 9.7 APIs existentes relevantes para o domínio

#### 9.7.1 Metadata (descoberta de entidades/campos/regras)
Prefixo: /v2.1.1/core/mem/

1. getClass/{className}/{sessionId}
2. getSubClassesLight/{className}/{includeAbstractClasses}/{includeSelf}/{sessionId}
3. getPossibleChildren/{parentClassName}/{ignoreAbstract}/{sessionId}
4. canBeChild/{allegedParent}/{childToBeEvaluated}/{sessionId}
5. getUpstreamContainmentHierarchy/{className}/{recursive}/{sessionId}
6. getUpstreamSpecialContainmentHierarchy/{className}/{recursive}/{sessionId}

Uso principal: descobrir se Site/Region/SiteGroup existem no metamodelo ativo e listar exatamente seus atributos.

#### 9.7.2 Business entities (operação de dados)
Prefixo: /v2.1.1/core/bem/

1. createObject/{className}/{parentClassName}/{parentId}/{templateId}/{sessionId}
2. createObjectWithCriteria/{className}/{parentClassName}/{templateId}/{criteria}/{sessionId}
3. createBulkObjects/{className}/{parentClassName}/{parentId}/{templateId}/{sessionId}
4. createBulkSpecialObjects/{className}/{parentClassName}/{parentId}/{templateId}/{sessionId}
5. updateObject/{className}/{objectId}/{sessionId}
6. getObjectsOfClassLight/{className}/{page}/{limit}/{sessionId}
7. getObjectsOfClassLightWithFilter/{className}/{page}/{limit}/{sessionId}
8. getChildrenOfClassLight/{parentId}/{parentClassName}/{classNameToFilter}/{maxResults}/{sessionId}
9. getChildrenOfClassLightRecursive/{parentId}/{parentClassName}/{classNameToFilter}/{page}/{limit}/{sessionId}

### 9.8 Matriz funcional por tipo de entidade de localização

| Entidade | Origem | Campos típicos | Regras de negócio | Funcionalidades |
|---|---|---|---|---|
| GenericLocation | Classe base fixa | name, latitude, longitude + dinâmicos | mandatory, unique, canBeChild, tipo válido | Navegação, OSP, conexões |
| City/State/Country/Continent | Hierarquia geográfica fixa no filtro | name + dinâmicos | contenção conforme metadata | filtros de navegação e organização |
| Site (se modelado) | Subclasse dinâmica | name, geo + campos definidos no metamodelo local | mesmas regras gerais de InventoryObject + contenção | cadastro, navegação, mapa, conexão |
| Region (se modelado) | Subclasse dinâmica | name + campos definidos no metamodelo local | mesmas regras gerais de InventoryObject + contenção | agrupamento geográfico e navegação |
| SiteGroup (se modelado) | Subclasse dinâmica | name + campos definidos no metamodelo local | mesmas regras gerais de InventoryObject + contenção | agrupamento lógico/operacional de sites |

### 9.9 Como obter o inventário exato de campos no seu ambiente
Como o domínio é metadata-driven, para um levantamento definitivo de Sites/Regiões/Site Groups no ambiente:

1. buscar subclasses de GenericLocation via getSubClassesLight
2. para cada subclasse, chamar getClass
3. extrair atributos com tipo, mandatory, unique, readOnly/visibility
4. validar hierarquia permitida com getPossibleChildren e canBeChild

Esse fluxo entrega o catálogo real de entidades e campos, sem suposições.

