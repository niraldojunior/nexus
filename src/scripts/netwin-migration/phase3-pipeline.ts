// Pipeline leitor → fila limitada → escritor da Fase 3.A. O leitor (consulta + transformação) e o
// escritor (INSERT + COMMIT) usam conexões distintas, então a leitura da página N+1 se sobrepõe à
// gravação da página N. A fila limitada aplica contrapressão: o leitor não corre à frente do
// escritor além de `capacity` blocos.

export type Phase3Timings = {
  fetchMs: number;
  transformMs: number;
  insertMs: number;
  commitMs: number;
  pages: number;
};

export const emptyPhase3Timings = (): Phase3Timings => ({
  fetchMs: 0,
  transformMs: 0,
  insertMs: 0,
  commitMs: 0,
  pages: 0,
});

export async function timed<T>(
  timings: Phase3Timings,
  field: 'fetchMs' | 'transformMs' | 'insertMs' | 'commitMs',
  work: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    timings[field] += Date.now() - startedAt;
  }
}

export function formatPhase3Timings(timings: Phase3Timings, candidates: number): string {
  const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  return (
    `[Mapa] métricas: fetch=${seconds(timings.fetchMs)} transformação=${seconds(timings.transformMs)} ` +
    `insert=${seconds(timings.insertMs)} commit=${seconds(timings.commitMs)} ` +
    `páginas=${timings.pages} candidatos=${candidates}`
  );
}

export class BoundedQueue<T> {
  private readonly items: T[] = [];
  private closed = false;
  private failure: Error | null = null;
  private pushWaiters: Array<() => void> = [];
  private popWaiters: Array<() => void> = [];

  constructor(private readonly capacity: number) {
    if (capacity < 1) throw new Error('BoundedQueue exige capacity >= 1.');
  }

  private wake(waiters: Array<() => void>): void {
    for (const resolve of waiters.splice(0)) resolve();
  }

  /** Bloqueia enquanto cheia. Lança se a fila foi abortada pelo outro lado. */
  async push(item: T): Promise<void> {
    while (this.items.length >= this.capacity && !this.failure) {
      await new Promise<void>((resolve) => this.pushWaiters.push(resolve));
    }
    if (this.failure) throw this.failure;
    this.items.push(item);
    this.wake(this.popWaiters);
  }

  /** `null` indica fim limpo. Lança se a fila foi abortada. */
  async pop(): Promise<T | null> {
    while (this.items.length === 0 && !this.closed && !this.failure) {
      await new Promise<void>((resolve) => this.popWaiters.push(resolve));
    }
    if (this.failure) throw this.failure;
    const item = this.items.shift();
    if (item === undefined) return null;
    this.wake(this.pushWaiters);
    return item;
  }

  close(): void {
    this.closed = true;
    this.wake(this.popWaiters);
  }

  abort(error: Error): void {
    this.failure ??= error;
    this.wake(this.popWaiters);
    this.wake(this.pushWaiters);
  }
}

/**
 * Executa `produce` e `consume` em paralelo ligados por uma fila limitada. Se qualquer lado falha,
 * a fila é abortada para destravar o outro e o primeiro erro é propagado depois que ambos param.
 */
export async function runBoundedPipeline<T>(
  capacity: number,
  produce: (emit: (item: T) => Promise<void>) => Promise<void>,
  consume: (item: T) => Promise<void>,
  finish?: () => Promise<void>,
): Promise<void> {
  const queue = new BoundedQueue<T>(capacity);
  let firstError: Error | null = null;
  const fail = (error: unknown) => {
    const wrapped = error instanceof Error ? error : new Error(String(error));
    firstError ??= wrapped;
    queue.abort(wrapped);
  };

  const producer = produce((item) => queue.push(item)).then(
    () => queue.close(),
    (error) => fail(error),
  );
  const consumer = (async () => {
    try {
      for (let item = await queue.pop(); item !== null; item = await queue.pop()) {
        await consume(item);
      }
      if (finish) await finish();
    } catch (error) {
      fail(error);
    }
  })();

  await Promise.all([producer, consumer]);
  if (firstError) throw firstError;
}
