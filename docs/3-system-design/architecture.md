# Arquitetura de Sistema

> Arquitetura alvo do V.tal Nexus sobre a stack corporativa da V.tal. Os alvos numéricos que esta
> arquitetura existe para sustentar estão em [`non-functional-requirements.md`](non-functional-requirements.md).

**Stack corporativa alvo:** Oracle (banco) · OpenShift (aplicação) · Redis (cache) · Kafka
(mensageria) · Apigee (API Gateway).

> ⚠️ O Vercel + Neon Postgres usado hoje é **infraestrutura temporária de laboratório**. Todo desenho
> aqui assume a stack corporativa. Onde há divergência com o código atual, ela está sinalizada.
> A cobertura funcional atual não é inferida deste desenho-alvo: use as matrizes 2.3 dos HLDs e o
> [`technical-backlog.md`](../5-delivery-plan/technical-backlog.md).

---

## 1. Princípios

| # | Princípio |
|---|---|
| **P1** | **Stateless na aplicação.** Todo estado vive em Oracle, Redis ou Kafka. Pod é descartável. |
| **P2** | **Síncrono para o que é interativo; assíncrono para o que é trabalho.** Aceite de ordem responde na hora; cumprimento roda em worker. |
| **P3** | **Escrita atômica com evento.** Mudança de estado e publicação de evento na mesma transação, via outbox (C7). |
| **P4** | **O domínio não conhece infraestrutura.** Portas e adaptadores; trocar Oracle por outro banco não toca `modules/*/service.ts`. |
| **P5** | **Isolamento de tenant é imposto pela plataforma**, não pela boa vontade de cada query (C8). |
| **P6** | **Degradar antes de cair.** Viabilidade responde de cache quando o banco degrada. |

---

## 2. Visão macro

```text
                    ┌──────────────────────────────────────────┐
   ISP / Portal ───▶│  APIGEE  — OAuth2/JWT · quota por tenant │
   Operação    ───▶│           spike arrest · mTLS ao backend  │
                    └────────────────────┬─────────────────────┘
                                         │
              ┌──────────────────────────┼──────────────────────────┐
              ▼                          ▼                          ▼
      ┌───────────────┐         ┌────────────────┐        ┌─────────────────┐
      │  nexus-api    │         │ nexus-worker   │        │  nexus-relay    │
      │  (HPA 3–20)   │         │  (HPA 2–15)    │        │   (2 réplicas)  │
      │  leitura +    │         │ cumprimento de │        │ outbox → Kafka  │
      │  aceite       │         │ ordem, saga    │        │ (CDC/polling)   │
      └───────┬───────┘         └───────┬────────┘        └────────┬────────┘
              │        OPENSHIFT        │                          │
    ┌─────────┼─────────────────────────┼──────────────────────────┼────────┐
    ▼         ▼                         ▼                          ▼        │
┌────────┐ ┌──────────────┐      ┌──────────────┐          ┌──────────────┐ │
│ REDIS  │ │   ORACLE     │      │    KAFKA     │◀─────────┤ Schema Reg.  │ │
│ cache  │ │ 21c/23ai RAC │      │ eventos TMF  │          └──────────────┘ │
│ lock   │ │ + Data Guard │      │ 688 · ordens │                           │
│ quota  │ │ + Spatial    │      └──────────────┘                           │
└────────┘ │ + Prop.Graph │                                                 │
           └──────────────┘                                                 │
```

**Três deployments, não um.** Separar API, worker e relay é o que permite escalar leitura interativa
sem competir com o cumprimento de 3M ordens/mês (padrão *bulkhead*).

---

## 3. Camadas da aplicação

A separação atual do código já está correta e **deve ser preservada**:

| Camada | Onde | Responsabilidade |
|---|---|---|
| Domínio | `modules/*/domain.ts` | Tipos e regras TMF. Sem I/O. |
| Porta | `modules/*/*-repository-interface.ts` | Contrato de persistência |
| Adaptador | `modules/*/oracle-repository.ts` | SQL Oracle (hoje `postgres-repository.ts`) |
| Serviço | `modules/*/service.ts` | Casos de uso, orquestração, eventos |
| Transporte | `shared/http` | HTTP, TMF Open APIs |

Trocar Postgres por Oracle é **substituir o adaptador**. O domínio não muda. Essa é a dívida que a
arquitetura hexagonal já pagou adiantado.

---

## 4. Modelo de concorrência — a mudança que destrava tudo

### 4.1 O problema

`PostgresSyncBridge` roda `Atomics.wait()` na thread principal a cada query, **bloqueando o event
loop do Node inteiro**. As 5 interfaces `I*Repository` são síncronas — **zero `Promise`**. O bridge
existe justamente para fazer um driver assíncrono parecer síncrono.

Consequência: **uma requisição por vez, por processo**. Medido: 9 s isolado; 9 s + 18 s em duas
chamadas concorrentes. Para 500 usuários simultâneos, é inviável por construção.

### 4.2 A correção

```text
ANTES   handler → service → repository.get()  ──▶ Atomics.wait  ◀── event loop CONGELADO
DEPOIS  handler → await service → await repository.get()  ──▶ pool oracledb ◀── event loop LIVRE
```

1. **Tornar as portas assíncronas.** `getLocation(id): GeographicLocation | undefined` vira
   `getLocation(id): Promise<GeographicLocation | undefined>`. Propaga por serviço e handler.
2. **Adotar `node-oracledb` com pool** (Thin mode; Thick só se precisar de recurso avançado).
   `oracledb.createPool({ poolMin, poolMax, poolIncrement, queueTimeout })`.
3. **Eliminar o bridge e o worker thread.** Deixam de ter propósito.
4. **`transaction<T>(fn: () => T): T`** vira `transaction<T>(fn: (conn) => Promise<T>): Promise<T>`,
   com a conexão explícita para garantir que tudo na transação usa a mesma sessão.

> Esta é a **pré-condição** de todo o resto. Sem ela, HPA multiplica pods sem multiplicar vazão.

### 4.3 Dimensionamento do pool

| Parâmetro | Valor sugerido | Racional |
|---|---|---|
| `poolMin` por pod | 2 | Evita cold start de conexão |
| `poolMax` por pod | 10 | 20 pods × 10 = 200 sessões |
| Teto global | ~300 sessões | Deve caber no `sessions`/`processes` do Oracle |
| `queueTimeout` | 2 s | Falha rápido em vez de enfileirar indefinidamente |

---

## 5. Persistência — Oracle

Detalhe de particionamento, índices e paginação em [`data-model.md`](data-model.md). Decisões
arquiteturais:

| Decisão | Escolha |
|---|---|
| Alta disponibilidade | **RAC** para falha de nó + **Data Guard** para desastre |
| Leitura analítica | **Active Data Guard** como réplica de leitura para relatórios e cargas |
| Geoespacial | **Oracle Spatial (`SDO_GEOMETRY`) com SRID geodésico** — SIRGAS 2000 (4674). Cobertura continental exige cálculo sobre o elipsoide; ver [`data-model.md`](data-model.md) §4 |
| Path computation | **Oracle Property Graph** para a travessia porta OLT → ONT (C10) |
| Identidade | **UUID v7 em `RAW(16)`** — ordenável no tempo, evita fragmentação de índice (C5; hoje o código usa v4) |

> ⚠️ Guardar geometria como texto JSON é o maior gargalo latente do módulo Geo. Os 22M de HPs cobrem
> todo o território brasileiro (~39° de latitude e longitude, 8 zonas UTM, cruzando o Equador), então
> o problema não é só de volume: o filtro por *bounding box* em graus usado hoje é **planar**, e 1° de
> longitude vale ~111 km no Amapá contra ~93 km no Rio Grande do Sul. Viabilidade por raio métrico
> exige SRID geodésico e índice R-tree. Detalhamento em [`data-model.md`](data-model.md) §4.

---

## 6. Cache — Redis

| Uso | Chave | TTL | Invalidação |
|---|---|---|---|
| **Catálogo** (Resource/Service/Site Specification) | `cat:{tipo}:{id}` | 1 h | Evento TMF688 de catálogo |
| **Viabilidade** | `viab:{addressId}:{specId}` | 15 min | Evento de mudança de recurso no CTO |
| **Árvore Geo** (nós por pai) | `geo:tree:{parentId}` | 10 min | Evento de site |
| **JWKS do Apigee** | `jwks:{kid}` | 12 h | Rotação de chave |
| **Quota / rate limit** | `rl:{tenant}:{janela}` | janela | — |

**Padrão:** *cache-aside* com *stampede protection* (lock curto na chave em miss). O catálogo é
pequeno, quente e muda pouco — é onde o ganho é maior. Alvo: ≥80% de hit em catálogo, ≥60% em
viabilidade (5M consultas/mês têm forte repetição por endereço).

> ❗ **Redis não é usado para designação.** Ver §8.

---

## 7. Mensageria — Kafka

### 7.1 Outbox transacional (C7)

```text
┌── transação Oracle ──────────────────────┐
│  UPDATE service SET state='active' ...   │
│  INSERT INTO outbox (id, topic, payload) │   ← mesma transação
└──────────────────────────────────────────┘
                    │
          nexus-relay (CDC ou polling)
                    ▼
              KAFKA (TMF688)
```

Garante que **não existe "mudou mas não avisou"** nem o inverso. O relay é o único componente que
publica; a aplicação nunca fala com o Kafka na transação.

**Implementação:** GoldenGate/Debezium sobre Oracle (CDC) ou relay por polling com `FOR UPDATE SKIP
LOCKED` na outbox. O polling é mais simples e suficiente para o volume; CDC evita a latência do
intervalo.

### 7.2 Tópicos

| Tópico | Produtor | Consumidor | Chave de partição |
|---|---|---|---|
| `nexus.geo.site.v1` | relay | Analytics, cache invalidation | `siteId` |
| `nexus.resource.v1` | relay | Cache, path recompute | `resourceId` |
| `nexus.service.v1` | relay | Billing, Analytics | `serviceId` |
| `nexus.order.command.v1` | nexus-api | nexus-worker | `orderId` |
| `nexus.order.event.v1` | relay | Portal do ISP, Analytics | `orderId` |
| `*.dlq` | consumidores | Operação | — |

**Chave de partição = id da entidade** garante ordenação por entidade, que é o que importa (dois
eventos do mesmo serviço nunca se invertem).

**Idempotência:** todo evento carrega UUID v7; consumidores deduplicam por ele. Schema versionado em
Schema Registry, evolução apenas compatível para trás.

### 7.3 Ordens como saga

3M ordens/mês não cabem em requisição síncrona. O fluxo:

```text
POST /serviceOrder ──▶ valida ──▶ grava (state=acknowledged) + outbox ──▶ 202 Accepted
                                                │
                                          nexus.order.command
                                                ▼
                                  nexus-worker: designar → provisionar → ativar
                                                ▼
                                    state=completed | failed  ──▶ evento
```

Cada passo é idempotente e recuperável. Falha vai para DLQ com o estado preservado, nunca perde a
ordem.

---

## 8. Designação de recurso — o ponto de contenção

Designar é alocar recurso **escasso** (porta de splitter, fibra) sob concorrência. Com 3M ordens/mês
haverá disputa pela mesma porta, e alocar a mesma porta duas vezes é falha de campo.

**Padrão obrigatório — alocação atômica no banco:**

```sql
SELECT id FROM physical_resource
 WHERE parent_id = :cto_id
   AND resource_type = 'Port'
   AND usage_state = 'idle'
   AND ROWNUM = 1
 FOR UPDATE SKIP LOCKED;      -- concorrentes pulam a linha travada
```

`FOR UPDATE SKIP LOCKED` é a construção correta: transacional, sem deadlock e sem espera. Dois
pedidos simultâneos recebem **portas diferentes**, não erro.

> ❌ **Não usar lock distribuído em Redis para isso.** Lock em cache não participa da transação do
> banco; expiração de TTL sob GC pause ou partição de rede libera o lock com a transação ainda viva,
> e duas ordens designam a mesma porta. Redis serve para *coordenação best-effort*, não para
> alocação de recurso escasso.

---

## 9. API Gateway — Apigee

| Política | Função |
|---|---|
| **OAuth2 / JWT** | Valida token; injeta `tenantId`, `sub` e papéis como claims |
| **Quota por API Product** | Limite por ISP contratante |
| **Spike Arrest** | Protege o backend de rajada |
| **mTLS** | Apigee → OpenShift |
| **Correlation ID** | Gera/propaga `traceId` para o tracing distribuído |

O Apigee é onde a **identidade entra no sistema**. O backend confia no claim `tenantId` e o aplica
como filtro obrigatório — ver [`security.md`](security.md).

---

## 10. OpenShift

| Aspecto | Definição |
|---|---|
| Deployments | `nexus-api`, `nexus-worker`, `nexus-relay` |
| HPA | `nexus-api` por RPS e CPU (3–20); `nexus-worker` por lag do consumer group (2–15) |
| Probes | `/health` como readiness e liveness (já existe e é público) |
| Config | ConfigMap + Secret (substitui `.env`) |
| PDB | `minAvailable: 2` para sobreviver a drain de nó |
| Recursos | Requests/limits explícitos; sem limite de CPU no worker para não sofrer throttling |

---

## 11. Migração a partir do laboratório

| # | Etapa | Depende de |
|---|---|---|
| 1 | **Tornar portas e serviços assíncronos** | — |
| 2 | Adaptador Oracle (`oracle-repository.ts`) + pool | 1 |
| 3 | Geometria para `SDO_GEOMETRY` + índice espacial | 2 |
| 4 | Particionamento e paginação por cursor | 2 |
| 5 | Redis (cache-aside de catálogo e viabilidade) | 2 |
| 6 | Outbox + relay + Kafka | 2 |
| 7 | Ordens como saga no `nexus-worker` | 6 |
| 8 | Apigee + identidade por tenant | — (paralelo) |
| 9 | UUID v7 e `_origin` (C5) | 2 |

A etapa 1 não depende de nada e destrava todas as outras — é por onde começar.

---

## 12. Referências

| Onde | O quê |
|---|---|
| [`non-functional-requirements.md`](non-functional-requirements.md) | Alvos que esta arquitetura sustenta |
| [`data-model.md`](data-model.md) | Particionamento, índices, paginação |
| [`security.md`](security.md) | Identidade, RBAC, isolamento de tenant |
| [`integrations.md`](integrations.md) | Netwin, dual-running, contratos de evento |
| [`../1-overview/business-rules.md`](../1-overview/business-rules.md) | Cânone C1–C10 |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
