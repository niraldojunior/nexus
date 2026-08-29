# Estratégia de Plataforma — Nexus além da V.tal

> Tese de posicionamento do V.tal Nexus como plataforma SaaS multi-vertical, monetizável além de
> telecom. Complementa [`product-overview.md`](product-overview.md) (o que o Nexus é hoje) sem
> substituí-lo — este documento é sobre **para onde** o produto pode ir e **por quê**.

**Atualizado em:** 18/08/2026

---

## 1. A tese central

> **O Nexus não é um inventário de telecom. É o sistema de registro de infraestrutura física
> compartilhada, monetizada como capacidade para terceiros.**

A tríade — **Onde? / O quê? / Para quem?** (ver [`product-overview.md`](product-overview.md) §3) —
descreve fibra, mas descreve igualmente distribuição elétrica, redes de água e esgoto,
compartilhamento de dutos e postes, portfólio de torres e colocation. **TMF é o dialeto; a tríade é a
gramática.**

O ativo raro não é a tríade em si — é a **C8** (ver [`business-rules.md`](business-rules.md#c8--multi-tenant-e-wholesale-por-premissa)):
quase todo inventário do mercado assume um operador dono da própria planta. O Nexus assume, desde a
primeira linha de schema, que a planta é **compartilhada** e que o cliente é um **tenant** com
visibilidade isolada sobre um ativo físico que ele não possui. Isso é difícil de retrofitar num
produto existente e relativamente barato de generalizar a partir de um produto que já nasceu assim.
É esse o território que este documento propõe ocupar.

**Vender inventário para as cinco grandes operadoras brasileiras** (Vivo, Claro, TIM, Vero) é um
mercado de compradores contáveis nos dedos, com incumbentes instalados (Amdocs, Netcracker,
Nokia/Altice NOSSIS) e ciclos de procurement plurianuais. Esse enquadramento sozinho não sustenta um
negócio de software. A resposta não é vender mais — é **reenquadrar o que o Nexus é** antes de
decidir para quem vender.

---

## 2. Estado real — o que sustenta a tese e o que ainda não existe

A tese só é defensável se distinguir o que já está construído do que é intenção de design. A tabela
usa o mesmo padrão de status de [`business-rules.md`](business-rules.md#como-ler-o-status).

### 2.1 Ativos que sustentam a tese

| Ativo                                                                                        | Por que importa para "plataforma"                                                                                      | Onde                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Tríade Geo/Resource/Service + 14 Open APIs TMF                                               | Vocabulário canônico reaproveitável fora de telecom (§4)                                                               | `src/modules/{geo,resource,service}`, `/tmf-api/*`                                                                               |
| Catálogo extensível (**C1**, **C9**) — extensão é `characteristic` tipada, nunca coluna nova | Verticalização vira **configuração**, não fork de código                                                               | [`business-rules.md`](business-rules.md#c1--tmf-first)                                                                           |
| Núcleo hexagonal com adapter Postgres↔Oracle já trocável                                     | Prova viva de que o domínio sobrevive à troca de infraestrutura — a mesma separação sustenta multi-cloud/multi-tenant  | [`architecture.md`](../3-system-design/architecture.md) §3                                                                       |
| Motor geoespacial nacional com LOD bairro/município/UF                                       | Cobertura por endereço em escala continental é o mesmo problema em fibra, água ou energia                              | [`coverage-service.ts`](../../src/modules/geo/coverage-service.ts), [`coverage-grid.ts`](../../src/modules/geo/coverage-grid.ts) |
| 39 ferramentas MCP com protocolo prepare→commit                                              | Operação segura por agente de IA sobre um modelo canônico tipado — praticamente impossível num schema legado hardcoded | [`module.ts`](../../src/modules/mcp/module.ts)                                                                                   |
| `_origin` + anti-corruption layer desenhados para coexistência com legado (**C5**, I1)       | Habilita a venda "por cima do legado" em vez de só rip-and-replace                                                     | [`integrations.md`](../3-system-design/integrations.md) §3.2                                                                     |

### 2.2 Gaps que a tese não pode esconder

| Gap                                                                                                                                   | Gravidade                                            | Fonte                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autenticação por token estático único; nenhuma identidade de usuário na requisição                                                    | 🔴 Bloqueador de go-live multi-tenant                | [`security.md`](../3-system-design/security.md) §1                                                                                                                                                                                |
| Sem tenant na requisição; sem isolamento entre clientes concorrentes                                                                  | 🔴 Um tenant consegue ler a base do outro            | [`security.md`](../3-system-design/security.md) §1                                                                                                                                                                                |
| RBAC e tenant_id cobrem Resource/Service/Order/Party (issue #80); VPD no Oracle e o caminho MCP/Copilot seguem sem o mesmo isolamento | 🟠                                                   | `D-ARQ-004` em [`architecture-decisions.md`](../5-delivery-plan/architecture-decisions.md); gaps residuais em [#94](https://github.com/niraldojunior/nexus/issues/94) e [#100](https://github.com/niraldojunior/nexus/issues/100) |
| `_origin`, outbox transacional (**C7**) e UUID v7 (**C5**) ainda não existem no código                                                | 🟠 Bloqueia dual-running com qualquer legado externo | [`business-rules.md`](business-rules.md#resumo-do-descompasso-cânone--código)                                                                                                                                                     |

> **Multi-tenancy é premissa de negócio (C8), não implementação.** Enquanto o bloco acima não fechar,
> "plataforma SaaS multi-vertical" é intenção de arquitetura, não produto vendável ao segundo tenant.
> Isso é o **Tier 0** do roadmap (§5) e precede qualquer outra prioridade deste documento.

---

## 3. Dados de mercado — com fonte e nível de confiança

Todo número abaixo tem fonte citada e uma classificação de confiança. Números de confiança **Baixa**
vêm de relatórios de _market research_ comerciais (metodologia não auditável) e devem ser lidos como
ordem de grandeza, nunca como insumo de business case.

| Dado                                                               | Número                                                                                     | Fonte                                                                                                                                                                                         | Confiança |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| Operadoras registradas na Anatel                                   | 18.805                                                                                     | [Teleco](https://teleco.com.br/scm_prest.asp)                                                                                                                                                 | Alta      |
| Market share de provedores de pequeno porte                        | 63,8% dos acessos                                                                          | [MHemann](https://mhemann.com.br/internet-fixa-2025/)                                                                                                                                         | Média     |
| Fibra sobre banda larga fixa no Brasil                             | ~79% de 53,9M de acessos                                                                   | [Telesíntese](https://telesintese.com.br/quem-lidera-a-banda-larga-no-brasil-segundo-a-anatel/)                                                                                               | Média     |
| Postes no Brasil / com ocupação irregular                          | 45M / ~11M                                                                                 | [IPEA, TD 2840](https://repositorio.ipea.gov.br/bitstream/11058/11733/1/TD_2840_web.pdf)                                                                                                      | Alta      |
| Nova resolução conjunta ANEEL/Anatel de compartilhamento de postes | Aprovada pela ANEEL em 02/12/2025                                                          | [ANEEL](https://www.gov.br/aneel/pt-br/assuntos/noticias/2025/proposta-de-resolucao-conjunta-sobre-compartilhamento-de-postes-e-aprovada-pela-aneel-e-segue-para-decisao-da-anatel)           | Alta      |
| Meta de universalização do saneamento                              | 99% água / 90% esgoto até 31/12/2033 (Lei 14.026/2020)                                     | [Ministério das Cidades](https://www.gov.br/cidades/pt-br/assuntos/saneamento/marco-legal-do-saneamento)                                                                                      | Alta      |
| Investimento necessário em saneamento até 2033                     | R$ 700–753 bilhões (vs. ~R$ 12 bi/ano investidos hoje)                                     | [ConJur / Instituto Trata Brasil](https://www.conjur.com.br/2025-nov-15/novo-marco-do-saneamento-lei-14-026-2020-a-necessidade-das-concessoes-para-o-servico-de-saneamento-basico-no-brasil/) | Média     |
| BDGD obrigatória para distribuidoras de energia                    | ResNorm ANEEL 956/2021; envio em até 60 dias                                               | [ANEEL Dados Abertos](https://dadosabertos.aneel.gov.br/dataset/base-de-dados-geografica-da-distribuidora-bdgd/)                                                                              | Alta      |
| Mercado global de network inventory (telecom)                      | US$ 9,1 bi (2025) → US$ 18,5 bi (2033)                                                     | [Data Insights Market](https://www.datainsightsmarket.com/reports/telecom-network-inventory-system-533622)                                                                                    | **Baixa** |
| Concentração de mercado OSS/BSS                                    | Amdocs, Huawei, Ericsson, Nokia, Netcracker ≈ 60% da receita global                        | [Mordor Intelligence](https://www.mordorintelligence.com/industry-reports/oss-bss-market)                                                                                                     | Média     |
| Aquisição da IQGeo pela KKR                                        | US$ 333 milhões                                                                            | [RFP.wiki](https://www.rfp.wiki/specialty-industries/energy-utilities-software/geospatial-information-systems-for-energy-and-utilities/iqgeo)                                                 | Média     |
| TM Forum Open API — adesão                                         | 46 CSPs signatários + 172 parceiros de tecnologia                                          | [TM Forum](https://www.tmforum.org/open-api-manifesto/)                                                                                                                                       | Alta      |
| MCP — adoção enterprise                                            | ~28% da Fortune 500; 78% dos times de IA enterprise com agentes MCP em produção (jul/2026) | [andrew.ooo](https://andrew.ooo/answers/mcp-model-context-protocol-enterprise-adoption-july-2026/)                                                                                            | **Baixa** |
| MCP doado à Agentic AI Foundation                                  | dez/2025 — passa a padrão aberto neutro de fornecedor                                      | [MCP Blog](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)                                                                                                                      | Alta      |
| Escala da planta V.tal                                             | ~426 mil km de fibra, 2.380 municípios, 16M+ Home Passed                                   | [Data Center Dynamics](https://www.datacenterdynamics.com/br/not%C3%ADcias/nasce-a-vtal-empresa-de-rede-neutra-com-a-maior-infraestrutura-de-fibra-%C3%B3tica-do-brasil/)                     | Média     |

---

## 4. Mapa de mercados — ordenado por encaixe de modelo, não por tamanho

### Tier A — mudança de modelo próxima de zero

**Compartilhamento de infraestrutura (postes, dutos, torres, fibra apagada).** Poste vira
`GeographicSite`/`Resource` conforme a fronteira já definida em **C2**; ocupação vira `Resource`;
contrato de compartilhamento vira `Service` com `subscriber` = operadora ocupante — a mesma forma de
**C8**, com o compartilhado sendo o poste em vez da fibra. Com ~11 milhões de postes em ocupação
irregular e uma resolução conjunta ANEEL/Anatel recém-aprovada (dez/2025) pressionando regularização,
existe demanda regulatória por um sistema de registro que hoje não tem dono claro. **É o melhor
encaixe da tríade sem qualquer alteração de modelo.**

**Long tail de ISPs regionais.** Milhares de provedores licenciados (>22 mil prestadoras respondem
por mais de 56% dos acessos de banda larga) operando planta em planilha, sem inventário formal. A
V.tal já os tem como clientes wholesale e já serve viabilidade via API — o canal de venda e o
relacionamento comercial já existem; falta o produto embalado para eles operarem a própria planta
sobre o Nexus.

### Tier B — mesma forma, vocabulário diferente

**Saneamento — a aposta mais forte fora de telecom.** Concessionárias privadas novas (efeito direto
do Marco Legal, Lei 14.026/2020) são capex-intensivas, greenfield de sistemas de gestão, e correm
contra um prazo regulatório de 2033 sem lock-in de inventário legado. `Home Passed` ≡ _domicílio com
rede de água/esgoto disponível_ — literalmente o mesmo problema de cobertura-por-endereço que
[`coverage-service.ts`](../../src/modules/geo/coverage-service.ts) resolve para fibra. R$700+ bilhões
de investimento necessário é orçamento que precisa de sistema de registro para ser auditável.

**Distribuição de energia elétrica.** Subestação = `GeographicSite`; alimentador/transformador =
`Resource`; ponto de entrega = `Service`. A BDGD (ResNorm ANEEL 956/2021) é um driver de compliance
recorrente e já obriga as distribuidoras a manter um modelo geográfico — só que fragmentado por
distribuidora, sem SaaS comum. Conexão de geração distribuída (solar) é, na prática, uma consulta
TMF645: _este endereço pode injetar X kW neste alimentador?_ — o mesmo formato de Service
Qualification que o Nexus já implementa para viabilidade GPON.

### Tier C — oportunístico

Colocation multi-tenant (a camada de _serviço_ sobre um DCIM é uma lacuna real — ver §6), redes de
recarga de veículos elétricos, concessões de rodovia/ferrovia. Não priorizado neste roadmap; registrar
como direção futura.

---

## 5. Roadmap de capacidades

### Tier 0 — pré-requisito de SaaS (bloqueia tudo)

Sem isto, não existe segundo tenant pagante:

- Isolamento real de tenant na aplicação e no banco (ver [`security.md`](../3-system-design/security.md) §4 — VPD + filtro no adaptador)
- Provisionamento de tenant (onboarding, credenciais, escopo)
- Medição por tenant — é ao mesmo tempo a primitiva de billing **e** o insumo de precificação
- Federação de identidade OIDC/SAML (o IdP local hoje é laboratório — ver `D-ARQ-004` em [`architecture-decisions.md`](../5-delivery-plan/architecture-decisions.md))
- Suíte de teste de isolamento cross-tenant (já prescrita em [`security.md`](../3-system-design/security.md) §4: todo endpoint deve devolver `404`, não `403`, ao tentar ler recurso de outro tenant)

### Tier 1 — produtizar o que já existe

- **Vertical packs** — a maior alavanca deste roadmap. Por causa de **C9**, um pack é um bundle de
  `Specifications` + tipos de relação + tipos de site + rótulos + camadas de mapa — **sem fork do
  core**. Packs propostos: Fibra (já existe), Postes/Compartilhamento, Saneamento, Distribuição de
  Energia, Colocation.
- **Camada de terminologia** — TMF permanece canônico na API e no banco; a UI troca o rótulo por
  vertical ("poste", "ramal", "ponto de entrega" em vez de "site", "resource", "service"). Custo
  baixo, decisivo para adoção fora de telecom, onde ninguém fala TMF.
- **Importador self-service** — produtizar as lições já pagas em `scripts/` de carga real (encoding
  Latin-1, validação de coordenada por caixa delimitadora de UF, idempotência por chave natural +
  `_origin.id`, listadas em [`integrations.md`](../3-system-design/integrations.md) §3.3). É o que
  transforma onboarding de meses em dias e neutraliza a maior objeção de venda: "quanto tempo até eu
  ver meu próprio dado aqui?"

### Tier 2 — o fosso competitivo

- **Path computation / grafo de conectividade** (**C10**). Traçar OLT→ONT em fibra é a mesma operação
  de grafo que traçar alimentador→ponto de consumo em energia ou adutora→ligação em água. Uma
  capacidade de engenharia, reaproveitável em quatro verticais — e é a funcionalidade mais cara nos
  produtos de GIS estabelecidos.
- **Análise de impacto** — "rompimento aqui → 4.300 serviços fora, 12 ISPs afetados, estes SLAs em
  risco". Aplica-se a qualquer operador de infraestrutura compartilhada, em qualquer vertical, e
  quebra a "espiral de morte do inventário": o dado para de apodrecer quando a operação depende dele
  diariamente para responder a incidente.
- **Viabilidade como API isolada e medível** (extensão de TMF645). É a cunha de venda que exige menos
  confiança do cliente no dado — ele testa antes de migrar o inventário inteiro.
- **Operação agent-native em produção** — expandir a superfície MCP mantendo o protocolo
  prepare→commit já implementado, com política de confirmação por tenant e trilha de auditoria das
  ações executadas por agente.

---

## 6. Posicionamento competitivo

| Concorrência                                           | Contra-argumento do Nexus                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Incumbentes OSS (Amdocs, Netcracker, NOSSIS)           | Verticalização por configuração (**C1**/**C9**), não customização de schema. A anti-tese está registrada no próprio levantamento operacional: _"O Geosite é um remendo"_ ([`inspirations/geosite-legado.md`](../2-functional-specs/inspirations/geosite-legado.md))                                            |
| NetBox (open-source)                                   | Resource-centric; sem service inventory CFS/RFS alinhado ao SID, sem geoespacial em escala nacional, sem viabilidade/ordem (ver [`_benchmark-systems.md`](../2-functional-specs/_benchmark-systems.md))                                                                                                        |
| GIS estabelecidos (Smallworld, ArcGIS Utility Network) | GIS-first: fortes em geometria, fracos em serviço/contrato/ordem e em API-first                                                                                                                                                                                                                                |
| **VertiGIS ConnectMaster**                             | ⚠️ **Já opera multi-vertical** (utilities + telecom). A categoria "plataforma multi-vertical" **não está vazia** — "somos multi-vertical" sozinho não é diferenciação. O argumento defensável é TMF-first + wholesale-native (**C8**) + agent-native (MCP prepare→commit), não a abrangência de vertical em si |

### Go-to-market

1. **Vender _sobre_ as grandes operadoras, não _contra_ elas.** Vivo, Claro e TIM não vão trocar a
   Netcracker. Mas uma camada de agente + grafo de conectividade + geoespacial + viabilidade **sobre**
   o inventário legado é venda plausível — e `_origin` + anti-corruption layer (I1) tornam essa
   coexistência natural na arquitetura, não um adendo.
2. **Sinalizar o conflito comercial em vez de escondê-lo.** Vender para Claro/TIM _como V.tal_ — que é
   simultaneamente fornecedora e, em alguns segmentos, concorrente indireta — é comercialmente
   delicado e pode exigir marca ou entidade separada para o produto de plataforma. Levantar isso
   preventivamente é mais barato do que ser confrontado com a pergunta depois.

**Sequência recomendada:** provar em escala nacional dentro da V.tal (a referência de produção _é_ a
credibilidade comercial) → cunha na própria base de ISPs wholesale da V.tal (Tier A, CAC ~zero) →
adjacências de compartilhamento de infraestrutura → utilities/saneamento no relógio regulatório de
2033 → grandes operadoras por último, como camada sobre o legado.

---

## 7. Riscos e anti-escopo

- **A tese inteira depende do Tier 0.** Sem isolamento real de tenant, tudo neste documento é
  intenção de arquitetura. Nenhuma conversa comercial externa deveria avançar antes disso fechar.
- **Priorizar multi-vertical tem custo de oportunidade explícito** sobre o roadmap interno da V.tal
  (ver descompasso cânone×código em [`business-rules.md`](business-rules.md#resumo-do-descompasso-cânone--código)).
  Este documento assume que vale pagar esse custo; a decisão de sequenciamento entre entregas internas
  e capacidades de plataforma é de produto, não implícita neste documento.
- **Fontes de mercado de confiança Baixa** (§3) não sustentam um business case formal — apenas
  orientam prioridade relativa. Uma decisão de investimento externo exige pesquisa primária.
- **O que este documento não propõe:** não é uma decisão de criar uma nova entidade jurídica, não é
  compromisso de roadmap datado, e não substitui as decisões arquiteturais firmadas em C1–C10 — apenas
  argumenta que elas generalizam bem além de telecom.

---

## 8. Questões em aberto derivadas

O backlog único de questões e lacunas vive no GitHub Issues do repositório — ver
[#94](https://github.com/niraldojunior/nexus/issues/94) (VPD Oracle) e
[#100](https://github.com/niraldojunior/nexus/issues/100) (RBAC/tenant no caminho MCP/Copilot) para
os itens que bloqueiam diretamente o Tier 0 deste documento (isolamento multi-tenant completo).

---

## 9. Referências

| Onde                                                                                                                   | O quê                                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [`product-overview.md`](product-overview.md)                                                                           | O que o Nexus é hoje — módulos, estado, roadmap interno            |
| [`business-rules.md`](business-rules.md)                                                                               | Decisões C1–C10 com racional — base de por que a tríade generaliza |
| [`../3-system-design/security.md`](../3-system-design/security.md)                                                     | Detalhe do gap de multi-tenancy (Tier 0)                           |
| [`../3-system-design/architecture.md`](../3-system-design/architecture.md)                                             | Arquitetura hexagonal que sustenta a portabilidade de vertical     |
| [GitHub Issues — `mod:plataforma`](https://github.com/niraldojunior/nexus/issues?q=is%3Aopen+label%3Amod%3Aplataforma) | Questões e lacunas que bloqueiam este roadmap                      |

---

_V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA_
