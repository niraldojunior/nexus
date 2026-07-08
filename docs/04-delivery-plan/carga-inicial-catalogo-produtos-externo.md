# Carga Inicial De Catalogo De Produtos Externo

> Documento de apoio para mapeamento e ingestao de um catalogo legado de equipamentos em outra ferramenta. Baseado no canone Nexus para `ResourceSpecification`, `_origin` e caracteristicas extensiveis.

## 1. Objetivo

Este documento consolida a leitura inicial do catalogo externo fornecido pelo usuario e define uma estrategia pratica para:

- mapear cada coluna de origem para o modelo Nexus;
- identificar atributos canonicos, derivacoes e campos legados;
- preparar a carga inicial em formato reutilizavel pela AI e pelo pipeline de migracao;
- sinalizar ambiguidade de classificacao antes de consolidacao definitiva.

## 2. Escopo Do Catálogo Recebido

O recorte analisado contem as seguintes colunas:

| Coluna de origem | Observacao |
|---|---|
| `Cod. Equipamento` | Identificador legado do registro. |
| `Tipo` | Classe operacional ampla do equipamento. |
| `Equipamento` | Nome funcional do item. |
| `Categoria` | Classificacao legada ou taxonomia local. |
| `Marca` | Fabricante / brand. |
| `Modelo` | Designacao comercial do modelo. |
| `ID-SKU` | Codigo de catalogo / SKU, quando existente. |
| `EOL (End of Life)` | Data de fim de vida. |
| `EOSL (End of Support Life)` | Data de fim de suporte. |
| `Status` | Situacao do item. |
| `Atualizado em` | Data e hora da ultima alteracao no legado. |

## 3. Leitura Funcional

O recorte parece representar um **catalogo de especificacoes de recurso**, nao um inventario de instancias:

- ha marca, modelo, SKU e datas de ciclo de vida;
- nao ha serial number, localizacao fisica, `place` ou relacoes de conteudo;
- o uso mais provavel no Nexus e como `ResourceSpecification` com extensoes em `characteristic`.

## 4. Mapeamento De Campos

### 4.1 Mapeamento direto

| Campo de origem | Exemplo | Destino Nexus | Observacao |
|---|---|---|---|
| `Cod. Equipamento` | vazio nos exemplos | `_origin.id` ou `externalId` | Manter como identificador legado somente se existir valor consistente. |
| `Tipo` | `CPE` | `resourceType` ou `characteristic.type` | Pode virar uma categoria principal do catalogo. |
| `Equipamento` | `Roteador` | `name` ou `displayName` | Nome funcional do item. |
| `Categoria` | `Customizado`, `P` | `category` ou `characteristic.category` | Exige dicionario controlado. |
| `Marca` | `DATACOM`, `ZTE` | `manufacturer` ou `characteristic.brand` | Se o modelo canonicamente nao expuser `manufacturer`, usar `characteristic`. |
| `Modelo` | `DM2500 4GT`, `ONT Router` | `model` ou `characteristic.model` | Nome comercial do modelo. |
| `ID-SKU` | vazio | `_origin.extra.sku` | Sem valor nos exemplos. |
| `EOL` | `18/06/2026` | `validFor.endDateTime` ou `characteristic.eolDate` | Normalizar para ISO 8601. |
| `EOSL` | `18/06/2026` | `characteristic.eoslDate` | Normalizar para ISO 8601. |
| `Status` | `Ativo` | `lifecycleStatus` ou `status` | Normalizar para `active`. |
| `Atualizado em` | `19/06/2026 - 17:18` | `_origin.migratedAt` ou `lastUpdateDate` | Converter para ISO 8601 com timezone. |

### 4.2 Classificacao do destino

| Campo alvo | Papel | Quando usar |
|---|---|---|
| `name` | Nome canonico de catalogo | Quando a linha tiver nome claro e unico. |
| `resourceType` | Tipo amplo do recurso | Quando o valor como `CPE` tiver semantica consistente. |
| `category` | Organizacao navegavel | Quando existir taxonomia estavel. |
| `manufacturer` | Fabricante canonico | Quando o campo de marca for confiavel e padronizado. |
| `model` | Modelo canonico | Quando o nome comercial do equipamento for o principal identificador. |
| `characteristic` | Extensao V.tal / legado | Quando o atributo nao for canonico ou depender de dicionario. |
| `_origin` | Proveniencia legada | Sempre para rastreio da migracao. |

## 5. Normalizacao Proposta

### 5.1 Regras

| Regra | Transformacao |
|---|---|
| Status legivel | `Ativo` -> `active` |
| Datas | `dd/mm/yyyy` ou `dd/mm/yyyy - hh:mm` -> ISO 8601 |
| Categoria vaga | `Customizado` -> `custom` |
| Categoria ambigua | `P` -> manter original ate validacao de negocio |
| Vazios | Converter para `null` ou omitir no payload |
| Fabricante | Padronizar caixa e catalogo (`DATACOM`, `ZTE`) |

### 5.2 Campo ambguo

`Categoria = P` e o unico ponto que eu nao consolidaria automaticamente. As hipoteses mais provaveis sao:

| Hipotese | Leitura |
|---|---|
| `Padrão` | Diferencia item customizado de item padrao. |
| `Produto` | Categoria comercial interna. |
| `Plano` | Classificacao do catalogo em outra ferramenta. |

Recomendacao: manter `P` como valor bruto no `_origin.extra` ou em `characteristic.categoryRaw` ate obter o dicionario da ferramenta origem.

## 6. Carga Inicial Dos Registros

### 6.1 Registros recebidos

| Tipo | Equipamento | Categoria | Marca | Modelo | ID-SKU | EOL | EOSL | Status | Atualizado em |
|---|---|---|---|---|---|---|---|---|---|
| CPE | Roteador | Customizado | DATACOM | DM2500 4GT | vazio | vazio | vazio | Ativo | 19/06/2026 - 17:18 |
| CPE | Roteador | Customizado | ZTE | ONT Router | vazio | 18/06/2026 | 18/06/2026 | Ativo | 30/06/2026 - 12:06 |
| CPE | Roteador | Customizado | DATACOM | DM2500 6GT+2CG | vazio | 03/06/2026 | 03/06/2026 | Ativo | 10/06/2026 - 11:29 |
| CPE | Roteador | P | DATACOM | DM2500 6GT+2CG | vazio | 03/06/2026 | 03/06/2026 | Ativo | 10/06/2026 - 11:32 |

### 6.2 Leitura da carga

| Linha | Interpretação |
|---|---|
| 1 | Spec de roteador CPE DATACOM sem datas de obsolescencia informadas. |
| 2 | Spec de roteador CPE ZTE com EOL/EOSL identicos. |
| 3 | Spec de roteador CPE DATACOM com EOL/EOSL identicos. |
| 4 | Possivel duplicidade de linha 3 com classificacao diferente em `Categoria`. |

## 7. Payload Canonico Sugerido

```json
[
  {
    "@type": "ResourceSpecification",
    "name": "Roteador DM2500 4GT",
    "category": "custom",
    "resourceType": "CPE",
    "manufacturer": "DATACOM",
    "model": "DM2500 4GT",
    "lifecycleStatus": "active",
    "validFor": null,
    "characteristic": [
      { "name": "equipment", "value": "Roteador" },
      { "name": "categoryRaw", "value": "Customizado" }
    ],
    "_origin": {
      "system": "legacy-product-catalog",
      "entity": "resource-catalog-item",
      "id": null,
      "migratedAt": "2026-06-19T17:18:00-03:00"
    }
  },
  {
    "@type": "ResourceSpecification",
    "name": "Roteador ONT Router",
    "category": "custom",
    "resourceType": "CPE",
    "manufacturer": "ZTE",
    "model": "ONT Router",
    "lifecycleStatus": "active",
    "validFor": {
      "endDateTime": "2026-06-18T00:00:00-03:00"
    },
    "characteristic": [
      { "name": "equipment", "value": "Roteador" },
      { "name": "categoryRaw", "value": "Customizado" },
      { "name": "eolDate", "value": "2026-06-18" },
      { "name": "eoslDate", "value": "2026-06-18" }
    ],
    "_origin": {
      "system": "legacy-product-catalog",
      "entity": "resource-catalog-item",
      "id": null,
      "migratedAt": "2026-06-30T12:06:00-03:00"
    }
  },
  {
    "@type": "ResourceSpecification",
    "name": "Roteador DM2500 6GT+2CG",
    "category": "custom",
    "resourceType": "CPE",
    "manufacturer": "DATACOM",
    "model": "DM2500 6GT+2CG",
    "lifecycleStatus": "active",
    "validFor": {
      "endDateTime": "2026-06-03T00:00:00-03:00"
    },
    "characteristic": [
      { "name": "equipment", "value": "Roteador" },
      { "name": "categoryRaw", "value": "Customizado" },
      { "name": "eolDate", "value": "2026-06-03" },
      { "name": "eoslDate", "value": "2026-06-03" }
    ],
    "_origin": {
      "system": "legacy-product-catalog",
      "entity": "resource-catalog-item",
      "id": null,
      "migratedAt": "2026-06-10T11:29:00-03:00"
    }
  },
  {
    "@type": "ResourceSpecification",
    "name": "Roteador DM2500 6GT+2CG",
    "category": "p",
    "resourceType": "CPE",
    "manufacturer": "DATACOM",
    "model": "DM2500 6GT+2CG",
    "lifecycleStatus": "active",
    "validFor": {
      "endDateTime": "2026-06-03T00:00:00-03:00"
    },
    "characteristic": [
      { "name": "equipment", "value": "Roteador" },
      { "name": "categoryRaw", "value": "P" },
      { "name": "eolDate", "value": "2026-06-03" },
      { "name": "eoslDate", "value": "2026-06-03" }
    ],
    "_origin": {
      "system": "legacy-product-catalog",
      "entity": "resource-catalog-item",
      "id": null,
      "migratedAt": "2026-06-10T11:32:00-03:00"
    }
  }
]
```

## 8. Regras De Ingestao Para AI

### 8.1 O que a AI pode fazer

- inferir padroes entre marca, modelo e categoria;
- sugerir agrupamentos e deduplicacao;
- classificar categorias legadas em uma taxonomia controlada;
- detectar campos vazios e inconsistencias;
- gerar `ResourceSpecification` a partir de linhas tabulares.

### 8.2 O que a AI nao deve decidir sem validacao

- significado de `Categoria = P`;
- se a linha 4 e uma duplicidade ou uma variacao legitima;
- se `EOL` e `EOSL` devem ser modelados em `validFor` ou em `characteristic`;
- se `Tipo` e categoria, familia de produto ou recurso amplo.

## 9. Saida Esperada Para Pipeline

Para evoluir dessa leitura inicial para carga de verdade, o pipeline precisa de:

1. exportacao original em `CSV`, `XLSX` ou `JSON`;
2. dicionario da ferramenta de origem, se existir;
3. regra para valores codificados, especialmente `Categoria`;
4. confirmacao se o destino e catalogo de especificacao ou inventario de instancia.

## 10. Decisao Provisoria

| Tema | Decisao provisoria |
|---|---|
| Modelo destino | `ResourceSpecification` |
| Proveniencia | `_origin` obrigatorio |
| Categoria vaga | Preservar valor bruto ate validacao |
| Carga inicial | Viavel com cobertura alta para os campos recebidos |
| Risco principal | Dicionario incompleto da classificacao legada |

---

*V.tal Nexus - Documento Confidencial - Uso Interno - PUBLICA*
