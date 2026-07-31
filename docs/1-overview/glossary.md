# Glossário

> Termos, acrônimos e vocabulário canônico do V.tal Nexus. Onde o termo tem representação direta no
> código, o valor real está indicado — este documento serve tanto para onboarding quanto como fonte
> do fallback local do Nexus Copilot (`src/modules/search/local-knowledge-provider.ts`).

Convenção de idioma: nomes de entidade e termos técnicos ficam em **inglês** (é o vocabulário TMF);
rótulos de UI, status e prosa ficam em **português**.

---

## 1. Negócio e modelo comercial

| Termo | Definição |
|---|---|
| **V.tal** | Operadora de infraestrutura de fibra **neutra**. Vende capacidade de rede no atacado, não acesso ao consumidor final |
| **Wholesale** | Modelo de atacado: o cliente contratante é um ISP, que revende ao usuário final. É o **default** do Nexus |
| **Direto** | Exceção ao wholesale: a V.tal atende o cliente final. Distinguido pelo atributo `modelo_comercial` |
| **Tenant** | O ISP (ou entidade) que contrata a V.tal. Entra em `relatedParty` desde a criação da entidade |
| **Subscriber** | Assinante do serviço. No CFS é tipicamente o **Tenant ISP**, não o morador |
| **SubscriberID** | Identificador comercial do assinante, carregado pelo CFS |
| **HP** — Home Passed | Endereço que a fibra passa em frente e **poderia** atender. É `GeographicAddress`, **nunca** Service. A V.tal tem ~22 milhões |
| **HC** — Home Connected | Endereço efetivamente conectado e ativo. **Este** vira `ServiceInstance` |
| **OPEX / CAPEX** | Despesa operacional / investimento de capital |
| **Dual-running** | Período em que Nexus e sistema legado operam em paralelo sobre o mesmo ativo |
| **Cutover** | Corte definitivo do legado para o Nexus |

---

## 2. Padrões e arquitetura

| Termo | Definição |
|---|---|
| **TM Forum** | Consórcio que padroniza modelos e APIs de telecom. Base normativa do Nexus |
| **ODA** | *Open Digital Architecture* — arquitetura de referência do TM Forum |
| **SID** | *Shared Information/Data Model* — o modelo de dados canônico do TM Forum |
| **Open API TMF** | Contrato REST padronizado pelo TM Forum (ver §6) |
| **OSS / BSS** | *Operations / Business Support Systems* — sistemas de operação e de negócio |
| **`characteristic`** | Mecanismo TMF de extensão tipada via catálogo. Toda extensão V.tal entra assim — **nunca** como campo hardcoded (C1) |
| **`_origin`** | Grupo de `characteristic` somente-leitura que preserva a identidade legada (`system`, `id`, `entity`, `migratedAt`, `migratedBy`). 📐 Previsto no design, ainda não implementado |
| **Soft-delete** | Desativação sem exclusão física: Resource → `administrativeState='locked'` (C6) |
| **Soft-terminate** | Encerramento de serviço sem exclusão: Service → `state='terminated'` (C6) |
| **Outbox pattern** | Publicação de evento na mesma transação da mudança de estado, garantindo atomicidade (C7) |
| **Property Graph** | Estrutura de grafo para *path computation* (porta OLT → ONT). 📐 Alvo arquitetural (C10) |
| **Implementação-base** | Conjunto executável de domínio, persistência, API e UI que cobre o fluxo principal, mas não implica aderência integral a todos os RF/RN/CA do HLD |
| **Aderência ao HLD** | Estado verificado por requisito: `Implementado`, `Parcial`, `Não implementado` ou `Divergente`; `Implementado` exige código e teste para todo comportamento obrigatório |
| **Maturidade da especificação** | Situação independente da implementação: `Especificado` ou `Bloqueado por Q-*` |

---

## 3. A tríade — as três camadas canônicas

| Camada | Pergunta | Entidades |
|---|---|---|
| **Geographic** | Onde? | `GeographicSite`, `GeographicAddress`, `GeographicLocation` |
| **Resource** | O que existe? | `PhysicalResource`, `LogicalResource`, `ResourceSpecification` |
| **Service** | Para quê / para quem? | `CFS`, `RFS`, `ServiceSpecification` |

| Termo | Definição |
|---|---|
| **CFS** — Customer Facing Service | Visão **comercial** do serviço. Carrega o `SubscriberID`. **Nunca** referencia Resource diretamente |
| **RFS** — Resource Facing Service | Visão **técnica**. É quem consome recursos e suporta o CFS |
| **`supportingResource`** | Amarração canônica de um RFS ao recurso que o realiza |
| **`place`** | Amarração canônica de um Resource à sua referência geográfica |
| **`relatedParty`** | Amarração de uma entidade à Party (Tenant, fornecedor, responsável) |
| **Specification** | Item de **catálogo** — o modelo. Ex.: "ONT Huawei HG8245" |
| **Instância** | O ativo real, com serial number e localização. Ex.: a ONT instalada na casa do cliente |

> Distinção crítica: *"modelo de ONT"* é `ResourceSpecification` (catálogo). *"a ONT instalada"* é
> `PhysicalResource` (instância).

---

## 4. Planta e elementos de rede

| Termo | Definição |
|---|---|
| **OSP** — Outside Plant | Planta externa: cabos, postes, caixas, tudo fora da edificação |
| **ISP** — Inside Plant | Planta interna: equipamentos dentro da Central. ⚠️ Não confundir com *Internet Service Provider* |
| **ISP** — Internet Service Provider | O provedor que contrata a V.tal (o Tenant) |
| **ODN** | *Optical Distribution Network* — a rede óptica de distribuição |
| **FTTH** | *Fiber To The Home* — fibra até a residência |
| **GPON** | *Gigabit Passive Optical Network* — tecnologia de acesso óptico ponto-multiponto |
| **CO** — Central Office | Central telefônica; prédio com equipamentos ativos |
| **POP** — Ponto de Presença | Nó que agrega e distribui a rede |
| **OLT** | *Optical Line Terminal* — equipamento de acesso óptico, fica na Central |
| **ONT / ONU** | *Optical Network Terminal/Unit* — terminal óptico na ponta do cliente |
| **CPE** | *Customer Premises Equipment* — equipamento na casa do cliente (roteador, ONT) |
| **CTO** | Caixa de Terminação Óptica — armário na via pública onde a fibra é distribuída |
| **CDOE** | Caixa de Distribuição Óptica de Extremidade. No inventário é cadastrada com tipo **CTO** |
| **DIO** | Distribuidor Interno Óptico — painel de conexão dentro da Central |
| **Splitter** | Divisor óptico passivo: reparte um sinal em vários (típico 1:8, 1:16) |
| **Rack** | Estrutura que abriga equipamentos. **É a fronteira Geo ↔ Resource** (C2) |
| **Chassis / Placa / Porta** | Hierarquia interna de um equipamento, do Rack para dentro |
| **EOL / EOF** | *End of Life* / *End of Fabrication* — fim de vida e de fabricação de um modelo |

---

## 5. Vocabulário do código

Valores reais usados pela aplicação — úteis ao ler ou escrever código.

### `SiteKind` (`web/src/utils/placeLabel.ts`)

Tipo semântico de local, derivado da categoria TMF + nome do tipo.

| Valor | Rótulo na UI |
|---|---|
| `CO` | Estação (CO) |
| `POP` | POP |
| `CTO` | CTO / Armário |
| `PI` | Ponto de instalação |
| `REGION` | Região |
| `SUBSITE` | Sub-local |
| `SITE` | Local |

### Classes de equipamento (`src/modules/mcp/module.ts`, `web/src/hooks/useEquipmentCatalog.ts`)

| Tipo | Categoria canônica | Rótulo |
|---|---|---|
| `ONT` | `Equipment.CustomerPremises` | Terminal de Rede Óptica |
| `CPE` | `Equipment.CustomerPremises` | Equipamento de Cliente |
| `OLT` | `Equipment.Access` | Terminal de Linha Óptica |
| `Splitter` | `Infrastructure.Passive` | Divisor Óptico |
| `CTO` | `Infrastructure.Passive` | Caixa de Terminação Óptica |
| `DIO` | `Infrastructure.Passive` | Distribuidor Interno Óptico |
| `Pole` | `Infrastructure.Passive` | Poste |
| `Duct` | `Infrastructure.Passive` | Duto |
| `Manhole` | `Infrastructure.Passive` | Caixa subterrânea |

### Categorias canônicas de recurso (`src/modules/resource/catalog.ts`)

| Categoria | Cobre |
|---|---|
| `Equipment.Access` | Equipamentos de acesso na Central (OLT) |
| `Equipment.CustomerPremises` | Equipamentos na ponta do cliente (ONT, CPE) |
| `Equipment.Transport` | Equipamentos de transporte |
| `Infrastructure.Passive` | Planta passiva (splitter, CTO, DIO, poste, duto, caixa) |
| `Cable.OutsidePlant` | Cabos de planta externa |
| `Cable.InsidePlant` | Cabos de planta interna |
| `Logical.IPAM` | Recursos lógicos de endereçamento IP |

### Estados

| Atributo | Valores | Camada |
|---|---|---|
| `administrativeState` | `unlocked` · `locked` | Resource |
| `state` / `status` | `planned` · `active` · `terminated` | Service / Site |

---

## 6. Open APIs TMF implementadas

| API | Nome | Módulo |
|---|---|---|
| TMF632 | Party Management | Party |
| TMF633 | Service Catalog | Service |
| TMF634 | Resource Catalog | Resource |
| TMF638 | Service Inventory | Service |
| TMF639 | Resource Inventory | Resource |
| TMF641 | Service Ordering | Order |
| TMF645 | Service Qualification (Viabilidade) | Order |
| TMF652 | Resource Order | Order |
| TMF664 | Resource Function Activation | Resource / Order |
| TMF669 | Party Role | Party |
| TMF673 | Geographic Address | Geographic |
| TMF674 | Geographic Site | Geographic |
| TMF675 | Geographic Location | Geographic |
| TMF688 | Event Management | Transversal |

📐 Previstas no design, ainda não implementadas: TMF701 (Process Flow), TMF724 (Document Management).

---

## 7. Sistemas de referência

| Sistema | Papel |
|---|---|
| **Netwin** (Altice Labs) | Legado primário a ser substituído pelo Nexus |
| **Kuwaiba** | Inventário open-source usado como benchmark de metamodelo |
| **NetBox** | DCIM/IPAM open-source usado como contraste — **não** tem service inventory |

Detalhamento em [`../2-functional-specs/_benchmark-systems.md`](../2-functional-specs/_benchmark-systems.md).

---

## Referências

| Onde | O quê |
|---|---|
| [`business-rules.md`](business-rules.md) | Decisões arquiteturais C1–C10, com racional |
| [`product-overview.md`](product-overview.md) | Visão de produto e módulos |
| [`AGENTS.md`](../../AGENTS.md) | Convenções para agentes de IA |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
