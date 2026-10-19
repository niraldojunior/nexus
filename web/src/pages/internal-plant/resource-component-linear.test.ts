import { describe, expect, it } from 'vitest';
import {
  linearBatch,
  linearConflictAt,
  linearEnd,
  linearFits,
  linearLabel,
  linearSlots,
  linearVisualPositions,
  sequentialName,
  type LinearConfiguration,
} from './resource-component-linear';

const configuration: LinearConfiguration = {
  version: 1,
  placementPolicy: 'LINEAR',
  axis: 'vertical',
  unitLabel: 'U',
  capacity: 20,
  numberingDirection: 'ascending',
};

describe('resource-component-linear', () => {
  it('deriva rótulos com padding e preserva a posição lógica', () => {
    expect(linearLabel(configuration, 1)).toBe('U01');
    expect(linearLabel(configuration, 20)).toBe('U20');
    expect(linearEnd({ placementPolicy: 'LINEAR', position: 13, span: 2 })).toBe(14);
  });

  it('inverte apenas a ordem visual para numberingDirection descending', () => {
    expect(
      linearVisualPositions({ ...configuration, capacity: 3, numberingDirection: 'ascending' }),
    ).toEqual([1, 2, 3]);
    expect(
      linearVisualPositions({ ...configuration, capacity: 3, numberingDirection: 'descending' }),
    ).toEqual([3, 2, 1]);
  });

  it('projeta um recurso com span em uma única ocupação lógica', () => {
    const olt = { id: 'olt-01' };
    const slots = linearSlots(configuration, [
      { item: olt, placement: { placementPolicy: 'LINEAR', position: 13, span: 2 } },
    ]);
    expect(slots[12]?.occupant?.item).toBe(olt);
    expect(slots[13]?.occupant?.item).toBe(olt);
  });

  it('detecta colisão e limites de capacidade, excetuando o próprio recurso', () => {
    const olt = { id: 'olt-01' };
    const occupants = [
      { item: olt, placement: { placementPolicy: 'LINEAR' as const, position: 13, span: 2 } },
    ];
    expect(linearConflictAt(occupants, { placementPolicy: 'LINEAR', position: 14 })).toMatchObject({
      item: olt,
    });
    expect(
      linearFits(configuration, occupants, { placementPolicy: 'LINEAR', position: 14 }, olt),
    ).toBe(true);
    expect(
      linearFits(configuration, occupants, { placementPolicy: 'LINEAR', position: 20, span: 2 }),
    ).toBe(false);
  });

  it('gera posições e nomes sequenciais para criação em lote', () => {
    expect(linearBatch(15, 3, 1)).toEqual([
      { placementPolicy: 'LINEAR', position: 15 },
      { placementPolicy: 'LINEAR', position: 16 },
      { placementPolicy: 'LINEAR', position: 17 },
    ]);
    expect(linearBatch(13, 2, 2)).toEqual([
      { placementPolicy: 'LINEAR', position: 13, span: 2 },
      { placementPolicy: 'LINEAR', position: 15, span: 2 },
    ]);
    expect(sequentialName('ROUTER', 3, 1)).toBe('ROUTER-04');
  });
});
