import { describe, expect, it } from 'vitest';
import { projectAreaFill, projectAreaStroke, projectAreaSwatch } from './projectAreaColor';

describe('projectAreaFill/projectAreaStroke', () => {
  it('concentração usa --status-blue', () => {
    expect(projectAreaFill('concentration')).toMatch(/^rgba\(59, 130, 246, 0\.28\)$/);
    expect(projectAreaStroke('concentration')).toMatch(/^rgba\(59, 130, 246, 0\.85\)$/);
  });

  it('dispersão usa --status-purple', () => {
    expect(projectAreaFill('dispersion')).toMatch(/^rgba\(139, 92, 246, 0\.28\)$/);
    expect(projectAreaStroke('dispersion')).toMatch(/^rgba\(139, 92, 246, 0\.85\)$/);
  });
});

describe('projectAreaSwatch', () => {
  it('devolve rgb() sólido pela classe', () => {
    expect(projectAreaSwatch('concentration')).toBe('rgb(59, 130, 246)');
    expect(projectAreaSwatch('dispersion')).toBe('rgb(139, 92, 246)');
  });
});
