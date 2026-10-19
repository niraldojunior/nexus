import { describe, expect, it } from 'vitest';
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
