# V.tal Nexus - Design System

Este diretório reúne as diretrizes visuais e de interface do V.tal Nexus.

## Objetivo

Padronizar cores, tipografia, espaçamento, princípios de interface e componentes para todo o produto Nexus.

## Padrão visual vigente

O frontend oficial agora segue a experiência **assistant/workspace** importada do projeto Lab001:

- Shell lateral clara (`#F8FAFC`) com navegação colapsável.
- Canvas claro (`#E7EAF0`) com cards brancos e borda `#D7DEE8`.
- Acento V.tal amarelo `#FFD200` usado em ações primárias, foco e chips ativos.
- Composer central como ponto de entrada da experiência.
- Cards com raio maior, sombra suave e densidade operacional.
- Domínios Nexus preservados na navegação: Assistente, Geo, Resource, Service e Order.
- Cabeçalhos de página são contextuais: título por domínio/aba, ícone à esquerda, hint curto como subtítulo e ações compactas na mesma linha.
- Quando houver visões irmãs, a troca acontece por botões apenas com ícone, alinhados à direita do título, com `aria-label` e `title`.
- Ações primárias e destrutivas em barras de página devem preferir botões icon-only quando o significado for evidente no contexto.

## Fontes de referência

- Frontend oficial em `web/src`, baseado na UX/UI do Lab001.
- Direcionadores técnicos do produto Nexus.
- Tokens em `docs/03-design-system/tokens/`.
- Componentes e UI kits em `docs/03-design-system/components/` e `docs/03-design-system/ui_kits/`.
- Guidelines canônicos em `docs/03-design-system/guidelines/`, com destaque para `page-chrome.md` como referência de cabeçalhos e barras de ação.

## Diretrizes-base

- Priorizar consistência visual sobre criatividade local.
- Reutilizar componentes antes de criar novas variações.
- Manter linguagem técnica e corporativa em português do Brasil.
- Usar o padrão assistant/workspace como base: sidebar clara, composer, cards suaves e navegação por domínio.
- Evitar soluções genéricas que descaracterizem o produto.
