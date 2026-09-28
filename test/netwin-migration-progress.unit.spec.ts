import { describe, expect, it } from 'vitest';
import {
  createProgressSnapshot,
  formatProgress,
  MigrationProgress,
  shouldCommitMigrationBatch,
} from '../src/scripts/netwin-migration/progress.js';

describe('netwin-migration: progress reporting', () => {
  it('calcula percentual, throughput e ETA para total conhecido', () => {
    const snapshot = createProgressSnapshot('Portas', 'portas', 50, 100, 10_000);

    expect(snapshot.percent).toBe(50);
    expect(snapshot.ratePerSecond).toBe(5);
    expect(snapshot.etaMs).toBe(10_000);
    expect(formatProgress(snapshot)).toContain('50/100 portas (50.0%)');
    expect(formatProgress(snapshot)).toContain('ETA 10s');
  });

  it('não produz ETA nem percentual quando o total é desconhecido', () => {
    const snapshot = createProgressSnapshot('Locais', 'locais', 2000, undefined, 5_000);

    expect(snapshot.percent).toBeUndefined();
    expect(snapshot.etaMs).toBeUndefined();
    expect(formatProgress(snapshot)).toContain('total desconhecido');
  });

  it('emite somente os marcos configurados e o fechamento', () => {
    const output: string[] = [];
    let now = 0;
    const progress = new MigrationProgress({
      label: 'Splitters',
      unit: 'splitters',
      total: 5,
      reportEvery: 2,
      now: () => now,
      write: (line) => output.push(line),
    });

    progress.start();
    now = 1_000;
    progress.advance();
    now = 2_000;
    progress.advance();
    now = 3_000;
    progress.advance(3);
    progress.finish();

    expect(output).toHaveLength(4);
    expect(output[0]).toContain('iniciado');
    expect(output[1]).toContain('2/5 splitters');
    expect(output[2]).toContain('5/5 splitters');
    expect(output[3]).toContain('concluído');
  });

  it('protege o cálculo contra tempo nulo e valores negativos', () => {
    const snapshot = createProgressSnapshot('Conexões', 'conexões', -1, 0, -5);

    expect(snapshot.processed).toBe(0);
    expect(snapshot.elapsedMs).toBe(0);
    expect(snapshot.ratePerSecond).toBe(0);
    expect(snapshot.etaMs).toBeUndefined();
  });

  it('confirma somente em fronteiras de lote e no restante final', () => {
    expect(shouldCommitMigrationBatch(1_999, 2_000)).toBe(false);
    expect(shouldCommitMigrationBatch(2_000, 2_000)).toBe(true);
    expect(shouldCommitMigrationBatch(0, 2_000, true)).toBe(false);
    expect(shouldCommitMigrationBatch(317, 2_000, true)).toBe(true);
  });
});
