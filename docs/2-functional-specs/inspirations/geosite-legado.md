# Geosite-Legado — levantamento por consulta operacional

## 0. Procedência e limites desta fonte

Este arquivo **não** é um levantamento de telas, como `netwin.md`, `nossis.md`, `kuwaiba.md` e `netbox.md`. Ele consolida uma **consulta operacional** com Sandro de Castro Monteiro (operação de rede externa, acesso e backbone), realizada em julho de 2026, cujo objeto foi a arquitetura e o modelo de representação do inventário — não a ferramenta.

Consequências para o uso desta fonte:

- Tudo aqui é **percepção de operação relatada**, não comportamento verificado em ambiente. Onde o depoimento não afirma, escreva `Não identificado no levantamento`.
- É a única fonte de benchmark que entra como **anti-referência**: registra o que o Nexus decidiu **não** repetir. As decisões derivadas dela aparecem na coluna `Decisão Nexus` das tabelas N.9 e nos racionais N.2, não como coluna própria.
- Citações entre aspas são do entrevistado.

### 0.1 Desambiguação de nome — leia antes de citar

Três coisas diferentes carregam a palavra "Geosite" no material do Nexus. Só a primeira é o objeto deste arquivo:

| Nome | O que é | Onde aparece |
|---|---|---|
| **Geosite-Legado** | Inventário georreferenciado de planta externa a ser substituído. Objeto deste arquivo, tratado como anti-referência. | Aqui; `../../3-system-design/integrations.md`; Q-INT-005 |
| **Geosite Logradouros** | Provedor de endereço e geocodificação, premissa canônica (D-GEO-002). Permanece. | `01-module-geo.md` REQ-MOD01-002 |
| **Geosite OSP** | Base cartográfica e camadas pré-configuradas reaproveitadas pelo mapa. Permanece. | `01-module-geo.md` REQ-MOD01-011 |

---

## 1. Contexto do sistema

O Geosite-Legado é o sistema de cadastro georreferenciado de planta externa em uso na operação. Segundo o relato, evoluiu ao longo de anos por **solicitações pontuais de negócio, sem revisão estrutural da arquitetura** — cada demanda entrou como customização sobre o modelo existente.

Efeitos percebidos pela operação:

- Complexidade crescente e acúmulo de customizações.
- Modelo de dados difícil de compreender para quem não domina a ferramenta.
- Esforço de manutenção elevado.

> "O Geosite é um remendo."

---

## 2. Modelo de dados observado — entidades intermediárias

O ponto central do depoimento. Para representar uma infraestrutura subterrânea, o modelo exige do usuário uma sequência de cadastros em que **nem todos os objetos existem no mundo físico**:

```
Fluxo relatado para cadastrar infraestrutura subterrânea:

  1. Cadastrar caixas subterrâneas       → existe em campo
  2. Cadastrar arcos                     → NÃO existe em campo
  3. Associar cabos aos arcos            → amarração sobre objeto artificial
  4. Desenhar linhas de duto             → existe em campo
```

O **arco** é a aresta lógica entre dois nós do grafo, exposta ao usuário como objeto de cadastro.

> "O arco nem existe."

Consequências relatadas:

- Complexidade operacional no cadastro do dia a dia.
- Dificuldade de entendimento do modelo por áreas usuárias.
- Aumento da probabilidade de erro de cadastro.
- Dependência de conhecimento específico da ferramenta, não da engenharia de rede.

**Contraste declarado:** no NOSSIS/Networks (ver `nossis.md` e `netwin.md`), os objetos manipulados — caixa subterrânea, linha de duto, banco de dutos, cabo — têm todos correspondência física direta.

> "Tudo aqui existe."

---

## 3. Inconsistência cadastral observada

Caso concreto relatado:

| Objeto | Estado no inventário |
|---|---|
| Caixas subterrâneas | Cadastradas |
| Arcos | Cadastrados |
| Linha de duto | **Ausente** |

O inventário está formalmente preenchido — passa em qualquer validação de campo obrigatório — e ainda assim não descreve a infraestrutura real. Consequências: análise de infraestrutura inviável, investigação manual em campo, retrabalho operacional.

O detalhe arquitetural relevante: essa lacuna **não é detectável por validação de escrita**, porque o registro pode ter nascido de carga legada, migração ou mudança posterior de regra. Detectá-la exige varredura periódica sobre a base já persistida.

---

## 4. Dependência de ambiente desktop

Incidente relatado em uma cidade de Minas Gerais:

1. Demanda operacional exigia desenhar uma linha de duto.
2. A funcionalidade não estava disponível no Geosite-Legado Web.
3. O fluxo exigia o Geosite-Legado Desktop.
4. Instalação e licenciamento do cliente desktop travaram a execução.

Impactos: lentidão na resposta à demanda, dependência de suporte de TI, perda de produtividade e fragilidade em situação emergencial.

Leitura arquitetural: a fronteira web/desktop não caiu sobre uma funcionalidade acessória, e sim sobre **digitalização de geometria** — operação de cadastro corriqueira em planta externa.

---

## 5. Necessidades declaradas para o inventário definitivo

Registradas como enunciadas pelo entrevistado, sem tradução para o vocabulário TMF:

| Eixo | Necessidade |
|---|---|
| Arquitetura | Separação clara entre camada física e camada lógica; relacionamento entre ativos físicos e serviços; integração com sistemas corporativos. |
| Operação | Plataforma preferencialmente 100% web; eliminação de dependências desktop; facilidade de uso pelas áreas operacionais. |
| Modelagem | Representação fiel da infraestrutura real; eliminação de entidades artificiais; simplificação dos processos de cadastro. |
| Governança de dados | Redução de inconsistências cadastrais; confiabilidade da informação; facilidade de auditoria e rastreabilidade. |
| Rastreabilidade | Amarração ponta a ponta entre serviço entregue ao cliente e os ativos físicos que o suportam — circuitos, equipamentos, infraestrutura óptica, cabos. |
| Sistemas corporativos | Integração com ERP/financeiro (SAP) — o número de ativo aparece como atributo nos sistemas legados (ver `nossis.md`, campo "Nº SAP"). |

---

## 6. O que o Nexus decidiu a partir desta fonte

| Ponto observado | Decisão Nexus | Onde está |
|---|---|---|
| Arco como objeto de cadastro | **Fidelidade física — zero entidades artificiais.** Arestas, trechos e adjacências são derivadas da contenção e dos endpoints; nunca cadastradas. | Princípio de design em `01-module-geo.md` §4 e `02-module-resource.md` §4 |
| Infraestrutura subterrânea sem modelo próprio | Banco de dutos ⊃ duto ⊃ sub-duto ⊃ cabo, com endpoints A/Z em caixas reais e ocupação derivada. | REQ-MOD02-026 |
| Desenho de duto exige desktop | Digitalização e edição de geometria no navegador, sem cliente instalado. | REQ-MOD01-013 |
| Caixa e arco sem linha de duto | Motor de integridade e completude com varredura periódica, catálogo de regras administrável e findings rastreáveis. | REQ-MOD02-027 |
| Cadastro complexo e sequencial | Materialização de filhos a partir da Specification, em uma transação. | REQ-MOD02-028 |
| Rastreabilidade até o ativo físico | Trajeto óptico **e** civil; impacto reverso de ativo de OSP até o CFS. | REQ-MOD02-012, REQ-MOD03-008 |
| Ativo corporativo (SAP) | Grupo de characteristics `_asset`, distinto de `_origin` (C5); o ERP permanece dono do estoque e da contabilização. | REQ-MOD02-005, `Q-RES-013` |

---

*V.tal Nexus — Documento Confidencial — Uso Interno — PÚBLICA*
