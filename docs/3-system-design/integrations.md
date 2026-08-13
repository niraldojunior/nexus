# Integrações

> Contratos de entrada e saída do V.tal Nexus. Arquitetura de mensageria em
> [`architecture.md`](architecture.md) §7; identidade e confiança em [`security.md`](security.md).

---

## 1. Princípios de integração

| #      | Princípio                                                                                                         |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| **I1** | **Anti-corruption layer.** Modelo externo nunca entra no domínio. Todo legado é traduzido para TMF na borda (C1). |
| **I2** | **Identidade própria.** ID externo vive em `_origin`, nunca como chave (C5).                                      |
| **I3** | **Idempotência sempre.** Toda operação de entrada aceita `Idempotency-Key`; reprocessar não duplica.              |
| **I4** | **Assíncrono por padrão.** Integração síncrona só quando o usuário espera a resposta.                             |
| **I5** | **Falha isolada.** Circuit breaker por integração; indisponibilidade externa degrada, não derruba.                |

---

## 2. Mapa de integrações

```text
              ┌──────────── ENTRADA ────────────┐
   Netwin ───▶│ carga inicial + CDC (dual-run)  │
   ISP    ───▶│ TMF641/645/652 via Apigee       │──▶ NEXUS
   Campo  ───▶│ atualização de ordem            │      │
              └─────────────────────────────────┘      │
                                                       ▼
              ┌──────────── SAÍDA ──────────────┐  ┌────────┐
              │ Kafka: eventos TMF688           │◀─┤ outbox │
              │ Provisionamento: ativação       │  └────────┘
              │ Analytics / Data Lake           │
              └─────────────────────────────────┘
```

---

## 3. Legados — as fontes da carga inicial

A carga inicial **não vem de uma fonte só**. São três sistemas legados distintos, e a extração é
**direta na base de cada um** — não por API:

| Legado             | O que traz                                                                      |
| ------------------ | ------------------------------------------------------------------------------- |
| **Netwin**         | Inventário de planta e **áreas de cobertura** (recorte de planejamento de rede) |
| **Geosite Legado** | Base de endereços e localizações                                                |
| **Network Core**   | Inventário de rede core                                                         |

> 📌 O modelo de dados dos três será compartilhado para desenhar a migração. Até lá, o mapeamento
> para TMF permanece em aberto (`Q-INT-005`).

Cada um exige seu próprio **anti-corruption layer** (I1) e sua tradução para o modelo canônico. O
`_origin` (C5) identifica a procedência de cada registro — `_origin.system` distingue `netwin`,
`geosite-legado` e `network-core`, o que é o que torna a reconciliação possível depois.

### 3.1 Netwin — o legado a substituir

O Netwin é a fonte de verdade **até o cutover**.

#### Fases

| Fase                 | Direção        | Mecanismo                                                              |
| -------------------- | -------------- | ---------------------------------------------------------------------- |
| **1. Carga inicial** | Netwin → Nexus | Extração em lote, ETL para modelo TMF, `_origin` preenchido            |
| **2. Dual-running**  | Netwin → Nexus | CDC (GoldenGate) ou extração incremental; Netwin continua autoritativo |
| **3. Reversa**       | Nexus → Netwin | Nexus vira autoritativo; legado recebe atualização até desligar        |
| **4. Cutover**       | —              | Netwin desligado                                                       |

### 3.2 Rastreabilidade — `_origin` (C5)

Todo registro migrado carrega o grupo `_origin` como `characteristic` somente-leitura:

```json
{
  "name": "_origin.system",
  "value": "netwin",
  "name": "_origin.id",
  "value": "EST-004521",
  "name": "_origin.entity",
  "value": "ESTACAO",
  "name": "_origin.migratedAt",
  "value": "2026-07-31T02:14:00Z",
  "name": "_origin.migratedBy",
  "value": "carga-estacoes-v3"
}
```

Isso permite **reconciliar** Nexus e Netwin durante o dual-running sem acoplar as chaves.

> 📐 `_origin` está definido no cânone mas **ainda não existe no código**. É pré-requisito da fase 1.

### 3.3 Lições da carga de laboratório

Cargas reais já executadas (estações e recursos) expuseram armadilhas que a integração definitiva
precisa tratar:

| Armadilha                                       | Tratamento                                                                   |
| ----------------------------------------------- | ---------------------------------------------------------------------------- |
| CSV em **Latin-1**, não UTF-8                   | Declarar encoding na extração; validar mojibake                              |
| Coordenadas corrompidas ou fora do território   | Validar por caixa delimitadora da UF; rejeitar, não corrigir silenciosamente |
| Ausência de hierarquia (estação sem região pai) | Resolver na ETL ou marcar para curadoria                                     |
| Reexecução duplicando registro                  | Idempotência por chave natural + `_origin.id`                                |

---

## 4. Kafka — contratos de saída

Fonte única: o **outbox** (C7). A aplicação nunca publica direto.

| Tópico                 | Evento                                            | Consumidor típico               |
| ---------------------- | ------------------------------------------------- | ------------------------------- |
| `nexus.geo.site.v1`    | `GeographicSiteCreateEvent`, `...ChangeEvent`     | Analytics, invalidação de cache |
| `nexus.resource.v1`    | `ResourceCreateEvent`, `ResourceStateChangeEvent` | Recomputo de caminho, cache     |
| `nexus.service.v1`     | `ServiceCreateEvent`, `ServiceStateChangeEvent`   | Billing, Analytics              |
| `nexus.order.event.v1` | `ServiceOrderStateChangeEvent`                    | Portal do ISP                   |
| `nexus.audit.v1`       | Trilha de auditoria                               | SIEM, compliance                |

**Contrato:**

- Envelope TMF688 (`eventId`, `eventTime`, `eventType`, `correlationId`, `event`).
- `eventId` é **UUID v7** — consumidores deduplicam por ele (I3).
- Chave de partição = id da entidade, garantindo ordem por entidade.
- Schema versionado em **Schema Registry**; evolução apenas compatível para trás.
- Versão no nome do tópico (`.v1`); quebra de contrato cria `.v2` com convivência.

---

## 5. ISPs — entrada via Apigee

Consumo externo é exclusivamente pelas Open APIs TMF, publicadas como **API Product** no Apigee.

| API                              | Uso pelo ISP                               |
| -------------------------------- | ------------------------------------------ |
| **TMF645** Service Qualification | Consultar viabilidade em endereço (5M/mês) |
| **TMF641** Service Ordering      | Solicitar instalação, alteração, retirada  |
| **TMF652** Resource Order        | Pedido de recurso                          |
| **TMF638** Service Inventory     | Consultar a própria base instalada         |
| **TMF673/674** Geographic        | Consultar endereço e site                  |

Cada ISP recebe credencial própria, quota dedicada e `tenant_id` resolvido no Apigee — o isolamento é
imposto conforme [`security.md`](security.md) §4.

### 5.1 Viabilidade — foto diária e notificação de mudança

A viabilidade **não é só consulta sob demanda**. O requisito é manter uma visão sempre atual dos 22M
de HPs e avisar quem consome quando algo muda:

| Entrega                   | Descrição                                                                         |
| ------------------------- | --------------------------------------------------------------------------------- |
| **Base "última foto"**    | Tabela materializada com o estado de viabilidade **de cada um dos 22M endereços** |
| **Revisão diária**        | Job que reprocessa a viabilidade e reconcilia a foto                              |
| **Evento de divergência** | Endereço que passou a ser viável (ou deixou de ser) publica em tópico Kafka       |

```text
  mudança de planta (porta ocupada/liberada, CTO nova, cabo rompido)
                        │
                        ▼
        ┌───────────────────────────────┐
        │  recálculo INCREMENTAL         │  ← reage ao evento, poucos endereços
        └───────────────┬───────────────┘
                        │            ┌──────────────────────────────┐
                        │            │ revisão DIÁRIA (reconcilia)  │
                        │            └───────────────┬──────────────┘
                        ▼                            ▼
              ┌──────────────────────────────────────────┐
              │  base "última foto" — 22M endereços       │
              └───────────────────┬──────────────────────┘
                                  │ delta (viável ↔ inviável)
                                  ▼
                    nexus.viability.change.v1  ──▶ ISPs, BSS, Analytics
```

**Inverta o cálculo.** Recalcular endereço por endereço são 22M consultas espaciais por dia. O
caminho eficiente é iterar pelos **elementos que servem** — CTOs, splitters, estações: são centenas
de milhares, não dezenas de milhões. Para cada um, um _spatial join_ resolve todos os endereços na
sua área de cobertura de uma vez, e a disponibilidade de porta é verificada por elemento.

**Consequência para a consulta interativa:** com a foto materializada, a viabilidade sob demanda vira
**leitura pontual indexada** — não cálculo espacial ao vivo. Isso coloca o p95 bem abaixo do 1 s
fixado em [`non-functional-requirements.md`](non-functional-requirements.md) §3 e absorve os 5M de
consultas/mês sem esforço.

O evento de divergência substitui o _polling_: o ISP não precisa varrer a carteira, ele assina o
tópico e recebe só o que mudou.

---

## 6. Provisionamento e ativação — SIS

O Nexus **designa e registra**; ele não configura elemento de rede. A ativação é delegada ao **SIS**,
sistema de aprovisionamento da V.tal.

> **Premissa.** O SIS **já abstrai** os comandos das gerências de rede, do AAA e das plataformas IMS.
> O Nexus integra com **um único ponto**, não com cada gerência ou fabricante.

```text
nexus-worker ──▶ TMF664 Resource Function Activation ──▶  SIS  ──▶ gerências / AAA / IMS
             ◀── confirmação assíncrona ──────────────
```

Isso elimina a necessidade de uma camada de abstração por fabricante no Nexus — o SIS já é essa
camada, e replicá-la seria duplicar responsabilidade.

- Chamada **assíncrona**, com circuit breaker e retry com backoff.
- Falha não bloqueia a ordem: o estado vira `failed` com motivo, e a ordem é reprocessável.
- Timeout explícito; sem confirmação, a designação é **revertida** para não reter porta indevidamente.

---

## 7. Geosite Logradouros — base de endereços e geocodificação

> **Premissa arquitetural.** O Geosite Logradouros é o **provedor canônico de endereço e
> geocodificação** do Nexus. Não há avaliação de alternativa externa.

Sistema proprietário da V.tal, funcionalmente equivalente a um Google Maps interno:

| Componente              | O que é                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| **Geosite Logradouros** | Réplica da base **DNE** dos Correios — endereçamento nacional                               |
| **Geonet**              | **Mapeamento urbano base** (cartografia de referência). **Não contém informação de planta** |

**Por que isso resolve o problema de escala:**

- Em várias regiões é **mais preciso que o Google**, com mais pontos de mercado — a base reflete a
  planta real da V.tal, não a cobertura genérica de um provedor global.
- **Abstrai o Google internamente:** quando não resolve com base própria, o próprio Geosite
  geoespacializa via Google. O bloqueio corporativo às APIs REST do Google **deixa de ser problema do
  Nexus** — passa a ser responsabilidade do Geosite.

**A integração é por endereço, não por coordenada.** Isso alinha com o TMF673, que separa
`GeographicAddress` de `GeographicLocation` justamente porque o mesmo endereço pode ser
geocodificado com precisões diferentes ao longo do tempo (ver `../2-functional-specs/01-module-geo.md`).

### 7.1 Fronteira de responsabilidade — território vs. planta

> **Regra:** o **território** é do Geosite; a **planta** é do Nexus.

Assim como o Rack separa Geographic de Resource (C2), esta é a fronteira que separa o Nexus do
Geosite. Ela não é negociável e evita duas bases divergentes da mesma geometria.

| Domínio                           | Autoridade                       | Geometrias                                                               |
| --------------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| **Território e cartografia base** | **Geosite Logradouros / Geonet** | Logradouro, bairro, município, UF, CEP e mapeamento urbano de referência |
| **Planta da V.tal**               | **Nexus**                        | Site, estação, poste, CTO, cabo, duto e **área de cobertura**            |

> **A cobertura não é geografia administrativa.** Ela é um **recorte de planejamento de rede** — a
> área que o time de Planejamento define como atendida — e **não coincide** necessariamente com
> município ou bairro. Por isso é planta, não território: nasce de decisão de engenharia, não da
> malha do IBGE. Ela vive hoje no **Netwin** e migra para o Nexus.

**Como as duas se encontram:** o Nexus **referencia** o território por atributo (código IBGE do
município, CEP, UF) — que vem do Geosite — mas **não persiste o polígono** de cidade ou bairro. Já a
geometria de tudo que é ativo da V.tal é inventário, e portanto do Nexus (C1: é `GeographicLocation`
referenciada por `place`).

| O Nexus persiste                  | O Nexus apenas referencia      |
| --------------------------------- | ------------------------------ |
| Ponto do endereço atendido (HP)   | Polígono do município / bairro |
| Site, estação, poste, CTO         | Malha de logradouros           |
| Traçado de cabo e duto            | Faixa de CEP                   |
| **Polígono de área de cobertura** | Normalização do endereço       |

> ❌ Não replicar a malha territorial dentro do Nexus. Consultar ou exibir a partir do Geosite; o que
> se guarda é a **chave** (código IBGE, CEP), não a geometria.

### 7.2 Pontos de atenção

| Tema                                        | Por quê                                                                                                                                                                                      |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Uso corrente ≠ carga inicial**            | O Geosite atende a **consulta corrente** (novo endereço, sugestão de logradouro). A **carga inicial** dos 22M não vem dele: vem de extração direta dos legados (§3)                          |
| **Precisão sim, procedência não**           | O Geosite **retorna a precisão** alcançada, mas **não informa se a coordenada veio da base V.tal ou do fallback Google**. Persistir a precisão como `characteristic` do endereço             |
| **Consequência da ausência de procedência** | Não é possível reprocessar seletivamente "só o que veio do Google". A **precisão passa a ser o único critério** de requalificação — quem estiver abaixo do limiar entra na fila de curadoria |

> ⚠️ **Não confundir com INC-006.** O roadmap sinaliza "Geosite/Geonet" como termos de protótipo a
> evitar **na nomenclatura de telas do Nexus** — a UI deve usar a taxonomia TMF. Isso não se aplica
> aqui: como **sistema externo integrado**, Geosite e Geonet são os nomes corretos e devem ser usados.

---

## 8. Outros serviços auxiliares

| Serviço                  | Uso                                                         | Observação                                                                              |
| ------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **Google Maps (JS API)** | Renderização do mapa e geocodificação interativa no browser | Somente a JS API está liberada corporativamente. Para massa, o caminho é o Geosite (§7) |
| **Provedor LLM**         | Nexus Copilot                                               | Opcional. Sem `OPENAI_API_KEY`, cai em fallback local sobre `docs/`                     |
| **MCP**                  | Exposição das APIs TMF a clientes de IA                     | Interno; sujeito ao mesmo RBAC e a confirmação explícita antes de writes                |

---

## 9. Padrões obrigatórios

| Padrão                         | Aplicação                                    |
| ------------------------------ | -------------------------------------------- |
| **Idempotency-Key**            | Toda escrita via API pública                 |
| **Circuit breaker**            | Netwin, provisionamento, serviços auxiliares |
| **Retry com backoff + jitter** | Consumidores Kafka e chamadas assíncronas    |
| **DLQ**                        | Todo consumer group                          |
| **Outbox**                     | Toda publicação de evento                    |
| **Correlation ID**             | Propagado do Apigee ao Kafka                 |
| **Contract testing**           | Contra os schemas TMF, no CI                 |

---

## 10. Questões em aberto

O registro único de governança, incluindo Q-INT-002 e Q-INT-005, vive em
[`../1-overview/open-questions.md`](../1-overview/open-questions.md). Esta seção não replica estados.

---

## 11. Referências

| Onde                                                                                           | O quê                                 |
| ---------------------------------------------------------------------------------------------- | ------------------------------------- |
| [`architecture.md`](architecture.md)                                                           | Outbox, Kafka, Apigee, saga de ordens |
| [`security.md`](security.md)                                                                   | Identidade, tenant, mTLS              |
| [`data-model.md`](data-model.md)                                                               | `_origin`, retenção, particionamento  |
| [`../2-functional-specs/inspirations/netwin.md`](../2-functional-specs/inspirations/netwin.md) | Modelo do legado                      |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
