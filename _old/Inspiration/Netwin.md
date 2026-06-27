# Relatório do Frontend do Netwin

## 1. Contexto do sistema

O NETWIN é um sistema unificado de cadastro, responsável pelas funções de projeto, construção e cadastro de rede.
Suporta processos de planeamento, construção e provisão de rede e serviços de telecomunicações.

## 2. Principais funcionalidades do NETWIN

1. Cadastro de redes e serviços.
2. Projeto e construção de rede física e lógica.
3. Cadastro georreferenciado de infraestruturas de rede física (exterior).
4. Reserva e alocação de recursos.
5. Gestão de recursos lógicos de rede.
6. Provisão de serviços de rede.
7. Gestão de capacidade.
8. Flexibilidade de adaptação aos processos de negócio.

---

## 3. Resumo inicial: menu principal e propósito

| Menu principal | Propósito |
|---|---|
| Location Manager | Gestão de locais e pontos de instalação. |
| Outside Plant | Gestão de recursos físicos no terreno e cadastro georreferenciado da rede exterior. |
| Inside Plant | Gestão de plantas de sala, bastidores, equipamentos e conectividade local. |
| Network & Services | Gestão e ocupação de recursos de rede e gestão de serviços de cliente/rede. |
| Resource Provisioning | Provisão de serviços e atribuição de recursos de rede aos serviços. |
| Reports | Consulta estruturada da informação e indicadores de monitorização do cadastro. |
| Catalogue | Configuração e inicialização do sistema com modelos, atributos e templates. |
| Task Manager | Menu operacional presente no sistema (detalhamento pendente de levantamento). |
| Data Manager | Importação, exportação e gestão de dados do sistema. |

---

## 4. Detalhamento por módulo (com base no menu observado)

## 4.1 Location Manager

O módulo Locations permite fazer a gestão de locais e pontos de instalação.

Funcionalidades:

1. Pesquisa
2. Location Manager
3. Roteiro de endereços

---

### 4.1.1 Pesquisa — Local Físico

Tela de pesquisa de locais físicos cadastrados no sistema. Permite filtrar por múltiplos atributos e abrir resultados para detalhe ou edição. O botão **+ criar** no canto superior direito inicia o fluxo de criação de novo local.

#### Campos de filtro disponíveis

| Campo | Tipo | Observações |
|---|---|---|
| Nome | Texto livre | Pesquisa por nome do local físico. |
| Designação | Texto livre | Identificação alternativa ou rótulo do local. |
| Divisão administrativa | Dropdown (seleção única) | Filtro por unidade administrativa (ex.: município, região). |
| Tipo | Dropdown (seleção única) | Tipologia do local físico (ex.: Central, Armário, Poste, etc.). |
| Estado ciclo de vida | Dropdown (seleção única) | Situação do local no seu ciclo de vida (ex.: Em serviço, Planeado, Desativado). |
| Data estado ciclo de vida | Date picker | Data em que o estado do ciclo de vida foi atribuído. |
| Data de serviço | Date picker | Data em que o local entrou em serviço. |
| Proprietário | Dropdown (seleção única) | Entidade proprietária do local. |
| Partilhado | Dropdown (seleção única) | Indica se o local é partilhado com outros operadores/entidades. |
| Endereço | Texto livre (campo largo) | Morada completa do local físico. |
| Longitude | Numérico (graus) | Coordenada geográfica — valor entre -180 e 180. |
| Latitude | Numérico (graus) | Coordenada geográfica — valor entre -90 e 90. |
| Tolerância | Numérico (metros) | Raio de tolerância em metros para pesquisa geoespacial por proximidade. |
| FID | Texto livre | Identificador externo/funcional do local (Foreign ID). |

#### Ações disponíveis

| Ação | Descrição |
|---|---|
| pesquisar | Executa a consulta com os filtros preenchidos. Campos vazios são ignorados. |
| limpar | Limpa todos os campos de filtro sem executar nova consulta. |
| + criar | Inicia o fluxo de criação de um novo local físico. |

#### Padrões de UX observados

1. Todos os campos de filtro são opcionais; pesquisar sem nenhum filtro retorna todos os registros.
2. Dropdowns com "selecione..." indicam valor padrão vazio (sem filtro aplicado).
3. Coordenadas geográficas têm validação de intervalo explicitada na própria tela (ex.: "Valor entre -180 e 180").
4. Layout em grade com campos agrupados por natureza: identificação, ciclo de vida, responsabilidade, localização geográfica e identificadores externos.
5. Barra de navegação contextual exibe o caminho "Início / Location Manager" para orientação.

---

### 4.1.2 Criar Site

Formulário de criação de um novo local do tipo **Site**. Acessado via botão **+ criar** na tela de pesquisa ou pelo resultado de uma busca.

Breadcrumb: `Início / Location Manager / Locais > resultados da pesquisa / Criar Site`

#### Cabeçalho do formulário

| Elemento | Tipo | Observações |
|---|---|---|
| Tipo de entidade | Dropdown (seleção única) | Seleciona o tipo de local a criar (ex.: Site). Campo no topo do formulário. |
| Nome da entidade | Texto livre | Campo obrigatório — campo em vermelho com ícone × quando não preenchido ao tentar guardar. |

#### Abas do formulário

O formulário é estruturado em 5 abas. Das 5, 3 foram observadas com detalhe:

| Aba | Observada |
|---|---|
| Características | Sim |
| Localização | Sim |
| Compartilhamento | Não (pendente de levantamento) |
| Assistência | Não (pendente de levantamento) |
| Relações | Sim |

---

#### Aba — Características

**Seção: Informação base**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Propriedade | Dropdown | Não | Entidade proprietária do site. |
| Designação | Texto livre | Não | Identificação alternativa do local. |
| Documentação | Dropdown | Sim (*) | Vínculo documental obrigatório. |

**Seção: Estados**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Estado ciclo de vida | Dropdown com botão × | Sim (*) | Valor padrão "Instalado". Botão × permite limpar a seleção. |
| Data estado ciclo de vida | Date picker | Sim (*) | Pré-populada com a data atual (ex.: 2026-06-25). |
| Data de ativação | Dropdown | Não | Seleciona a data de ativação operacional do site. |

**Seção: Atributos específicos**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| CLLI | Texto livre | Não | Common Language Location Identifier — código de identificação padronizado de central. |
| Tipo de Infraestrutura | Texto livre | Não | Classificação da infraestrutura física do site. |

**Seção: Informação STC**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Dados STC: localidade | Texto livre | Não | Localidade conforme integração STC. |
| Dados STC: estação | Texto livre | Não | Estação de referência no sistema STC. |
| Dados STC: localização | Texto livre | Não | Identificação de localização no sistema STC. |

**Seção: Informação adicional**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| ID Fixa | Texto livre | Não | Identificador para a rede fixa. |
| Sitar | Texto livre | Não | Referência ao sistema Sitar. |
| Candidato | Texto livre | Não | Indicação de site candidato em processos de planejamento. |
| Anel | Texto livre | Não | Anel de rede ao qual o site está associado. |
| Observações | Textarea (redimensionável) | Não | Campo livre para anotações operacionais. |

---

#### Aba — Localização

**Seção: Taxonomias**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Localização | Dropdown (seleção única) | Sim (*) | Vínculo à hierarquia de localização/taxonomia do sistema. |

**Seção: Endereços**

Tabela de endereços associados ao site, com suporte a múltiplos endereços.

| Coluna | Descrição |
|---|---|
| Endereço | Morada completa do endereço cadastrado. |
| Principal? | Indica se é o endereço principal do site. |
| Ações | Ações disponíveis por linha. |

Ações da tabela: **editar**, **clonar**, **eliminar** (sobre seleção) e **+ adicionar** (novo endereço).  
Estado vazio: "Não existem registros a apresentar".

**Seção: Coordenadas geográficas**

| Campo | Tipo | Obrigatório | Regra de validação |
|---|---|---|---|
| Longitude | Numérico (graus) | Sim (*) | Valor entre -180 e 180. |
| Latitude | Numérico (graus) | Sim (*) | Valor entre -90 e 90. |

**Seção: Informação Adicional**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Sistema de coordenadas | Texto livre | Sim (*) | Valor padrão pré-preenchido: "WGS84". |
| Região | Dropdown | Sim (*) | Região administrativa/operacional. |
| Regional | Dropdown | Sim (*) | Subdivisão regional. |
| CN | Texto livre | Sim (*) | Campo desabilitado para edição manual — provavelmente calculado/herdado. |
| Endereço legado | Texto livre | Não | Campo desabilitado — importado de sistema legado. |

---

#### Aba — Relações

Tabela de relações entre locais, permitindo modelar dependências e conexões topológicas entre sites.

| Coluna | Descrição |
|---|---|
| Tipo de local A | Tipo do local de origem da relação. |
| Local A | Local de origem. |
| Descrição A | Descrição do polo A. |
| Tipo relação | Natureza da relação entre os dois locais. |
| Tipo de local Z | Tipo do local de destino. |
| Local Z | Local de destino. |
| Descrição Z | Descrição do polo Z. |
| Ações | Ações sobre a relação (editar/eliminar). |

Ação disponível: **+ adicionar** (nova relação entre locais).  
Estado vazio: "Não existem registros a apresentar".

---

#### Ações globais do formulário

| Ação | Comportamento |
|---|---|
| guardar | Salva o site. Dispara validação de campos obrigatórios (*). Campo "nome da entidade" fica em vermelho com ícone × se não preenchido. |
| cancelar | Abandona o formulário sem salvar e retorna à lista de resultados. |

#### Padrões de UX observados

1. Campos obrigatórios marcados com asterisco (*) vermelho ao lado do rótulo.
2. Validação visual imediata no campo "nome da entidade": borda vermelha + ícone × ao tentar guardar sem preenchimento.
3. Formulário em abas — a navegação entre abas não salva parcialmente; o guardar é sempre global.
4. Dropdowns com botão × embutido permitem limpar a seleção sem precisar abrir o dropdown novamente (ex.: Estado ciclo de vida).
5. Campos desabilitados (CN, Endereço legado) indicam valores geridos automaticamente pelo sistema.
6. Estado ciclo de vida pré-definido como "Instalado" e data pré-populada com a data atual simplificam o cadastro operacional padrão.
7. Rodapé da aplicação: "Netwin © 2016 Altice Labs — todos os direitos reservados".

---

### 4.1.3 Criar Ponto de Instalação

Formulário de criação de um local do tipo **Ponto de Instalação**. Estrutura mais enxuta que o "Criar Site": possui apenas 3 abas (sem Compartilhamento e Assistência) e campos específicos diferentes.

Breadcrumb: `Início / Location Manager / Locais > resultados da pesquisa / Criar Ponto de instalação`

#### Diferenças estruturais em relação ao Criar Site

| Aspecto | Criar Site | Criar Ponto de Instalação |
|---|---|---|
| Número de abas | 5 (Características, Localização, Compartilhamento, Assistência, Relações) | 3 (Características, Localização, Relações) |
| Seção Atributos específicos | Sim (CLLI, Tipo de Infraestrutura) | Não |
| Seção Informação STC | Sim | Não |
| Campo Documentação | Sim (obrigatório) | Não |
| Campo Projeto | Não | Sim |
| Campo Fora de padrão | Não | Sim (checkbox) |
| Campo ID SICOM | Não | Sim (dropdown) |
| Campo Data de serviço | Dropdown | Date picker |
| Informação adicional (Características) | ID Fixa, Sitar, Candidato, Anel, Observações | Apenas Observações |
| Seção Informação Adicional (Localização) | Sim (Sistema coord., Região, Regional, CN, Endereço legado) | Não |
| Áreas de estação (Localização) | Não | Sim (tabela derivada de Localização) |
| Informação inserida manualmente | Não | Sim (checkbox em Taxonomias) |

---

#### Aba — Características

**Seção: Informação base**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Proprietário | Dropdown com botão × | Não | Entidade proprietária. Pode vir pré-preenchida (ex.: "Oi"). |
| Projeto | Dropdown | Não | Projeto ao qual o ponto de instalação está associado. |
| Designação | Texto livre | Não | Identificação alternativa do ponto. |
| Fora de padrão | Checkbox | Não | Indica que o ponto não segue o padrão definido. |
| ID SICOM | Dropdown | Não | Identificador no sistema SICOM. |

**Seção: Estados**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Estado ciclo de vida | Dropdown com botão × | Sim (*) | Valor padrão "Instalado". |
| Data estado ciclo de vida | Date picker | Sim (*) | Pré-populada com a data atual. |
| Data de serviço | Date picker | Não | Data de entrada em serviço operacional. |

**Seção: Informação adicional**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Observações | Textarea (redimensionável) | Não | Campo livre para anotações. |

---

#### Aba — Localização

**Seção: Taxonomias**

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Localização | Dropdown (seleção única) | Sim (*) | Vínculo à hierarquia de localização. Seleção preenche automaticamente as Áreas de estação. |
| Informação inserida manualmente | Checkbox | Não | Quando marcado, provavelmente libera edição manual dos campos derivados de localização. |
| Áreas de estação | Tabela derivada (somente leitura) | — | Exibição das áreas de estação inferidas da localização selecionada. Colunas: Estação predial, Localidade, Tipo de rede. |

**Seção: Endereços**

Idêntica ao Criar Site: tabela com colunas Endereço, Principal? e Ações. Ações: editar, clonar, eliminar, + adicionar.

**Seção: Coordenadas geográficas**

| Campo | Tipo | Obrigatório | Regra de validação |
|---|---|---|---|
| Longitude | Numérico (graus) | Sim (*) | Valor entre -180 e 180. |
| Latitude | Numérico (graus) | Sim (*) | Valor entre -90 e 90. |

Observação: a aba de Localização do Ponto de Instalação não possui a seção "Informação Adicional" (sem Sistema de coordenadas, Região, Regional, CN ou Endereço legado), diferente do Site.

---

#### Aba — Relações

Idêntica ao Criar Site: tabela A↔Z com colunas Tipo de local A, Local A, Descrição A, Tipo relação, Tipo de local Z, Local Z, Descrição Z e Ações. Botão + adicionar para nova relação.

---

#### Padrão geral do tipo de local no Netwin

Os prints de Criar Site e Criar Ponto de Instalação revelam que o formulário de criação de locais é **polimórfico**: a estrutura de abas e os campos variam conforme o tipo de local selecionado no cabeçalho. Campos comuns a todos os tipos: nome da entidade, Estado ciclo de vida, Data estado ciclo de vida, Coordenadas geográficas, Endereços e Relações.

## 4.2 Outside Plant

O módulo Outside Plant possibilita a gestão de todos os recursos físicos no terreno. Garante o cadastro da rede física exterior e permite a manipulação de informação georreferenciada em ambiente web browser, com integração cartográfica.

Funcionalidades:

1. Infraestruturas
2. Visão georreferenciada
3. Projeto GPON
4. Operações
5. Histórico
6. Gestão CRE
7. Gestão SAP
8. Pesquisa SAP
9. Ações Massivas
10. Cabos Ópticos

## 4.3 Inside Plant

O módulo Inside Plant permite a gestão das plantas de sala, bastidores e equipamentos, assim como da conectividade local. Possibilita a importação de plantas de edifícios em formato normalizado, permitindo o planeamento e gestão de espaços.

Funcionalidades:

1. Equipamentos
2. Visão física
3. Visão domínio de rede
4. Visão rede móvel
5. Visão armazém móvel
6. Armazém
7. Armazém SAP
8. DID / DG
9. DID / DG

## 4.4 Network & Services

O módulo Network & Services permite a gestão e ocupação de recursos de rede, bem como a gestão de serviços de cliente e serviços de rede.

Funcionalidades:

1. Network & Services
2. Gestão de entidades
3. Domínios tecnológicos
4. Topologias
5. Reestruturações
6. Reestruturar
7. Restaurar
8. Log de Operações

## 4.5 Resource Provisioning

O módulo Resource Provision permite a provisão de serviços de cliente e serviços de rede. Permite também a atribuição de recursos de rede aos serviços de rede.

Funcionalidades:

1. Pesquisas
2. Viabilidade GPON

## 4.6 Reports

O módulo Reports permite a consulta flexível e estruturada da informação gerida pelos diferentes módulos do Netwin. Disponibiliza ainda diversos indicadores úteis para monitorização da informação presente no cadastro.

Funcionalidades:

1. Reports
2. GPON
3. GPON Recursos
4. GPON Viabilidade
5. Histórico
6. Indicadores
7. Equipamentos
8. Locais
9. FTTH Rede
10. FTTH Aprovisionamento
11. Site
12. Controle de Acesso
13. Outside Plant
14. Projeto
15. Survey
16. GPON
17. CRE
18. Inside Plant
19. Atimo
20. Enlaces e Canais
21. Equipamentos
22. Integração MDM
23. Placas e Portas Físicas
24. Portas e Serviços
25. Projeto
26. Download
27. Todos

## 4.7 Catalogue

O módulo Catalogue permite a configuração e inicialização do sistema, dando ao utilizador a flexibilidade de ajustar o Netwin às especificidades do negócio. Inclui definição de atributos, tipificação e caracterização de entidades e criação de modelos e templates nas dimensões de Infraestruturas, Cabos, Equipamentos, Rede e Serviços.

Funcionalidades:

1. Biblioteca de modelos
2. Cabos
3. Equipamentos
4. Inicializações
5. Parâmetros
6. Configurações
7. Importação em massa

## 4.8 Task Manager

O menu Task Manager está presente na navegação principal.

Observação:

1. O detalhamento funcional ainda não foi informado no levantamento atual.

## 4.9 Data Manager

O módulo Data Manager permite fazer a gestão de dados do sistema, possibilitando importar e exportar informação do e para o sistema.

Funcionalidades:

1. Ações massivas
2. Importação em massa

---

## 5. Conclusão prática

O frontend do Netwin está organizado por módulos que cobrem o ciclo completo de inventário e operação: localização, planta externa, planta interna, recursos e serviços, provisão, relatórios, catálogo e gestão de dados. O levantamento atual já permite uma visão operacional consistente do menu e serve como base para aprofundar fluxos de uso por processo.
