import type { ResourceComponentConnection, ResourceConnection } from '../services/resourceApi';

/**
 * Deduplica conexões incidentes de um recurso. `connectedTo` é simétrica — a mesma aresta pode
 * estar persistida nos dois sentidos e a projeção do backend a devolve como entrada e saída; para
 * a leitura operacional (lista e contador da aba "Conexões"), ela é uma conexão só. Extraído de
 * `ResourceConnectionsTab` para ser reusado também pelo contador de `ResourcePanel`, sem duplicar
 * a regra entre os dois lugares.
 */
export function dedupeResourceConnections(connections: ResourceConnection[]): ResourceConnection[] {
  const unique = new Map<string, ResourceConnection>();
  for (const connection of connections) {
    const key =
      connection.relationshipType === 'connectedTo'
        ? `${connection.relationshipType}::${connection.resource.id}`
        : `${connection.relationshipType}::${connection.direction}::${connection.resource.id}`;
    const existing = unique.get(key);
    if (!existing || (existing.direction === 'incoming' && connection.direction === 'outgoing')) {
      unique.set(key, connection);
    }
  }
  return Array.from(unique.values());
}

/** `connectedTo` é simétrica também dentro da subárvore; o diagrama a desenha uma única vez. */
export function dedupeComponentConnections(
  connections: ResourceComponentConnection[],
): ResourceComponentConnection[] {
  const unique = new Map<string, ResourceComponentConnection>();
  for (const connection of connections) {
    const [firstId, secondId] = [connection.fromId, connection.toId].sort();
    const key =
      connection.relationshipType === 'connectedTo'
        ? `${connection.relationshipType}::${firstId}::${secondId}`
        : `${connection.relationshipType}::${connection.fromId}::${connection.toId}`;
    if (!unique.has(key)) unique.set(key, connection);
  }
  return Array.from(unique.values());
}
