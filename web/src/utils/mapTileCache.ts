// Sinal entre fluxos de escrita e o cache de tiles do mapa. O índice é atualizado
// no backend; o cliente descarta o tile em memória para exibir a mudança na hora.
export const MAP_TILES_INVALIDATED_EVENT = 'nexus:map-tiles-invalidated';

export function invalidateMapTiles(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(MAP_TILES_INVALIDATED_EVENT));
}
