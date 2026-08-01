# Relatório do Frontend do NOSSIS (NOSSIS One Inventory)

## 1. Contexto do sistema

O NOSSIS One Inventory é uma evolução do sistema NETWIN, mantendo a mesma proposta institucional: um sistema unificado de cadastro, responsável pelas funções de projeto, construção e cadastro de rede. Suporta os processos de planeamento, construção e provisão de rede e serviços de telecomunicações. A interface foi redesenhada (nova identidade visual "nossis one inventory", Altice Labs 2023, contra a versão Netwin de 2016), e a navegação foi reorganizada em um menu horizontal mais compacto, com agrupamentos por sigla (LOCAIS, OSP, ISP, S&R) e um menu adicional "..." que concentra funcionalidades de processos, topologias, projetos, relatórios e gestão.

## 2. Principais funcionalidades do NOSSIS

- Cadastro de redes e serviços.
- Gestão de recursos lógicos de rede.
- Projeto e construção de rede física e lógica.
- Provisão de serviços de rede.
- Reserva e alocação de recursos.
- Gestão de capacidade.
- Cadastro georreferenciado de infraestruturas de rede física (exterior).
- Flexibilidade de adaptação aos processos de negócio.

(Nota: a lista é idêntica à do Netwin, na mesma ordem de importância declarada pelo sistema, apenas com reordenação de dois itens — indício de que a base funcional pretendida é a mesma, herdada do Netwin.)

## 3. Resumo inicial: menu principal e propósito

| Menu principal | Propósito |
|---|---|
| LOCAIS | Gestão de locais físicos, divisões administrativas e roteiro de endereços (equivalente ao Location Manager). |
| OSP (Outside Plant) | Visão georreferenciada da rede exterior e integração com GISMaps. Estrutura enxuta em comparação ao Netwin. |
| ISP (Inside Plant) | Visão física e de domínio de rede, gestão de armazém e de CPEs. |
| S&R (Services & Resources) | Gestão de entidades, recursos e serviços de rede/cliente (equivalente ao Network & Services). |
| Processos (em "...") | Provisão (viabilidade, reserva, gestão de ordens), operações e histórico FTTx, e carregamento massivo de dados. |
| Topologias (em "...") | Item de menu próprio, ainda sem detalhamento (pendente de levantamento). |
| Projetos (em "...") | Item de menu próprio, ainda sem detalhamento (pendente de levantamento). |
| Relatórios (em "...") | Consulta estruturada de informação, organizada em Locations, Outside Plant e Inside Plant. |
| Gestão (em "...") | Configuração do sistema: biblioteca de modelos (cabos), parametrizações (inicializações, templates de equipamentos) e histórico (entidades, CPE). |
| Funções Assurance (app switcher) | Grupo de aplicações externas ligadas à segurança/assurance, acessível via ícone de grade no topo (fora do menu principal). |

**Observação preliminar:** comparado ao menu do Netwin (9 módulos de topo, todos visíveis diretamente na barra), o NOSSIS concentra menos módulos na barra principal (4: LOCAIS, OSP, ISP, S&R) e empurra o restante para o menu "...", com uma profundidade maior de submenus (até 3 níveis, ex.: Gestão > Parametrizações > Templates de equipamentos). Também não localizei ainda, na navegação, um equivalente direto ao Task Manager do Netwin (gestão de tarefas de rede móvel) — a confirmar ao explorar os módulos com detalhe.



Explorei todo o módulo LOCAIS do NOSSIS (Pesquisa, Locais físicos, Divisões administrativas, Roteiro de endereços, e os fluxos de criação de Site, Ponto de Instalação e Endereço de Roteiro). Segue a seção 4.1 completa, no mesmo padrão do relatório do Netwin.


# Relatório do Frontend do NOSSIS (atualização consolidada — Locais e OSP)

## 4. Detalhamento por módulo

### 4.1 LOCAIS

O módulo LOCAIS é responsável pela gestão do inventário de locais físicos da rede: Sites, Pontos de Instalação, Divisões Administrativas (referência geográfica/censitária) e Roteiros de Endereço. É o módulo equivalente ao "Locais"/"Localização" do Netwin, porém com formulários mais ricos e unificados.

**Funcionalidades:**
- Pesquisa (com 3 sub-buscas: Locais físicos, Divisões administrativas, Roteiro de endereços)
- Criação de Ponto de Instalação, Site e Endereço de Roteiro
- Edição, clonagem e eliminação de registros
- Exportação de resultados (PDF/XLSX/CSV)

#### 4.1.1 Pesquisa — sub-aba "Locais físicos"

| Campo | Tipo | Observações |
|---|---|---|
| Nome | Texto | |
| Descrição | Texto | |
| Divisão administrativa | Dropdown (busca) | |
| Tipo | Dropdown | |
| Estado ciclo vida | Dropdown | Opções: Abatido, Desinstalado, Em desinstalação, Instalado, Projetado |
| Data estado ciclo vida | Data | |
| Data de serviço | Data | |
| Proprietário | Dropdown | Opções: NETWIN, VIVO |
| Compartilhado | Dropdown | Opções: Não, Sim |
| Endereço | Texto | |
| Longitude / Latitude | Numérico | |
| Tolerância (m) | Numérico | Default: 100 |
| Sistema Externo | Dropdown | Opção observada: Doca |
| ID Sistema Externo | Texto | |
| UID | Texto | |

Ações: **Pesquisar**, **Limpar**.

Grid de resultados: colunas Nome, Tipo, Descrição, Proprietário, Localização, Ações; 219 registros de amostra; paginação 10/25/50/100; exportação PDF/XLSX/CSV; seleção em massa + eliminar; menu por linha (editar/clonar/eliminar).

#### 4.1.2 Pesquisa — sub-aba "Divisões administrativas"

| Campo | Tipo | Observações |
|---|---|---|
| Nome | Texto | |
| Descrição | Texto | |
| Divisão administrativa | Dropdown | |

Ações: **Pesquisar**, **Limpar**. Grid com mesmas colunas da anterior; 57.142 registros (base de referência nacional, ex.: AAA APIACA, AAAA AGUA DA ANTA); somente consulta, sem botão Criar.

#### 4.1.3 Pesquisa — sub-aba "Roteiro de endereços"

| Campo | Tipo | Observações |
|---|---|---|
| Tipo | Dropdown | Opções: Roteiro Brasil, Roteiro de produto |
| Nome | Texto | |

Ações: **Pesquisar**, **Limpar**. Grid: colunas Tipo de roteiro, Rua, Ações; 8 registros; botão **+ Criar** disponível direto nesta grid.

#### 4.1.4 Criar Site

Caminho: Locais físicos > Criar > Site. Cabeçalho: dropdown "Tipo de entidade" (Selecionar) + campo texto "introduza o nome da entidade". Botões: Cancelar / Salvar e Continuar / Salvar. Contém 6 abas.

**Aba Características**

| Seção | Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|---|
| Informação Base | Descrição | Texto | Não | |
| | Abreviatura | Texto | Não | |
| | Proprietário | Dropdown | Não | NETWIN, VIVO |
| | Projeto | Dropdown | **Não** | Lista projetos já existentes (ver seção 4.2.3 — descoberta) |
| Estados | Estado ciclo vida | Dropdown | **Sim (\*)** | Default "Instalado"; opções: Desinstalado, Em desinstalação, Instalado, Projetado |
| | Data estado ciclo vida | Data | **Sim (\*)** | Pré-preenchida com data atual |
| | Estado de projeto | Dropdown | Não | Em Aceitação - atualizar cadastro / cadastro concluído / cadastro validado; Em Construção; Projeto em Retificação |
| | Data estado de projeto | Data | Não | |
| | Data de serviço | Data | Não | |
| Informação Adicional | Observações | Textarea | Não | |

**Aba Localização**

| Seção | Campo | Tipo | Observações |
|---|---|---|---|
| Taxonomias | Localização | Dropdown | |
| | Rede | Dropdown | |
| | Operacional | Dropdown | |
| Áreas de Central | Local / Localidade / Tipo de rede | Tabela | Vazia por padrão ("Não existem registros a apresentar") |
| Moradas | Endereço / Principal? / Sistemas Externos / Ações | Tabela | Bulk eliminar + Adicionar |
| Coordenadas Geográficas | Sistema de coordenadas | Dropdown | Default WGS84 |
| | Longitude / Latitude | Numérico | |

**Aba Partilhas**

| Campo (colunas da tabela) | Observações |
|---|---|
| Nome, Operador, Tipo, Estado, Ações | Tabela vazia por padrão; bulk eliminar + Adicionar |

**Aba Assistência e Acesso**

| Sub-seção | Colunas | Observações |
|---|---|---|
| Controlo de Acesso | Tipo de acesso, Observação, Localização, Ações | Bulk eliminar + Adicionar |
| Períodos de Acesso | Dia da semana, Data de Início, Data de Conclusão, Início, Fim, Ações | Bulk eliminar + Adicionar |

**Aba Relações**

| Colunas da tabela |
|---|
| Tipo de local A, Local A, Descrição A, Tipo relação, Tipo de local Z, Local Z, Descrição Z, Ações |

Idêntica ao Netwin. Botão Adicionar.

**Aba Imagens** (sem equivalente no Netwin)

Área de drag-and-drop de upload; estado vazio: "Não existem ainda imagens associadas".

**Validação:** ao tentar salvar com campos obrigatórios ausentes, exibe banner superior "Não é possível salvar o formulário. Por favor verifique os campos assinalados." (diferente do padrão inline com borda vermelha usado no Netwin).

#### 4.1.5 Criar Ponto de Instalação

Estrutura quase idêntica ao Site, porém com apenas **5 abas** (sem "Assistência e Acesso"): Características, Localização, Partilhas, Relações, Imagens. Os campos das abas Características e Localização são **campo-a-campo idênticos** aos do Site (mesma tabela acima) — uma simplificação/unificação em relação ao Netwin, onde Site e Ponto de Instalação tinham conjuntos de campos distintos (polimorfismo mais acentuado).

#### 4.1.6 Criar Endereço de Roteiro

Caminho: Roteiro de endereços > Criar. Apenas 1 aba (Características). Botões: Cancelar / Salvar (sem "Salvar e Continuar").

| Seção | Campo | Tipo |
|---|---|---|
| Taxonomia de Localização | Localização | Dropdown |
| | UF | Texto (auto/readonly aparente) |
| | Município | Texto |
| | Localidade | Texto |
| Coordenadas Geográficas | Longitude | Numérico |
| | Latitude | Numérico |

**Padrões de UX observados (Locais):** navegação por abas verticais à esquerda (ícones) para trocar entre as 3 sub-buscas; tabelas de sub-entidades sempre com padrão "0 selecionado(s) / eliminar / Adicionar" e estado vazio textual; validação por banner global em vez de inline.

---

### 4.2 OSP

O módulo OSP é o visualizador georreferenciado (mapa) do inventário de rede externa, equivalente ao "OSP"/"Visão Geográfica" do Netwin, mas com camadas, ferramentas de medição, geração de esquemáticos e utilitários de importação/exportação bem mais desenvolvidos.

**Funcionalidades:** Visão georreferenciada, GISMaps.

#### 4.2.1 Visão georreferenciada — navegação e mapa

Base: mapa OpenStreetMap. Painel esquerdo: campo "Elemento" (busca) + árvore expansível "Mais Opções" (Brasil > Estado > Município > Localidade).

Barra de ferramentas superior esquerda: pan, zoom+, zoom-, centralizar, ajustar extensão, atualizar, desfazer, refazer, **Ferramentas de medida** (dropdown: Área / Distância / Comprimentos de Traçados), atualizar, cancelar/limpar, tela cheia.

#### 4.2.2 Painéis da barra de ferramentas superior direita

| Ícone/Painel | Campos | Observações |
|---|---|---|
| **Filtro** | Projeto (busca texto), Estado ciclo de vida (busca texto), Proprietário (busca texto), Localização (busca texto) | Seções colapsáveis; botões filtrar/limpar |
| **Relatório** | Relatório de (dropdown), Método de Seleção (dropdown), Área atual (m²), Área máxima (m²), Texto para cabeçalho | Botões gerar/limpar |
| **Pesquisa** | Endereço (busca, limitada a 200 registros), Id do endereço de sistema externo (dropdown + busca), UID (busca) | |
| **Impressão** *(novo, detalhado nesta revisão)* | Tipo de impressão (dropdown, ex. "Área Visível"), Papel\* (ex. A0), Escala\*, checkboxes: Legenda, Layers Visíveis, Grelha Lon./Lat., Página única, Sobreposição de páginas (mm) | Botão "gerar pdf"; seção **Atributos**: Projeto, Descrição, Aprovado por, Localidade, Município, Estação, Célula, Cabo, Mapa Urbano, Número do Cabo |
| **Ferramentas** (gerador de esquemático) | UF\*, Município\*, Localidade\*, Estação abastecedora, Tecnologia\*, Tipo de esquemático\*, Tipo de Equipamento\*, Equipamento\*, Tipo de Ponto de instalação\*, Ponto de instalação\*, Fonte\*, Número do Cabo\*, checkbox "Locais intermédios" | Botão gerar + checkbox "Abrir em nova janela"; histórico (Criado por/Data) |
| **Utilitários** (dropdown) | Dados de Sessão, Exportação, Importador, Projetos | Detalhado abaixo |

**Layer Switcher** (canto superior direito do mapa): Layers Base, Overlay de cartografia, Rede Fixa, Limites, Locais, Estações Abastecedoras, Rede Móvel, Notas, Projetos GPON, Overlays (dados importados) — todos com checkbox de visibilidade.


**1. Layers Base**
- Open Street Maps (mapa base, radio button)

**2. Overlay de cartografia**
- Overlay de cartografia

**3. Rede Fixa**
- **Traçados**
  - Elementos: Autossustentável, Aéreo com folga, Cordoalha, Aéreo tensionado, Travessia de Pontes, Caminho Cabo Enterrado, Dutos, Perfuração, Galeria ou Túnel, Vala de jardim, Calha, Interior à vista, Interior em tubo, Vala, Em fachada *(14 tipos)*
  - Legendas *(rótulos dos mesmos 14 tipos acima)*
- **Grupo de dutos**
  - Dutos de condutas → Elementos, Legendas, Legendas de cabos
  - Micro dutos *(mesma estrutura interna de Dutos de condutas, não expandida individualmente)*
- **Equipamentos**: Óptico, Atenuação, Cobre, Coaxial - DOCSIS, Coaxial - Energia
- **Cabos**
  - Caminho → Óptico, Cobre, Coaxial - DOCSIS, Coaxial - Energia
  - Ponto a ponto, Caminho incompleto, Ponto a ponto incompleto *(mesma estrutura de "Caminho", inferida por simetria)*
- **Surveying**: Área de Influência (Coaxial), Área de Influência (Óptico), Área de Influência (Cobre), Survey, Legendas
- **Célula**: Células GPON (Primária), Células GPON (Secundária), Células HFC (1Ghz Altice 1), Células HFC (1Ghz Altice 2), Células Cobre
- **Folgas**: Símbolo, Legendas

**4. Limites**
- CAOP DB, Grid DB Low Density, Grid DB High Density

**5. Locais**
- Elementos: Armário, Caixa Subterrânea, Caixa de distribuição, Caixa de distribuição ótica, Caixa de juntas, Cliente, Contentor, Duto, Edifício, Indefinido, Indoor, Infraestrutura rádio, Lockbox, Mastro, Nó fictício infraestrutura, Outro operador, Poste, Rooftop, Site indefinido, Site móvel, Solução integrada, Subterrâneo, Torre *(22 tipos — corresponde aos tipos de Site/Local físico do módulo LOCAIS)*
- Legendas *(rótulos dos mesmos 22 tipos)*
- Âncoras

**6. Estações Abastecedoras**
- Estações Abastecedoras

**7. Rede Móvel**
- Células Rede Rádio: Célula 2G, Célula 3G, Célula LTE
- Equipamentos: Rede Acesso (Móvel), Rede Core (Móvel)

**8. Notas**
- Notas Permanentes: Pontos, Linhas
- Notas Temporárias: Pontos, Linhas

**9. Projetos GPON**
- Área, Legendas

**10. Overlays (dados importados)**
- Pontos, Linhas, Polígonos, Legendas de pontos, Legendas de linhas, Legendas de polígonos

Resumindo: ao todo são **10 grupos principais**, totalizando mais de **70 camadas/visões individuais** habilitáveis/desabilitáveis, cobrindo desde a infraestrutura física completa (traçados, dutos, cabos, equipamentos ópticos/cobre/coaxial, células GPON/HFC) até rede móvel (2G/3G/LTE), notas colaborativas e overlays de dados importados via DXF.



#### 4.2.3 Utilitários — detalhamento

**Dados de Sessão**

| Campo | Tipo | Observações |
|---|---|---|
| Projeto | Texto | Botões salvar/limpar |

*Descoberta:* este painel define um **"projeto ativo" no escopo da sessão do usuário**, aparentemente para contextualizar automaticamente as próximas operações/telas com aquele projeto — mecanismo distinto do campo "Projeto" (opcional) presente nos formulários de Site/Ponto de Instalação.

**Exportação**

| Campo | Tipo | Observações |
|---|---|---|
| Nome do arquivo | Texto | |
| Formato\* | Dropdown | Ex.: DXF |
| Sistema de coordenadas (EPSG) | Texto | Default 4326 |
| Layers Visíveis | Checkbox | |
| Área | Radio | Atual / Selecionar |
| Arquivos | Tabela (Nome) | Botão "remover arquivos" |

Botão: **exportar**.

**Importador** *(mecanismo de criação de entidades via arquivo)*

| Elemento | Observações |
|---|---|
| Formato | Dropdown (DXF) |
| Lista de importações | Busca + tabela Nome/Criado por, paginação |
| Importador | Botões "selecione o arquivo" / "enviar" + área de arrastar arquivo |

**Projetos** *(mecanismo de criação de projetos)*

Lista: colunas Nome, Criado por; botão **+ adicionar**; 5 projetos de amostra (Teste_VTAL, TESTE QA, TESTE1, T_PAT, t5 — todos "Criado por: External Sys"); ícones por linha: bloqueio, excluir (X), visualizar (lupa), configurações (engrenagem), documento, marcador. Botão "atualizar".

**Formulário "Criar Projeto"** (abre em nova aba/janela): cabeçalho fixo "Projeto" + campo Nome.

| Seção | Campo | Tipo | Obrigatório |
|---|---|---|---|
| Informação Geral | Descrição | Texto | Não (sem asterisco observado) |
| Informação Base | Abreviatura | Texto | Não |
| | Código externo | Texto | Não |
| | Data alvo | Data | Não |
| Informação Contextual | Parceiro | Dropdown | Não |
| | Área | Texto | Não |
| | URL do repositório externo | Texto | Não |
| Sistema Externo | Sistema Externo | Texto | Não |
| Informação Adicional | Comentários | Textarea | Não |

Botões: Cancelar / Salvar e Continuar / Salvar.

#### 4.2.4 GISMaps

Segunda opção do menu OSP (visualizador GIS alternativo/complementar) — ainda não detalhado a nível de campos nesta rodada.

#### 4.2.5 Descoberta: criação de entidades dentro do OSP

Respondendo à pergunta levantada anteriormente ("dá para criar sites/recursos dentro do OSP?"): o módulo OSP **não é apenas consulta**, mas suas vias de criação são indiretas, diferentes da criação direta de Site/Ponto de Instalação (que ocorre no módulo LOCAIS):

- **Importador**: permite subir arquivos DXF para importar geometria/dados para o sistema.
- **Projetos**: permite criar projetos de rede (formulário acima), que depois podem opcionalmente ser associados a Sites/Pontos de Instalação criados via LOCAIS.
- **Confirmado nesta rodada**: o campo "Projeto" no formulário de Site/Ponto de Instalação **não é obrigatório** (sem asterisco) — ou seja, **não é necessário criar um projeto previamente** para cadastrar um Site ou Ponto de Instalação; o projeto é apenas um agrupador opcional.
- Não foram encontradas ferramentas de desenho/criação de geometria diretamente sobre o mapa (ex.: desenhar um ponto/linha e convertê-lo em recurso) nas ferramentas testadas até agora.

**Padrões de UX observados (OSP):** painéis laterais direitos empilháveis (cada ícone abre/fecha seu próprio painel, múltiplos podem ficar abertos simultaneamente com "x" para fechar); formulários de utilitários mais simples, sem abas; uso extensivo de campos com asterisco vermelho para obrigatoriedade nas ferramentas de geração de esquemático, mas ausência de obrigatoriedade nos formulários de Projeto.

Login recuperado e exploração do módulo ISP concluída. Segue a seção 4.3 consolidada, no mesmo padrão das anteriores.

---

## 4.3 Módulo ISP (Inside Plant / Equipamentos)

O módulo **ISP** trata do inventário de equipamentos ativos (rede interna/CPEs, bastidores, placas) em oposição ao OSP, que trata da infraestrutura passiva (dutos, cabos, sites). Ele é organizado em 4 visões, acessadas por um submenu.

**Particularidade de UI**: ao contrário de LOCAIS/OSP, clicar diretamente no rótulo "ISP" navega para a visão padrão ("Visão física"), sem abrir o dropdown. Para acessar as demais opções é necessário clicar numa pequena seta separada, ao lado do rótulo, que então revela o menu suspenso.

**Funcionalidades:**
- Navegação em árvore geográfica/hierárquica dos equipamentos instalados (Visão física)
- Navegação em árvore por domínio lógico de rede (Visão domínio de rede)
- Consulta de equipamentos em armazém/estoque (Armazém)
- Consulta e edição de CPEs (equipamentos na casa do cliente: ONTs, modems, etc.)

### 4.3.1 Visão física

Árvore geográfica no painel esquerdo com campo de busca "Elemento" (permite localizar qualquer equipamento pelo nome e exibir automaticamente o caminho completo na árvore) e opção "Mais Opções". A hierarquia observada, ao pesquisar um equipamento (ex.: "ONT4"), foi:

`[BRASIL] Brasil > [RJ] RIO DE JANEIRO (estado) > RIO DE JANEIRO (cidade) > [RJO] RIO DE JANEIRO (bairro/distrito) > SDU > [SDU151] (site) > ONT (tipo de equipamento) > [EQ] ONT4 (instância)`

Ao selecionar um equipamento folha, abre à direita um formulário de **consulta (somente leitura)** com os mesmos 5 separadores documentados adiante em CPEs (Características, Localização, Estrutura Física, Outros, Serviços suportados). Ao navegar diretamente pela árvore (sem buscar por nome), os nós de bairro/site não exibiram conteúdo ao serem clicados isoladamente — o caminho só é totalmente carregado quando se chega a um equipamento folha (via busca ou expansão completa).

### 4.3.2 Visão domínio de rede

Mesma UI de árvore (campo "Elemento" + "Mais Opções"), porém organizada por domínio lógico de rede em vez de localização geográfica, com raiz chamada "Raiz". Neste ambiente de desenvolvimento a árvore não apresentou elementos filhos ao ser expandida — a funcionalidade existe mas não há dados de domínio de rede cadastrados/visíveis para o usuário testado.

### 4.3.3 Armazém

Tela de consulta de equipamentos em estoque (ainda não instalados em campo ou retirados).

| Campo | Tipo | Opções | Observações |
|---|---|---|---|
| Entidade | Dropdown | Todos / Equipamento / Bastidor / SubBastidor / Placa | Filtra por tipo de item |
| Armazém | Dropdown | AMZ1 / AMZ2 | Armazéns físicos cadastrados |
| Estado Ciclo de Vida | Dropdown | Instalado / Projetado / Abatido / Desinstalado / Em desinstalação | Igual ao usado em LOCAIS e CPEs |
| Estado Operacional | Dropdown | Fora de Serviço / Reparação / Serviço / Avariado / Em Manutenção | |
| Nº série | Texto | — | |
| Nº SAP | Texto | — | |
| Nº ticket | Texto | — | |
| Data Armazenamento | Data | — | |

Resultado: grade com colunas Armazém, Data armazenamento, Nome, Fabricante, Modelo, Estado Ciclo de Vida, Estado Operacional, Nº série, Nº SAP, Nº ticket (46 registros para AMZ1 nos testes).

### 4.3.4 CPEs

Tela de consulta e edição de equipamentos de cliente (CPE — Customer Premises Equipment).

**Filtro de pesquisa:**

| Seção | Campo | Tipo | Opções/Observações |
|---|---|---|---|
| Equipamento | Taxonomia | Fixo | "CPE" |
| Equipamento | Tipo | Dropdown | Selecione... / ONT |
| Equipamento | Fabricante | Dropdown | Dependente de dados |
| Equipamento | Modelo | Dropdown | Dependente do fabricante |
| Equipamento | Nome | Texto | |
| Equipamento | Nº Serie | Texto | |
| Equipamento | Nº SAP | Texto | |
| Equipamento | Endereço MAC | Texto | |
| Serviço | Tipo | Dropdown | 31 opções (CFS.FTTH.BASICO, CFS.HSI, CFS.IPTV, CFS.VOIP, CFS.xDSL, CFS.SVLAN, CFS.PON etc.) |
| Serviço | Nome | Texto | |
| Serviço | Nome Produto/Serviço | Texto | |
| Estados | Estado ciclo de vida | Dropdown | Selecione... / Abatido / Desinstalado / Em desinstalação / Instalado / Projetado |

Resultado: grade com Taxonomia, Tipo, Nome, Fabricante, Modelo, Nº Serie, Nº SAP, Endereço MAC, Tipo serviço, Nome serviço, Nome Produto/Serviço, Estado ciclo de vida, e ícones de ação (editar, visualizar, excluir, configurações).

**Formulário "Alterar" (edição de CPE) — 5 separadores:**

*Características:*

| Campo | Tipo | Obrigatório | Observações |
|---|---|---|---|
| Tipo | Dropdown (readonly no exemplo) | Sim | ex. "ONT" |
| Nome | Texto | Sim | |
| Subtipo | Dropdown | Não | |
| Designação | Texto | Não | |
| Abreviatura | Texto | Não | |
| Taxonomia | Texto (readonly) | — | "CPE" |
| Fabricante | Dropdown | Sim | |
| Modelo | Dropdown | Sim | |
| Template | Dropdown | Não | |
| Proprietário | Dropdown | Não | ex. "VIVO" |
| Fornecedor | Dropdown | Não | |
| Nº série | Texto | Não | |
| SW Instalado | Texto | Não | |
| Versão SW | Texto (com busca) | Não | |
| Código HW | Texto | Não | |
| Nº SAP | Texto | Não | |
| Nome projeto | Texto | Não | |
| Projeto | Dropdown | Não | Associação opcional, mesmo padrão de LOCAIS/OSP |
| Data projeto | Data | Não | |
| Ciclo de vida | Dropdown | Sim | Instalado/Projetado/Abatido/Desinstalado/Em desinstalação |
| Data ciclo de vida | Data | Não | |
| Data primeira instalação | Data | Não | |
| Operacional | Dropdown | Sim | Fora de Serviço/Reparação/Serviço/Avariado/Em Manutenção |
| Data operacional | Data | Não | |
| Provisão | Dropdown | Sim | ex. "Ocupado" |
| Data provisão | Data | Não | |
| Data de instalação | Data | Não | |
| Endereço IPv4 | Texto | Não | |
| Máscara IPv4 | Texto | Não | |
| Gateway IPv4 | Texto | Não | |
| Endereço IPv6 | Texto | Não | |
| Rede IPv6 | Texto | Não | |
| Gateway IPv6 | Texto | Não | |
| Endereço Mac | Texto | Não | |
| Data de aquisição | Data | Não | |
| Observações | Área de texto | Não | |

*Localização:* Localização (caminho hierárquico da taxonomia geográfica, somente leitura, com ícone para visualizar) + Endereços: Endereço (texto, readonly no exemplo) e Fração (dropdown).

*Estrutura Física:* três grades somente-consulta (sem formulário de criação nesta tela): Bastidores (Nome/Modelo/Fabricante/Taxonomia/Fila-Lado/Posição/Localização), Sub-bastidores (Nome/Tipo/Modelo/Fabricante/Taxonomia/Bastidor), Placas (Nome/Modelo/Bastidor/Sub-bastidor/Slot-Sub-slot/UF).

*Outros:*

| Campo | Tipo | Observações |
|---|---|---|
| Quantidade | Texto | |
| GUID | Texto | |
| Código Produto e Serviço | Texto | |
| Sistema de origem | Texto | |
| Telemanutenção | Texto | |
| Regime | Dropdown | |
| Fim do Contrato de Aluguel | Data | |
| Contrato de Manutenção? | Dropdown | |
| Inic. Contr. Manutenção | Data | |
| Fim Contr. Manutenção | Data | |

*Serviços suportados:* grade (vazia no registro consultado — provavelmente lista os serviços lógicos ativos sobre o CPE).

**Padrões de UX observados:** o campo "Projeto" segue opcional em todas as entidades do sistema (Site, PI, CPE) — confirma o padrão já visto em LOCAIS/OSP. Os estados "Ciclo de vida", "Operacional" e "Provisão" formam um conjunto consistente de 3 máquinas de estado usado em quase todas as entidades físicas do NOSSIS.

**Comparação com Netwin:** o Netwin não possuía uma visão dedicada de "domínio de rede" separada da visão geográfica; o NOSSIS introduz essa segunda dimensão de navegação (lógica vs. física), embora sem dados populados no ambiente testado.


