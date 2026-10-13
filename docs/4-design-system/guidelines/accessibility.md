# Acessibilidade — checklist por componente

Alvo: **WCAG 2.2 AA**. Este checklist vale para todo componente novo ou alterado em `web/src` e é a referência das ondas de a11y (#356, #357).

## Checklist

| Item           | Regra                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Nome acessível | Todo controle só-ícone tem `aria-label`; ícones decorativos levam `aria-hidden="true"`.                                         |
| Teclado        | Tudo que clica é `button`/`a` ou tem `role` + `tabIndex` + `Enter`/`Espaço`. Sem armadilha de foco; `Esc` fecha modais e menus. |
| Foco visível   | Nunca remover o outline sem substituto; usar o anel do design system.                                                           |
| Estado         | Estado ativo/selecionado exposto por atributo (`aria-current`, `aria-selected`, `aria-pressed`, `aria-sort`), não só por cor.   |
| Cor            | Status nunca depende só de cor: `TonePill` (cor + texto). Cores vêm de tokens (`--status-*`, `--on-status-solid`).              |
| Alvos          | Alvo de toque ≥ 24×24 px (WCAG 2.2 · 2.5.8).                                                                                    |
| Movimento      | Respeitar `prefers-reduced-motion` (regra global em `web/src/index.css`).                                                       |
| Carregamento   | Ação assíncrona usa `Button loading` (spinner, `aria-busy`, desabilitado); tabela usa `DataTable loading`.                      |
| Camadas        | Usar `--z-sticky/dropdown/overlay/modal/toast` e `--scrim`, nunca números soltos.                                               |

## Padrões de componente

- **Abas**: contêiner `role="tablist"` com `aria-label`; cada aba `role="tab"` + `aria-selected` (`PanelBarButton asTab`, `TabSelector`). Navegação por seção (Studio, Configurações): `<nav aria-label>` com botões `vt-sb-btn` e `aria-current="page"`.
- **Tabela (`DataTable`)**: coluna ordenável usa `sortable` + `sort`/`onSortChange` e expõe `aria-sort`; `stickyHeader` fixa o cabeçalho; `loading` mostra linhas-esqueleto com `aria-busy`.
- **Status**: `TonePill` é a base; `StatusBadge` e `PrecisionBadge` são adaptadores.
- **Áreas em construção**: sinalizar com o selo "Em breve" no item de navegação.

## Verificação

`npm run lint`, `npm run typecheck` e os testes Testing Library consultando por `role` (`tab`, `button`, `columnheader`). Contraste e ordem de tabulação ainda exigem validação em runtime (axe).
