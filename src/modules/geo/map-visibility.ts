// Fonte única do que "aparece no mapa" — evita a régua divergir entre os três lugares que a
// aplicam: GeoTreeService (árvore/viewport), GeoMapFeatureSynchronizer (write-through) e
// scripts/build-map-features.mjs (rebuild batch, via dist/). Antes cada um definia sua própria
// lista/SQL e divergiam — foi assim que Porta de Splitter (issue #171 Fase 3) vazou no índice
// do mapa pelo write-through: ele excluía só 'Splitter', nunca ganhou 'Port'.

// Codes do catálogo TMF634 (ver `src/modules/resource/catalog.ts`) que não têm existência
// própria na navegação nem no mapa: reaproveitam a Location de quem os contém, então um pin
// deles cairia em cima do pin do pai. Splitter mora na caixa; Porta mora no splitter — mesma
// regra, um nível mais fundo, coberta pelo pass-through de `RESOURCE_CHILD_TREE_SOURCE`/
// `countResourceChildren` em tree-service.ts (PASS_THROUGH_MAX_DEPTH já cobre uma cadeia
// caixa→splitter→porta).
export const INTERNAL_RESOURCE_TYPES = ['Splitter', 'Port'] as const;

export const INTERNAL_RESOURCE_TYPES_SQL = INTERNAL_RESOURCE_TYPES.map((t) => `'${t}'`).join(
  ', ',
);

// Fragmentos SQL sobre o ResourceType resolvido pela FK de ResourceSpecification.
// O alias deve apontar para o JOIN de tmf_resource_type (por exemplo, "rt").
export function excludeInternalResourceTypesSql(alias = 'rt'): string {
  return `${alias}.code NOT IN (${INTERNAL_RESOURCE_TYPES_SQL})`;
}

// Inverso: casa só recurso interno (usado pelo pass-through da árvore).
export function includeInternalResourceTypesSql(alias = 'rt'): string {
  return `${alias}.code IN (${INTERNAL_RESOURCE_TYPES_SQL})`;
}
