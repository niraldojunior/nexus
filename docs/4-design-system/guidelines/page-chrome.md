# Page Chrome

## Objetivo

Padronizar o topo de páginas operacionais Nexus para que novas interfaces reutilizem a mesma estrutura de cabeçalho, hint e ações.

## Padrão

- O título da página deve ser contextual ao conteúdo visível.
- O título deve usar o ícone da entidade ou do domínio à esquerda.
- Abaixo do título deve existir apenas um hint curto, descritivo e não redundante.
- Se houver visões irmãs, a troca deve ocorrer por botões icon-only à direita do título.
- Botões icon-only devem ter `aria-label` e `title` com nome da entidade e descrição breve.
- Ações primária e destrutiva podem compartilhar a mesma faixa visual, desde que ambas usem o mesmo tamanho e o texto seja omitido quando o ícone já for suficiente no contexto.
- Não repetir rótulos técnicos redundantes quando o título já informa a entidade.

## Uso

- Use esse padrão em páginas de inventário, catálogos, qualificações, listas de entidades e telas operacionais com alternância entre visões irmãs.
- Não use esse padrão para telas de composição, assistentes ou fluxos de formulário em etapas, que seguem outra hierarquia.
