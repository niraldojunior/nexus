# Editores master/detail do Studio

## Objetivo

Editores de catálogo e configuração do Studio devem separar uma coleção à esquerda de um detalhe à direita, mantendo um único ciclo global de governança: **Editar**, **Cancelar** e **Publicar**.

## Painel da coleção

- O painel possui título claro e ações no cabeçalho.
- A busca inicia oculta. A lupa a alterna com `aria-pressed`, rótulo acessível e foco automático ao abrir.
- Ao fechar a busca, o filtro é limpo; nenhuma restrição pode permanecer invisível.
- Quando o tipo do item puder ser preenchido no detalhe, “+” cria um placeholder, o seleciona e abre sua aba Geral. Evite modal de criação intermediário.
- Use `StudioCollectionHeader` como referência de implementação para o título e a lupa.

## Painel de detalhe

- Fora de um draft, o detalhe é somente leitura.
- Dentro de um draft, os campos editáveis aparecem inline. Não acrescente botões locais **Editar** ou **Salvar** quando a governança global controla a sessão.
- Campos só ficam restritos após a criação quando a materialização também não suporta a alteração. Se o domínio validar e aceitar a mudança na publicação — como a categoria de um tipo de local, que o adaptador encaminha e o serviço valida antes de persistir —, o campo permanece editável mesmo para itens já persistidos, não apenas em placeholders. Identificadores técnicos (`code`) continuam nunca editáveis nem exibidos, pois servem a snapshots e relações de contenção.
- Características aparecem em lista resumida (nome, grupo e tipo). A criação e edição acontecem em modal de uma característica por vez; a remoção segue a ação de lixeira da lista.

## Persistência

Há dois modelos válidos e eles não devem ser misturados:

1. **Snapshot local:** a tela altera apenas estado local durante o draft e captura o snapshot no `beforePublish`. É o padrão para configurações materializadas por adaptador, como Locais e Experiência no Mapa.
2. **Autosave canônico:** a tela atualiza o domínio imediatamente, fornece `flush` antes de publicar e usa a baseline para restauração no cancelamento. É o comportamento legado de Modelagem de Recursos.

Novos editores devem preferir snapshot local quando o domínio já tiver um `StudioDomainAdapter` que valida e materializa o snapshot. Sempre preservar os identificadores internos exigidos pelo domínio, mesmo quando eles não devem ser exibidos na interface.
