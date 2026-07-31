# Regras de Negócio e Decisões Arquiteturais

> Fonte autoritativa das decisões transversais do V.tal Nexus. O `AGENTS.md` mantém a mesma lista em
> forma de tabela compacta, para consumo rápido por agentes; **este documento é a forma longa**, com
> racional, exemplos e casos de borda.

Este arquivo também é carregado em runtime pelo fallback local do Nexus Copilot
(`src/modules/search/local-knowledge-provider.ts`) — escreva afirmações claras e citáveis.

---

## Como ler o status

Cada decisão traz o estado real no código, porque **cânone e implementação não coincidem em tudo**.

| Status | Significado |
|---|---|
| ✅ **Implementado** | Existe e funciona no backend atual |
| ⚠️ **Parcial** | Implementado com desvio ou cobertura incompleta |
| 📐 **Previsto no design** | Decidido e documentado, ainda não construído |

---

## A tríade — a decisão de base

O Nexus separa o inventário em três camadas que respondem a perguntas diferentes. Esta é a decisão
da qual todas as outras derivam.

| Pergunta | Camada | Entidades | Open APIs |
|---|---|---|---|
| **Onde?** | Geographic | GeographicSite, GeographicAddress, GeographicLocation | TMF673/674/675 |
| **O quê?** | Resource | PhysicalResource, LogicalResource, ResourceSpecification | TMF634/639 |
| **Para quê / para quem?** | Service | CFS, RFS, ServiceSpecification | TMF633/638 |

**Regra de ouro — referência, nunca contenção:**

- Um **Service referencia** Resource via `supportingResource`. Nunca copia atributos de inventário físico.
- Um **Resource referencia** Geographic via `place`. Nunca embute site, endereço ou coordenada.

Misturar as camadas é o erro mais caro do domínio: duplica dado, cria duas fontes de verdade e
quebra a rastreabilidade entre o que foi vendido e o que está instalado.

Status: ⚠️ **Parcial** — os módulos `geo`, `resource` e `service` e suas proteções centrais existem,
mas as matrizes dos HLDs registram invariantes especializadas e governança ainda pendentes.

---

## C1 — TMF-first

**Regra.** Toda entidade, atributo e evento segue o modelo canônico TM Forum. Extensão específica da
V.tal entra como `characteristic` tipada via catálogo — **nunca** como campo hardcoded no schema.

**Racional.** O inventário precisa sobreviver a mudanças de produto e a integrações com terceiros. Um
campo hardcoded exige migração de schema a cada variação comercial; uma `characteristic` tipada
acomoda a variação sem tocar na estrutura. Além disso, aderência ao TMF é o que permite conversar com
OSS/BSS de parceiros sem tradutor proprietário.

**Na prática.**

- Precisa guardar "potência óptica de recepção" numa ONT? É `characteristic`, não coluna.
- Precisa de um novo tipo de site? É uma `GeographicSiteSpecification` nova, não um `enum` no código.

Status: ⚠️ **Parcial** — as rotas `/tmf-api/*` expõem as Open APIs da base, porém ainda existem
categorias e tipos de relação aceitos como valores fechados/livres no código, em desacordo com a
extensão integral por catálogo.

---

## C2 — O Rack é a fronteira Geo ↔ Resource

**Regra.** Acima do Rack (sala, andar, prédio, Central) é **GeographicSite**. Do Rack para dentro
(chassis, placa, porta) é **PhysicalResource**.

**Racional.** Sem uma fronteira explícita, "sala de equipamentos" pode ser modelada como site ou como
recurso, e as duas escolhas se espalham pelo inventário até ninguém saber onde procurar. O Rack é o
ponto natural: ele é o último objeto que se descreve por endereço e o primeiro que se descreve por
capacidade, ocupação e conexão.

**Na prática.** Numa Central GPON:

```text
Central (GeographicSite)
└── Sala de transmissão (GeographicSite, sub-site)
    └── Rack ......................... FRONTEIRA
        └── OLT (PhysicalResource)
            └── Placa (PhysicalResource)
                └── Porta (PhysicalResource)
```

Status: ✅ **Implementado**.

---

## C3 — A fronteira dupla do Service

O módulo Service tem **duas** fronteiras, e confundi-las é fonte recorrente de erro.

**(a) Service ↔ Resource.** Serviço é intangível. Ele referencia recurso via `supportingResource` e
nunca o contém.

**(b) CFS ↔ RFS.** O **CFS** (Customer Facing Service) é a visão comercial — é o que o cliente
comprou, e carrega o `SubscriberID`. O **RFS** (Resource Facing Service) é a visão técnica — é o que
a rede entrega, e é ele quem consome recursos.

> **O CFS nunca referencia Resource diretamente.** O encadeamento correto é sempre
> `CFS → RFS → Resource`.

**Racional.** Um mesmo produto comercial pode ser entregue por arranjos técnicos diferentes (GPON
hoje, ponto-a-ponto amanhã) sem que o contrato com o cliente mude. Separar as camadas permite trocar
a implementação técnica sem reescrever a camada comercial — e permite que um CFS seja suportado por
múltiplos RFS (acesso + transporte + backbone).

Status: ✅ **Implementado**.

---

## C4 — Home Passed não é Service

**Regra.** *Home Passed* (HP) é **GeographicAddress** (Módulo 1) somado à viabilidade via TMF645
(Módulo 4). *Home Connected* (HC) é que vira **ServiceInstance** (Módulo 3).

**Racional.** É uma decisão de escala, não de semântica. A V.tal tem cerca de **22 milhões de HPs** —
endereços que a fibra passa em frente e poderia atender. Persistir cada um como Service criaria 22
milhões de serviços que ninguém contratou, inflando o inventário de serviço em duas ordens de
grandeza e destruindo qualquer métrica de base instalada.

Um HP é uma **possibilidade**; um HC é um **fato**. Só o fato vira Service.

Status: ⚠️ **Parcial** — a regra é respeitada, mas a viabilidade TMF645 existe
(`/tmf-api/serviceQualificationManagement/v4`) sem a carga dos 22M endereços.

---

## C5 — Agnóstico à origem: o grupo `_origin`

**Regra.** O Nexus gera **identidade própria**. IDs de sistemas legados nunca são a chave primária —
eles ficam preservados como `characteristic` somente-leitura no grupo `_origin`:

| Campo | Conteúdo |
|---|---|
| `_origin.system` | Sistema de origem (ex.: `netwin`) |
| `_origin.id` | Identificador no sistema de origem |
| `_origin.entity` | Entidade/tabela de origem |
| `_origin.migratedAt` | Timestamp da migração |
| `_origin.migratedBy` | Autor/processo da migração |
| `_origin.url` | *(opcional)* deep link para o registro legado |
| `_origin.extra` | *(opcional)* payload adicional |

**Racional.** Durante o *dual-running* com o Netwin, o mesmo ativo existe nos dois sistemas. Adotar o
ID legado como chave amarraria o Nexus ao legado para sempre e impediria consolidar ativos vindos de
fontes diferentes. Preservar a origem em `_origin` mantém a rastreabilidade de auditoria sem criar
dependência estrutural.

Status: 📐 **Previsto no design** — **`_origin` não existe no código atual**. Além disso, o cânone
pede **UUID v7** (ordenável no tempo, melhor para índice), mas `src/modules/geo/ids.ts` usa
`randomUUID()`, que é **UUID v4**. Divergência a resolver antes da migração real.

---

## C6 — Soft-delete e soft-terminate

**Regra.** Nada é excluído fisicamente do inventário.

| Camada | Como "apagar" |
|---|---|
| Resource | `administrativeState = 'locked'` |
| Service | `state = 'terminated'` |

**Racional.** Inventário de rede é registro histórico. Um recurso desativado ainda precisa aparecer
em auditoria, em análise de falha passada e em faturamento retroativo. Exclusão física destrói a
capacidade de responder "o que estava instalado naquela data?" — pergunta rotineira em disputa
contratual e em pós-morte de incidente.

Status: ✅ **Implementado** — ver `administrativeState: 'locked'` em
`src/modules/resource/service.ts` e `state: 'terminated'` em `src/modules/service/service.ts`.

---

## C7 — Event-driven (TMF688)

**Regra.** Toda mudança relevante publica evento via **outbox pattern**, idempotente, com schema
versionado em Schema Registry.

**Racional.** O inventário é consumido por sistemas que não podem fazer polling em 22M de registros.
O outbox garante que evento e mudança de estado são atômicos — não existe "mudou mas não avisou" nem
"avisou mas não mudou". Idempotência permite reprocessar sem duplicar efeito.

Status: ⚠️ **Parcial** — TMF688 exposto em `/tmf-api/eventManagement/v4/event`; o outbox
transacional e o Schema Registry são 📐 previstos no design.

---

## C8 — Multi-tenant e wholesale por premissa

**Regra.** `relatedParty` com o Tenant é preenchido **desde a criação** da entidade. No módulo
Service, o *subscriber* do CFS é tipicamente um **Tenant ISP**, não o usuário final.

**Racional.** A V.tal é infraestrutura de fibra **neutra**. O cliente que contrata é o ISP; o morador
é cliente do ISP, não da V.tal. Tratar o subscriber como pessoa física por padrão inverte o modelo de
negócio e quebra o faturamento por atacado.

O atributo `modelo_comercial` distingue `wholesale` de `direto` nos casos em que a V.tal atende o
cliente final.

> ❗ Ao modelar qualquer serviço, o **default é ISP/Tenant**. Cliente final é a exceção, e precisa ser
> explícito.

Status: ⚠️ **Parcial** — o módulo `party` e TMF632/TMF669 existem, mas RBAC, segregação por tenant e
`relatedParty` obrigatório ainda não cobrem todos os writes (DEV-X-004).

---

## C9 — Catálogos extensíveis via API

**Regra.** RelationshipTypes e Specifications têm bootstrap canônico **mais** CRUD via API, com
governança (auditoria + evento TMF688). Sem listas fechadas hardcoded no código.

**Racional.** A planta evolui mais rápido que o ciclo de release. Se cadastrar um novo modelo de ONT
exige deploy, o inventário fica permanentemente atrasado em relação à realidade de campo — e a
operação passa a usar planilha paralela, que é o problema que o Nexus existe para resolver.

Status: ⚠️ **Parcial** — Specifications possuem bootstrap e APIs, mas os catálogos governados de
RelationshipType e parte dos lifecycles/versionamentos ainda estão pendentes (DEV-X-003,
DEV-RES-006 e DEV-SVC-006).

---

## C10 — Oracle-native + Property Graph

**Regra (alvo).** Stack Oracle 21c/23ai, com *path computation* (porta OLT → ONT) via Oracle Property
Graph sobre o inventário de Resources.

**Racional.** Rastrear o caminho óptico de ponta a ponta é uma consulta de grafo, não relacional:
travessia de profundidade variável por portas, cabos, splitters e conexões. Fazer isso em SQL puro
exige CTE recursiva cara; um property graph resolve nativamente.

**Confirmado como padrão corporativo.** Oracle é o banco padrão da V.tal, ao lado de OpenShift
(aplicação), Redis (cache), Kafka (mensageria) e Apigee (API Gateway). C10 não é hipótese: é o alvo
homologado.

Status: 📐 **Previsto no design.** ⚠️ **A implementação atual roda em Neon Postgres**
(`@neondatabase/serverless` + `pg`) sobre Vercel — **infraestrutura temporária de laboratório**.
Trate C10 como destino arquitetural: **não** escreva SQL específico de Oracle no código atual, mas
também não crie dependência de Postgres que dificulte a migração.

O desenho alvo completo sobre essa stack está em
[`../3-system-design/architecture.md`](../3-system-design/architecture.md).

---

## Resumo do descompasso cânone × código

Consolidado das divergências apontadas acima, para quem for planejar a evolução:

| Decisão | Cânone | Código hoje |
|---|---|---|
| C5 | UUID v7 + grupo `_origin` | `randomUUID()` (v4); `_origin` inexistente |
| C7 | Outbox transacional + Schema Registry | Rotas TMF688 sem outbox |
| C10 | Oracle 21c/23ai + Property Graph | Neon Postgres |
| C4 | 22M HPs como GeographicAddress | Regra respeitada, carga não feita |
| C8 | `relatedParty`, RBAC e isolamento por tenant | Party existe; cobertura transversal é parcial |
| C9 | Catálogos e RelationshipTypes governados | Specifications parciais; tipos de relação sem CRUD completo |

---

## Referências

| Onde | O quê |
|---|---|
| [`AGENTS.md`](../../AGENTS.md) | Tabela compacta C1–C10 + convenções para agentes de IA |
| [`product-overview.md`](product-overview.md) | Visão de produto, módulos e roadmap |
| [`glossary.md`](glossary.md) | Termos e acrônimos |
| [`../2-functional-specs/`](../2-functional-specs/) | HLDs por módulo, com requisitos e critérios de aceite |
| [`../3-system-design/`](../3-system-design/) | Arquitetura, modelo de dados, integrações, NFR e segurança |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
