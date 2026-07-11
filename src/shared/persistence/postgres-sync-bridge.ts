import { Worker } from 'node:worker_threads';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanonicalId } from '../utils/canonical-id.js';

type BridgeRequest =
  | { type: 'initialize' }
  | { type: 'close' }
  | { type: 'exec'; sql: string }
  | { type: 'query'; sql: string; params: unknown[]; mode: 'run' | 'get' | 'all'; txId?: string }
  | { type: 'begin-transaction'; txId: string }
  | { type: 'commit-transaction'; txId: string }
  | { type: 'rollback-transaction'; txId: string };

type BridgeResponse =
  | { ok: true; data?: unknown }
  | { ok: false; error: string };

type BridgeEnvelope = {
  id: string;
  request: BridgeRequest;
};

// Control buffer layout (Int32Array): [status, payloadByteLength]
const STATUS_INDEX = 0;
const LENGTH_INDEX = 1;

// Status values written by the worker.
const STATUS_PENDING = 0;
const STATUS_OK = 1;
const STATUS_ERROR = 2;
const STATUS_OVERFLOW = 3;

const DEFAULT_BUFFER_BYTES = 16 * 1024 * 1024;

// A worker crash can surface a raw WebSocket ErrorEvent/CloseEvent rather than an Error, which
// stringifies to the useless "[object ErrorEvent]" unless we pull `.message`/`.error` out first.
const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.length > 0) return error.message;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; error?: unknown; type?: unknown; errors?: unknown; code?: unknown };
    if (candidate.error instanceof Error && candidate.error.message.length > 0) return candidate.error.message;
    if (typeof candidate.message === 'string' && candidate.message.length > 0) return candidate.message;
    if (Array.isArray(candidate.errors) && candidate.errors.length > 0) {
      return candidate.errors.map((inner) => toErrorMessage(inner)).join('; ');
    }
    if (typeof candidate.type === 'string' && candidate.type.length > 0) {
      return `${Object.prototype.toString.call(error)} (type: ${candidate.type}${
        typeof candidate.code === 'string' ? `, code: ${candidate.code}` : ''
      })`;
    }
    if (error instanceof Error) {
      return `${Object.prototype.toString.call(error)} (empty message, name: ${error.name})`;
    }
  }
  return String(error);
};

/**
 * Synchronous bridge over an async Neon worker.
 *
 * The request path (main -> worker) uses postMessage, which is fine because the
 * worker's event loop is free. The response path (worker -> main) MUST NOT use
 * postMessage: the main thread blocks inside Atomics.wait, so its event loop is
 * frozen and any 'message' handler would never run. Instead, the worker writes
 * the serialized response into a SharedArrayBuffer and signals completion via
 * Atomics on the control buffer, which unblocks the main thread.
 */
export class PostgresSyncBridge {
  private readonly worker: Worker;
  private readonly controlBuffer: SharedArrayBuffer;
  private readonly controlView: Int32Array;
  private readonly dataBuffer: SharedArrayBuffer;
  private readonly dataView: Uint8Array;
  private readonly decoder = new TextDecoder();
  private readonly requestTimeoutMs = Number(process.env.DATABASE_BRIDGE_TIMEOUT_MS ?? 30_000);
  private ready = false;
  private closed = false;
  private workerError: string | null = null;
  private readonly pendingTransactionIds: string[] = [];

  constructor(private readonly connectionString: string) {
    const bufferBytes = Number(process.env.DATABASE_BRIDGE_BUFFER_BYTES ?? DEFAULT_BUFFER_BYTES);
    this.controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
    this.controlView = new Int32Array(this.controlBuffer);
    this.dataBuffer = new SharedArrayBuffer(bufferBytes);
    this.dataView = new Uint8Array(this.dataBuffer);

    const currentFile = fileURLToPath(import.meta.url);
    const workerFile = resolve(dirname(currentFile), `postgres-sync-worker${extname(currentFile)}`);
    this.worker = new Worker(workerFile, {
      workerData: {
        connectionString,
        controlBuffer: this.controlBuffer,
        dataBuffer: this.dataBuffer,
      },
      transferList: [],
    });

    // A hard worker crash cannot be delivered while the main thread is blocked in
    // Atomics.wait, so we only record it here. The request() timeout guarantees the
    // caller still gets an error instead of hanging forever.
    this.worker.on('error', (error) => {
      this.workerError = toErrorMessage(error);
    });
  }

  public initialize(): void {
    if (this.ready) return;
    this.request({ type: 'initialize' });
    this.ready = true;
  }

  public close(): void {
    if (this.closed) return;
    try {
      this.request({ type: 'close' });
    } catch {
      // Ignore shutdown failures.
    }
    this.closed = true;
    void this.worker.terminate();
  }

  public exec(sql: string): void {
    this.request({ type: 'exec', sql });
  }

  public run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid?: number } {
    const txId = this.currentTransactionId();
    return this.request({
      type: 'query',
      sql,
      params,
      mode: 'run',
      ...(txId ? { txId } : {}),
    }) as {
      changes: number;
      lastInsertRowid?: number;
    };
  }

  public get<T>(sql: string, params: unknown[] = []): T | undefined {
    const txId = this.currentTransactionId();
    return this.request({
      type: 'query',
      sql,
      params,
      mode: 'get',
      ...(txId ? { txId } : {}),
    }) as T | undefined;
  }

  public all<T>(sql: string, params: unknown[] = []): T[] {
    const txId = this.currentTransactionId();
    return this.request({
      type: 'query',
      sql,
      params,
      mode: 'all',
      ...(txId ? { txId } : {}),
    }) as T[];
  }

  public transaction<T>(fn: () => T): T {
    const txId = createCanonicalId();
    this.pendingTransactionIds.push(txId);
    try {
      this.request({ type: 'begin-transaction', txId });
      const result = fn();
      this.request({ type: 'commit-transaction', txId });
      return result;
    } catch (error) {
      try {
        this.request({ type: 'rollback-transaction', txId });
      } catch {
        // Ignore rollback failures during error propagation.
      }
      throw error;
    } finally {
      this.pendingTransactionIds.pop();
    }
  }

  private currentTransactionId(): string | undefined {
    return this.pendingTransactionIds.at(-1);
  }

  private request(request: BridgeRequest): unknown {
    if (this.closed) {
      throw new Error('Database bridge is closed');
    }
    if (this.workerError) {
      throw new Error(`Database worker failed: ${this.workerError}`);
    }

    const id = createCanonicalId();
    const startedAt = Date.now();

    Atomics.store(this.controlView, STATUS_INDEX, STATUS_PENDING);
    this.worker.postMessage({ id, request } satisfies BridgeEnvelope);

    while (Atomics.load(this.controlView, STATUS_INDEX) === STATUS_PENDING) {
      Atomics.wait(this.controlView, STATUS_INDEX, STATUS_PENDING, 1000);
      if (
        Atomics.load(this.controlView, STATUS_INDEX) === STATUS_PENDING &&
        Date.now() - startedAt > this.requestTimeoutMs
      ) {
        if (this.workerError) {
          throw new Error(`Database worker failed: ${this.workerError}`);
        }
        throw new Error(
          `Database bridge timed out after ${this.requestTimeoutMs}ms while handling ${request.type}`,
        );
      }
    }

    const status = Atomics.load(this.controlView, STATUS_INDEX);
    const length = Atomics.load(this.controlView, LENGTH_INDEX);

    if (status === STATUS_OVERFLOW) {
      throw new Error(
        `Database bridge response (${length} bytes) exceeds the shared buffer of ${this.dataBuffer.byteLength} bytes; ` +
          `increase DATABASE_BRIDGE_BUFFER_BYTES.`,
      );
    }

    const payload = this.decoder.decode(this.dataView.subarray(0, length));
    const response = (payload.length > 0 ? JSON.parse(payload) : { ok: true }) as BridgeResponse;

    if (!response.ok) {
      throw new Error(response.error);
    }

    return response.data;
  }
}
