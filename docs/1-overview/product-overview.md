# Visão Geral do Produto

> Ponto de entrada da documentação do V.tal Nexus. Descreve o propósito, a organização do domínio, o
> estado real dos módulos e o roadmap. Decisões arquiteturais com racional ficam em
> [`business-rules.md`](business-rules.md); termos, em [`glossary.md`](glossary.md); a tese de
> posicionamento como plataforma multi-vertical, em [`platform-strategy.md`](platform-strategy.md).

---

## 1. O que é o Nexus

O **V.tal Nexus** é o inventário de rede proprietário da V.tal, alinhado ao **TM Forum ODA**. Ele
responde, de forma auditável e em escala nacional, a três perguntas sobre a planta:

> **Onde** está? · **O que** existe? · **Para quem** serve?

O Nexus substitui o **Netwin** (Altice Labs) como sistema primário de inventário, consolidando em um
único modelo canônico o que hoje está espalhado entre legado, planilhas e bases departamentais.

**O problema que resolve.** Sem inventário confiável, não há viabilidade confiável: a operação não
sabe dizer se um endereço pode ser atendido, qual porta está livre, ou o que quebra quando um cabo
rompe. Cada resposta errada vira visita técnica perdida, venda não entregue ou SLA estourado.

---

## 2. A premissa de negócio: fibra neutra

A V.tal é uma **infraestrutura de fibra neutra (wholesale)**. O cliente que contrata é, em regra, um
**ISP (Tenant)** — não o usuário final.

Isso não é detalhe comercial: **molda todo o domínio de serviço**. O `subscriber` de um serviço é por
padrão um ISP, o multi-tenant é premissa desde a criação de qualquer entidade, e o atendimento direto
ao consumidor é a exceção que precisa ser declarada. Ver **C8** em [`business-rules.md`](business-rules.md).

---

## 3. A tríade

A decisão estruturante do Nexus é separar o inventário em três camadas que nunca se misturam:

| Pergunta             | Camada     | Entidades                         | Open APIs      |
| -------------------- | ---------- | --------------------------------- | -------------- |
| **Onde?**            | Geographic | Site, Sub-Site, Address, Location | TMF673/674/675 |
| **O quê?**           | Resource   | PhysicalResource, LogicalResource | TMF634/639     |
| **Para quê / quem?** | Service    | CFS, RFS, SubscriberID            | TMF633/638     |

**Referência, nunca contenção:** um serviço _referencia_ recurso via `supportingResource`; um recurso
_referencia_ geografia via `place`. Nenhum contém o outro.

---

## 4. Módulos e estado real

| #   | Módulo                    | Responde                                | Open APIs              | Estado                                                                                                                                                   |
| --- | ------------------------- | --------------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Geographic**            | Onde                                    | TMF673, TMF674, TMF675 | ⚠️ Base implementada; aderência parcial ao HLD 1.22 (inclui Cobertura GPON por bairro e consulta inversa por Resource, Projetos de Trabalho com Resources e o Painel Unificado de Local) |
| 2   | **Resource**              | O que existe                            | TMF634, TMF639, TMF664 | ⚠️ Base implementada; aderência parcial ao HLD 1.9 (inclui detalhe agregado, Audit Trail, catálogo de estados granulares de PhysicalResource, estruturação relacional de especificações e materialização de portas de splitter no piloto Niterói/Icaraí)             |
| 3   | **Service**               | Para quê / quem                         | TMF633, TMF638         | ⚠️ Base implementada; aderência parcial ao HLD 1.2                                                                                                       |
| 4   | **Order & Fulfillment**   | Viabilidade e provisionamento           | TMF641, TMF645, TMF652 | ✅ Implementado                                                                                                                                          |
| 5   | **Process Orchestration** | Fluxo de processo                       | TMF701                 | 📐 Previsto                                                                                                                                              |
| 6   | **Party & Tenant**        | Quem é quem                             | TMF632, TMF669         | ✅ Implementado                                                                                                                                          |
| 7   | **Analytics & Events**    | Eventos e documentos                    | TMF688, TMF724         | ⚠️ TMF688 ativo; TMF724 previsto                                                                                                                         |
| —   | **Search / Copilot**      | Consulta em linguagem natural           | —                      | ✅ Implementado                                                                                                                                          |
| —   | **MCP**                   | Exposição das APIs TMF a clientes de IA | —                      | ✅ Implementado                                                                                                                                          |

Legenda: ✅ contrato entregue · ⚠️ base executável com gaps rastreados · 📐 previsto no design.

As matrizes `2.3 Aderência ao codebase atual` dos três HLDs são a fonte detalhada por requisito. Elas distinguem maturidade da especificação, cobertura real em código/teste e o backlog de lacunas, rastreado como issues no GitHub (label `tipo:lacuna`).

---

## 5. Superfície de API

| Prefixo      | Conteúdo                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `/health`    | Health check público                                                                                                            |
| `/v1/*`      | API interna: `geo`, `resource/workspace`, `service/workspace`, `research`, `searches`, `users`, `bootstrap`, `chat/completions` |
| `/tmf-api/*` | 14 Open APIs TM Forum v4                                                                                                        |

Autenticação por bearer token em tudo exceto `/health`. Detalhe operacional no [`README.md`](../../README.md).

---

## 6. Aplicação web

Frontend React + Vite, com navegação lateral persistente:

| Item                              | Conteúdo                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| **Nova Conversa** / **Conversas** | Nexus Copilot — consulta ao inventário em linguagem natural |
| **Locais**                        | Módulo Geo: árvore de hierarquia, mapa e detalhe de sites   |
| **Recursos**                      | Inventário físico e lógico, com catálogo de especificações  |
| **Serviços**                      | CFS/RFS e suas amarrações                                   |
| **Ordens**                        | Viabilidade e ordens de serviço/recurso                     |

O módulo Geo preserva a semântica TMF673/674/675 na interface: o Site **referencia** Address e
Location, não os embute.

---

## 7. Stack atual

| Camada   | Tecnologia                                                                                  |
| -------- | ------------------------------------------------------------------------------------------- |
| Backend  | Node 22+ · TypeScript (ESM) · HTTP nativo                                                   |
| Frontend | React 18 · Vite · Tailwind                                                                  |
| Banco    | **PostgreSQL** (laboratório hospedado em Neon) e **Oracle** — dual, via `DATABASE_PROVIDER` |
| Deploy   | Vercel (Functions + estático)                                                               |

> ⚠️ O cânone **C10** define Oracle como alvo corporativo homologado, com suporte nativo permanente a
> PostgreSQL — não um modo transitório. Só a hospedagem em Vercel/Neon é laboratório.

---

## 8. Cenários validados

Um modelo só está pronto quando sustenta um cenário operacional real. Os cenários abaixo já foram
exercitados contra o modelo canônico.

### 8.1 Home Passed → Home Connected → ONT → Serviço

O cenário que atravessa as três camadas e demonstra por que **Home Passed não é Service** (C4):

```text
1. HOME PASSED  ──────────────────────────────── Módulo 1 (Geographic)
   A fibra passa em frente ao endereço.
   → GeographicAddress + GeographicLocation
   → ~22 milhões de registros
   → NÃO existe Service nenhum ainda

2. VIABILIDADE  ──────────────────────────────── Módulo 4 (Order)
   O ISP consulta se o endereço pode ser atendido.
   → TMF645 Service Qualification
   → Verifica porta livre no splitter/CTO que cobre o endereço
   → Continua sem criar Service

3. HOME CONNECTED  ───────────────────────────── Módulos 2 + 3
   O cliente do ISP contrata. A instalação acontece.
   → ONT instalada          = PhysicalResource   (Módulo 2)
     · place → GeographicAddress do passo 1
     · categoria Equipment.CustomerPremises
   → Porta do splitter      = PhysicalResource ocupado
   → RFS "Acesso GPON"      = ResourceFacingService (Módulo 3)
     · supportingResource → ONT + porta + cabo
   → CFS "Banda Larga"      = CustomerFacingService (Módulo 3)
     · subscriber → Tenant ISP  (não o morador!)
     · supportingService → RFS
```

**O que o cenário prova:**

- Os ~22M de HPs vivem em Geographic e **não** inflam o inventário de serviço (C4).
- A ONT referencia o endereço por `place`; não o duplica (tríade).
- O CFS chega ao recurso **apenas** através do RFS — nunca direto (C3).
- O `subscriber` do CFS é o ISP, não o morador (C8).

### 8.2 Demais cenários

| Cenário                                                                                                          | Onde está detalhado                                                          |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Central Office GPON — OLT→Placa→Porta→DIO→Cabo→Splitter→CTO→ONT                                                  | [`02-module-resource.md`](../2-functional-specs/02-module-resource.md) §34.2 |
| Cliente corporativo em condomínio empresarial (VRF + CPE + porta)                                                | [`02-module-resource.md`](../2-functional-specs/02-module-resource.md) §34.1 |
| Banda larga residencial via ISP (wholesale Bitstream)                                                            | [`03-module-service.md`](../2-functional-specs/03-module-service.md) §22.1   |
| Link dedicado multiponto L3VPN (CFS→RFS acesso+transporte+backbone)                                              | [`03-module-service.md`](../2-functional-specs/03-module-service.md) §22.2   |
| CloudVoIP sobre link empresarial (`serviceRelationship dependsOn`)                                               | [`03-module-service.md`](../2-functional-specs/03-module-service.md) §22.3   |
| Infraestrutura subterrânea — caixa → banco de dutos → duto → cabo, com trecho derivado e sem entidade artificial | [`02-module-resource.md`](../2-functional-specs/02-module-resource.md) §31.8 |

---

## 9. Roadmap

| Fase                            | Objetivo                                                                                 | Estado                          |
| ------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------- |
| **Fundação**                    | Bootstrap, config, persistência, auth, logging, CI                                       | ✅ Concluída                    |
| **Tríade — base**               | Geographic, Resource e Service com Open APIs TMF                                         | ✅ Concluída                    |
| **Tríade — aderência aos HLDs** | Fechar gaps dos 57 requisitos e decisões pendentes                                       | ⚠️ Em andamento (GitHub Issues) |
| **Order & Party**               | Viabilidade, ordens e multi-tenant                                                       | ✅ Concluída                    |
| **Carga de dados**              | Estações e recursos reais do Netwin                                                      | ⚠️ Em andamento                 |
| **Convergência ao cânone**      | UUID v7, `_origin`, outbox TMF688                                                        | 📐 Pendente                     |
| **Escala**                      | Otimizações Oracle-native (`RAW(16)`, Spatial), benchmark de path computation em 22M HPs | 📐 Pendente                     |

O descompasso entre cânone e implementação está consolidado em
[`business-rules.md`](business-rules.md#resumo-do-descompasso-cânone--código).

---

## 10. Referências

| Onde                                               | O quê                                                      |
| -------------------------------------------------- | ---------------------------------------------------------- |
| [`business-rules.md`](business-rules.md)           | Decisões C1–C10 com racional e status no código            |
| [`glossary.md`](glossary.md)                       | Termos, acrônimos e vocabulário do código                  |
| [`platform-strategy.md`](platform-strategy.md)     | Tese de posicionamento como plataforma SaaS multi-vertical |
| [`../2-functional-specs/`](../2-functional-specs/) | HLDs por módulo                                            |
| [`../3-system-design/`](../3-system-design/)       | Arquitetura, modelo de dados, integrações, NFR, segurança  |
| [`../5-delivery-plan/`](../5-delivery-plan/)       | Roadmap detalhado, backlog e riscos                        |
| [`AGENTS.md`](../../AGENTS.md)                     | Convenções para agentes de IA                              |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
