# Requisitos Não Funcionais

> Alvos quantificados do V.tal Nexus. Este documento é o **critério de aceite** dos demais
> documentos de system design: arquitetura, modelo de dados, segurança e integrações existem para
> sustentar os números abaixo.

---

## 1. Volumetria de referência

| Grandeza | Volume | Observação |
|---|---|---|
| Home Passed (HP) | **22.000.000** | `GeographicAddress` — C4: não vira Service |
| Home Connected (HC) | **4.000.000** | `CustomerFacingService` ativo |
| Consultas de viabilidade | **5.000.000/mês** | TMF645, interativa |
| Ordens de serviço | **3.000.000/mês** | Instalação, retirada, reparo — com designação |
| Usuários simultâneos | **500+** | Operação interna + portais de ISP |

**Crescimento assumido:** 20% ao ano em HP/HC; ordens crescem com a base de HC.

---

## 2. Carga derivada

Premissa: 80% do volume concentrado em 10 horas úteis; pico horário = 3× a média.

| Fluxo | Média | Pico |
|---|---|---|
| Ordens de serviço | ~2,2 req/s | ~7 req/s |
| Viabilidade | ~3,7 req/s | ~11 req/s |
| Navegação (500 usuários, think time 10s) | ~50 req/s | ~100 req/s |
| **Total da plataforma** | **~56 req/s** | **~120 req/s** |

> **Alvo de dimensionamento: 150 req/s sustentados**, com headroom de 2× para picos sazonais
> (campanhas comerciais, mutirões de reparo pós-evento climático).

**Retenção de ordens:** 3M/mês × 12 = **36M ordens/ano**. Sem política de partição e arquivamento, a
tabela de ordens ultrapassa 100M de linhas em 3 anos.

---

## 3. Latência

Medida no API Gateway (Apigee), percentil sobre janela de 5 minutos.

| Operação | p50 | p95 | p99 | Timeout |
|---|---|---|---|---|
| Leitura pontual (`GET` por id) | 50 ms | **200 ms** | 500 ms | 2 s |
| Listagem paginada | 120 ms | **500 ms** | 1 s | 5 s |
| Viabilidade (TMF645) | 200 ms | **1 s** | 2 s | 5 s |
| Aceite de ordem (TMF641/652) | 150 ms | **500 ms** | 1 s | 5 s |
| Designação de recurso | 300 ms | **1 s** | 2 s | 5 s |
| Busca textual / árvore Geo | 200 ms | **800 ms** | 1,5 s | 5 s |

**Assíncrono:** o aceite da ordem é síncrono (retorna `acknowledged`); o cumprimento é assíncrono via
Kafka. Alvo de conclusão de ordem simples: **p95 < 60 s** da aceitação ao estado `completed`.

---

## 4. Disponibilidade e continuidade

| Métrica | Alvo | Implicação |
|---|---|---|
| Disponibilidade (leitura) | **99,9%** | ≤ 8h45 de indisponibilidade/ano |
| Disponibilidade (escrita) | **99,5%** | Janela de manutenção Oracle |
| **RPO** | **≤ 5 min** | Oracle Data Guard |
| **RTO** | **≤ 30 min** | Failover orquestrado |
| Degradação graciosa | Obrigatória | Viabilidade responde de cache se o banco degradar |

**Janela de manutenção:** domingos, 02h–05h (BRT). Operações de partição e reorganização de índice
devem usar `ONLINE` para não exigir janela.

---

## 5. Escalabilidade

| Dimensão | Requisito |
|---|---|
| Escala horizontal | Pods stateless em OpenShift, HPA por RPS e CPU |
| Concorrência por pod | **Mínimo 50 requisições em voo** — ver §6 |
| Conexões Oracle | Pool por pod, teto global respeitando `sessions` do banco |
| Particionamento | Obrigatório em `geographic_address`, `service` e `service_order` |
| Cache hit ratio | **≥ 80%** em catálogo; **≥ 60%** em viabilidade |

---

## 6. Restrição arquitetural crítica — concorrência

> 🔴 **O desenho atual não atende a nenhum dos alvos acima.**

`PostgresSyncBridge` executa `Atomics.wait()` na thread principal a cada consulta
(`src/shared/persistence/postgres-sync-bridge.ts`), **bloqueando o event loop do Node** durante toda
a query. As 5 interfaces de repositório (`I*Repository`) são **inteiramente síncronas** — nenhuma
retorna `Promise`. Isso serializa o processo: uma requisição por vez, sem paralelismo.

Medição real: `GET /v1/resource/workspace` leva ~9 s isolado; duas chamadas concorrentes levam 9 s e
18 s.

**Requisito derivado, pré-condição para tudo:** as interfaces de repositório e a camada de serviço
devem ser convertidas para **assíncronas** (`Promise`), permitindo I/O não bloqueante e pool de
conexões Oracle. Sem isso, adicionar pods multiplica custo sem multiplicar vazão útil.

---

## 7. Observabilidade

Hoje existem apenas logs estruturados. Alvo:

| Sinal | Ferramenta | Requisito |
|---|---|---|
| **Métricas** | Prometheus (OpenShift) | RED por endpoint: Rate, Errors, Duration |
| **Tracing** | OpenTelemetry | Trace distribuído Apigee → pod → Oracle/Kafka |
| **Logs** | JSON estruturado | Correlação por `traceId` e `tenantId` |
| **Alertas** | Alertmanager | Disparo por violação de SLO, não por limiar bruto |

**Métricas de negócio obrigatórias:** taxa de viabilidade aprovada/negada, fila de ordens por estado,
idade da mensagem mais antiga no Kafka, ocupação de portas por CTO.

---

## 8. Resiliência

| Padrão | Onde se aplica |
|---|---|
| **Idempotência** | Toda escrita aceita `Idempotency-Key`; eventos deduplicados por UUID v7 |
| **Circuit breaker** | Chamadas a sistemas externos (Netwin, provisionamento) |
| **Retry com backoff** | Consumidores Kafka; nunca em escrita síncrona sem idempotência |
| **Dead letter queue** | Toda tópica de ordem |
| **Bulkhead** | Pools separados para leitura interativa e processamento em lote |
| **Timeout** | Todo I/O tem timeout explícito (ver §3) |

---

## 9. Qualidade e entrega

- `lint`, `typecheck`, `build` e `test` verdes são condição de merge (CI já roda nessa ordem).
- Cobertura mínima de 70% nas camadas de domínio e serviço.
- Migrações de schema versionadas e reversíveis; nenhuma migração destrutiva sem janela.
- Teste de carga contra os alvos da §2 antes de cada release maior.

---

## 10. Referências

| Onde | O quê |
|---|---|
| [`architecture.md`](architecture.md) | Como a arquitetura sustenta estes números |
| [`data-model.md`](data-model.md) | Particionamento e indexação para a volumetria da §1 |
| [`security.md`](security.md) | Identidade, RBAC e isolamento multi-tenant |
| [`../1-overview/business-rules.md`](../1-overview/business-rules.md) | Cânone C1–C10 |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
