import { describe, expect, it } from 'vitest';
import {
  equipmentModelSpecId,
  equipmentTypeSpecId,
  isRadioCellTypeName,
} from '../src/scripts/netwin-migration/concrete-specs.js';
import {
  dynamicAttributeTarget,
  enrichmentInstanceDefinitions,
  radioCellInstanceDefinitions,
} from '../src/scripts/netwin-migration/equipment-enrichment.js';

describe('célula de rádio Netwin', () => {
  it('reconhece tipos de célula e ignora os demais', () => {
    for (const name of ['Célula 2G', 'Celula 3G', 'Célula LTE', 'Célula NR'])
      expect(isRadioCellTypeName(name)).toBe(true);
    for (const name of ['CDOE', 'Cela', 'Célula', 'Antena', null])
      expect(isRadioCellTypeName(name)).toBe(false);
  });

  it('spec de tipo é determinística e distinta da de modelo', () => {
    expect(equipmentTypeSpecId(7)).toBe(equipmentTypeSpecId(7));
    expect(equipmentTypeSpecId(7)).not.toBe(equipmentTypeSpecId(8));
    expect(equipmentTypeSpecId(7)).not.toBe(equipmentModelSpecId(7, 1));
  });

  it('atributos de RF mapeiam para characteristics e só existem nos tipos de célula', () => {
    expect(dynamicAttributeTarget('Raio de cobertura (m)')).toBe('coverageRadius');
    expect(dynamicAttributeTarget('LAC')).toBe('locationAreaCode');
    const base = new Set(enrichmentInstanceDefinitions().map((d) => d.name));
    for (const def of radioCellInstanceDefinitions()) expect(base.has(def.name)).toBe(false);
  });
});
