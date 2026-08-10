// Medidas únicas da doca esquerda da página Locais. A barra de pesquisa é uma
// instância só, sobreposta à doca e ao mapa (ver GeoPage); para ela ter o mesmo
// retângulo em todos os estados, hierarquia e painéis de detalhe têm de compartilhar
// a mesma largura. As classes são literais para o Tailwind enxergá-las no build.

/** Largura única da doca esquerda: hierarquia e painéis de Site/Recurso/Endereço. */
export const DOCK_WIDTH_CLASS = 'w-[396px]';

/** Largura da barra de pesquisa: a doca menos 12 px de folga de cada lado. */
export const DOCK_SEARCH_WIDTH_CLASS = 'w-[372px]';

// Recuo do topo do conteúdo de um painel para ele não nascer sob a barra sobreposta:
// top-3 (12) + h-12 da caixa (48) + 12 de folga = 72 px. Como o Tailwind resolve as
// classes lendo os arquivos-fonte, os literais precisam aparecer inteiros aqui (não
// montados por interpolação) para o JIT gerá-los.

/**
 * Padding-top da doca para o conteúdo começar abaixo da barra sobreposta. No desktop
 * reserva o topo da doca; no mobile, onde a hierarquia cobre a página inteira, reserva a
 * faixa branca sob a barra de pesquisa.
 */
export const DOCK_SEARCH_CLEARANCE_PT_CLASS = 'pt-[72px]';
