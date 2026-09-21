// Re-export de compatibilidade — o componente foi promovido para `components/ui/ScrollFadeTabBar`
// para reuso fora dos painéis de detalhe do Geo (ex.: chips de filtro do Studio > Papéis). Não
// remover: `AddressDetailPanel.tsx`, `ResourcePanel.tsx` e `ProjectDetailPanel.tsx` importam daqui.
export { ScrollFadeTabBar as PanelTabBar } from '../../components/ui/ScrollFadeTabBar';
export type { ScrollFadeTabBarProps as PanelTabBarProps } from '../../components/ui/ScrollFadeTabBar';
