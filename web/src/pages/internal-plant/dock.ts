// Doca da Planta Interna: largura própria (a do mapa é 396 px) e redimensionável pelo usuário.
// Medidas em px porque a largura vira estilo inline durante o arrasto.

/** Largura inicial da doca de hierarquia. */
export const INTERNAL_PLANT_DOCK_DEFAULT_WIDTH = 293;

/** Limites do arrasto: abaixo do mínimo a árvore e as abas quebram; acima do máximo a tabela sufoca. */
export const INTERNAL_PLANT_DOCK_MIN_WIDTH = 220;
export const INTERNAL_PLANT_DOCK_MAX_WIDTH = 560;

/** Folga de cada lado entre a barra de pesquisa e a borda da doca. */
export const INTERNAL_PLANT_SEARCH_GUTTER = 12;

const STORAGE_KEY = 'nexus.internalPlant.dockWidth';

export const clampDockWidth = (width: number) =>
  Math.min(
    INTERNAL_PLANT_DOCK_MAX_WIDTH,
    Math.max(INTERNAL_PLANT_DOCK_MIN_WIDTH, Math.round(width)),
  );

/** Largura lembrada do usuário; o storage pode estar bloqueado, então qualquer falha cai no padrão. */
export function readStoredDockWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(stored) && stored > 0
      ? clampDockWidth(stored)
      : INTERNAL_PLANT_DOCK_DEFAULT_WIDTH;
  } catch {
    return INTERNAL_PLANT_DOCK_DEFAULT_WIDTH;
  }
}

export function storeDockWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Preferência por visitante; sem storage a largura só vale na sessão.
  }
}
