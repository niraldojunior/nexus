import { describe, expect, it } from 'vitest';
import { dedupeComponentConnections } from './resourceConnections';

describe('dedupeComponentConnections', () => {
  it('collapses symmetric connectedTo edges only', () => {
    const connections = dedupeComponentConnections([
      { '@type': 'ResourceComponentConnection', fromId: 'a', toId: 'b', relationshipType: 'connectedTo' },
      { '@type': 'ResourceComponentConnection', fromId: 'b', toId: 'a', relationshipType: 'connectedTo' },
      { '@type': 'ResourceComponentConnection', fromId: 'a', toId: 'b', relationshipType: 'feeds' },
      { '@type': 'ResourceComponentConnection', fromId: 'b', toId: 'a', relationshipType: 'feeds' },
    ]);

    expect(connections).toHaveLength(3);
    expect(connections.filter((connection) => connection.relationshipType === 'connectedTo')).toHaveLength(1);
  });
});
