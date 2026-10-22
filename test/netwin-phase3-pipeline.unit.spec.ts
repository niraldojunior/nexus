import { describe, expect, it } from 'vitest';
import {
  phase3MapResourceGroupPageSql,
  planPhase3ScanUnits,
} from '../src/scripts/netwin-migration/phase3-map-features.js';
import {
  BoundedQueue,
  emptyPhase3Timings,
  formatPhase3Timings,
  runBoundedPipeline,
  timed,
} from '../src/scripts/netwin-migration/phase3-pipeline.js';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 1));

describe('phase3 pipeline', () => {
  it('entrega todos os blocos em ordem e executa finish ao final', async () => {
    const seen: number[] = [];
    let finished = false;
    await runBoundedPipeline<number>(
      2,
      async (emit) => {
        for (let i = 0; i < 10; i += 1) await emit(i);
      },
      async (item) => {
        await tick();
        seen.push(item);
      },
      async () => {
        finished = true;
      },
    );
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(finished).toBe(true);
  });

  it('aplica contrapressão: o leitor não passa de capacity à frente do escritor', async () => {
    let produced = 0;
    let consumed = 0;
    let maxAhead = 0;
    await runBoundedPipeline<number>(
      2,
      async (emit) => {
        for (let i = 0; i < 12; i += 1) {
          await emit(i);
          produced += 1;
          maxAhead = Math.max(maxAhead, produced - consumed);
        }
      },
      async () => {
        await tick();
        consumed += 1;
      },
    );
    // capacity (2) na fila + 1 em processamento pelo escritor
    expect(maxAhead).toBeLessThanOrEqual(3);
  });

  it('propaga erro do escritor e destrava o leitor bloqueado', async () => {
    await expect(
      runBoundedPipeline<number>(
        1,
        async (emit) => {
          for (let i = 0; i < 100; i += 1) await emit(i);
        },
        async (item) => {
          if (item === 3) throw new Error('falha de insert');
        },
      ),
    ).rejects.toThrow('falha de insert');
  });

  it('propaga erro do leitor, sem executar finish', async () => {
    let finished = false;
    await expect(
      runBoundedPipeline<number>(
        2,
        async (emit) => {
          await emit(1);
          throw new Error('falha de fetch');
        },
        async () => {},
        async () => {
          finished = true;
        },
      ),
    ).rejects.toThrow('falha de fetch');
    expect(finished).toBe(false);
  });

  it('rejeita capacidade inválida e sinaliza fim limpo com null', async () => {
    expect(() => new BoundedQueue(0)).toThrow();
    const queue = new BoundedQueue<number>(1);
    queue.close();
    expect(await queue.pop()).toBeNull();
  });

  it('acumula métricas por etapa mesmo quando a etapa falha', async () => {
    const timings = emptyPhase3Timings();
    await timed(timings, 'fetchMs', () => tick());
    await expect(
      timed(timings, 'insertMs', async () => {
        await tick();
        throw new Error('x');
      }),
    ).rejects.toThrow('x');
    expect(timings.fetchMs).toBeGreaterThanOrEqual(0);
    expect(timings.insertMs).toBeGreaterThanOrEqual(0);
    timings.pages = 3;
    expect(formatPhase3Timings(timings, 15000)).toContain('páginas=3 candidatos=15000');
  });
});

describe('netwin-migration: agrupamento de specifications da Fase 3.A', () => {
  const specs = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ ID: `s${i}`, TYPE_CODE: 'T' }));

  it('inclui vazias, isola as grandes e agrupa as pequenas (grupo fecha no fim)', () => {
    const counts = new Map([
      ['s0', 0],
      ['s1', 30],
      ['s2', 40],
      ['s3', 9000],
      ['s4', 10],
    ]);
    expect(planPhase3ScanUnits(specs(5), counts)).toEqual([
      { kind: 'single', specification: { ID: 's3', TYPE_CODE: 'T' } },
      { kind: 'group', specificationIds: ['s0', 's1', 's2', 's4'] },
    ]);
  });

  it('fecha o grupo ao passar do teto de candidatos e cobre cada specification uma vez', () => {
    const counts = new Map(specs(10).map((s) => [s.ID, 4000] as const));
    const units = planPhase3ScanUnits(specs(10), counts);
    const covered = units.flatMap((u) =>
      u.kind === 'single' ? [u.specification.ID] : u.specificationIds,
    );
    expect([...covered].sort()).toEqual(
      specs(10)
        .map((s) => s.ID)
        .sort(),
    );
    expect(units.every((u) => u.kind === 'single' || u.specificationIds.length <= 5)).toBe(true);
  });

  it('gera o SQL do grupo com um bind por specification e paginação por id', () => {
    const sql = phase3MapResourceGroupPageSql((t) => `X_${t}`, 3);
    expect(sql).toContain('IN (:spec0, :spec1, :spec2)');
    expect(sql).toContain('(:lastId IS NULL OR r.id > :lastId)');
    expect(sql).toContain('rt.code AS "TYPE_CODE"');
  });
});
