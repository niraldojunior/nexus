export type ProgressSnapshot = {
  label: string;
  unit: string;
  processed: number;
  total?: number;
  elapsedMs: number;
  ratePerSecond: number;
  percent?: number;
  etaMs?: number;
  complete: boolean;
};

export type MigrationProgressOptions = {
  label: string;
  unit: string;
  total?: number;
  reportEvery?: number;
  now?: () => number;
  write?: (line: string) => void;
};

/**
 * Indica se o lote atual já deve ser confirmado. `finalize` confirma somente o restante não vazio
 * ao encerrar um estágio, sem produzir um COMMIT redundante após uma fronteira exata.
 */
export const shouldCommitMigrationBatch = (
  processedSinceCommit: number,
  batchSize: number,
  finalize = false,
): boolean =>
  processedSinceCommit >= Math.max(1, batchSize) || (finalize && processedSinceCommit > 0);

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m${remainingSeconds.toString().padStart(2, '0')}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h${(minutes % 60).toString().padStart(2, '0')}m`;
}

export function createProgressSnapshot(
  label: string,
  unit: string,
  processed: number,
  total: number | undefined,
  elapsedMs: number,
  complete = false,
): ProgressSnapshot {
  const safeProcessed = Math.max(0, processed);
  const safeElapsedMs = Math.max(0, elapsedMs);
  const ratePerSecond = safeElapsedMs > 0 ? (safeProcessed * 1000) / safeElapsedMs : 0;
  const safeTotal = total !== undefined && total >= 0 ? total : undefined;
  const percent =
    safeTotal !== undefined && safeTotal > 0
      ? Math.min(100, (safeProcessed / safeTotal) * 100)
      : undefined;
  const etaMs =
    safeTotal !== undefined && ratePerSecond > 0
      ? Math.max(0, ((safeTotal - safeProcessed) / ratePerSecond) * 1000)
      : undefined;

  return {
    label,
    unit,
    processed: safeProcessed,
    ...(safeTotal === undefined ? {} : { total: safeTotal }),
    elapsedMs: safeElapsedMs,
    ratePerSecond,
    ...(percent === undefined ? {} : { percent }),
    ...(etaMs === undefined ? {} : { etaMs }),
    complete,
  };
}

export function formatProgress(snapshot: ProgressSnapshot): string {
  const progress =
    snapshot.total === undefined
      ? `${snapshot.processed.toLocaleString('pt-BR')} ${snapshot.unit} (total desconhecido)`
      : `${snapshot.processed.toLocaleString('pt-BR')}/${snapshot.total.toLocaleString('pt-BR')} ${snapshot.unit} (${(snapshot.percent ?? 0).toFixed(1)}%)`;
  const rate = `${snapshot.ratePerSecond.toFixed(1)} ${snapshot.unit}/s`;
  const eta =
    snapshot.etaMs === undefined || snapshot.complete
      ? ''
      : `; ETA ${formatDuration(snapshot.etaMs)}`;
  const status = snapshot.complete ? ' concluído' : '';
  return `[Progresso] ${snapshot.label}: ${progress}; ${rate}; decorrido ${formatDuration(snapshot.elapsedMs)}${eta}${status}`;
}

/**
 * Emite progresso por itens sem manter estado no Oracle. O total é opcional:
 * fases paginadas podem informar somente throughput e chave de paginação.
 */
export class MigrationProgress {
  private readonly startMs: number;
  private readonly reportEvery: number;
  private readonly now: () => number;
  private readonly write: (line: string) => void;
  private processed = 0;
  private lastReported = 0;

  constructor(private readonly options: MigrationProgressOptions) {
    this.startMs = (options.now ?? Date.now)();
    this.reportEvery = Math.max(1, options.reportEvery ?? 1000);
    this.now = options.now ?? Date.now;
    this.write = options.write ?? ((line) => process.stdout.write(`${line}\n`));
  }

  start(): void {
    const total =
      this.options.total === undefined
        ? 'total desconhecido'
        : `${this.options.total.toLocaleString('pt-BR')} ${this.options.unit}`;
    this.write(
      `[Progresso] ${this.options.label}: iniciado; ${total}; reporte a cada ${this.reportEvery.toLocaleString('pt-BR')} ${this.options.unit}.`,
    );
  }

  advance(amount = 1): void {
    this.processed += Math.max(0, amount);
    if (this.processed - this.lastReported >= this.reportEvery || this.reachedTotal()) {
      this.report(false);
    }
  }

  report(complete = false): void {
    this.write(formatProgress(this.snapshot(complete)));
    this.lastReported = this.processed;
  }

  finish(): void {
    this.report(true);
  }

  snapshot(complete = false): ProgressSnapshot {
    return createProgressSnapshot(
      this.options.label,
      this.options.unit,
      this.processed,
      this.options.total,
      this.now() - this.startMs,
      complete,
    );
  }

  private reachedTotal(): boolean {
    return this.options.total !== undefined && this.processed >= this.options.total;
  }
}
