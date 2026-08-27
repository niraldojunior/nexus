import type { DatabaseClient } from '../persistence/database-client.js';
import type { Logger } from '../logging/logger.js';

// Relay do outbox (C7): tmf_outbox acumulava linhas 'pending' sem nenhum consumidor — a garantia
// "todo evento relevante publica via outbox" existia só na intenção. Este módulo fecha o loop:
// varre linhas pendentes em lote e as publica através de um sink plugável. No laboratório o sink
// é um log estruturado (abaixo); a fronteira já fica pronta para o Kafka entrar sem tocar quem
// grava no outbox (o `recordMutation` de shared/persistence/audit-outbox.ts não muda).

export type OutboxRow = {
  id: string;
  tenant_id: string;
  event_id: string;
  topic: string;
  payload: string;
  status: 'pending' | 'published' | 'failed';
  created_at: string;
  published_at: string | null;
};

export type OutboxMessage = {
  id: string;
  tenantId: string;
  eventId: string;
  topic: string;
  payload: unknown;
  createdAt: string;
};

export type OutboxPublisher = (message: OutboxMessage) => Promise<void> | void;

// Sink default do laboratório: loga em vez de publicar de fato. Suficiente para ver o outbox
// escoar; o dia que o Kafka entrar, troca-se só este publisher — `runOutboxRelayOnce` não muda.
export const createLoggingPublisher = (logger: Logger): OutboxPublisher => {
  return (message) => {
    logger.info(
      { topic: message.topic, tenantId: message.tenantId, eventId: message.eventId },
      'outbox message published (log sink)',
    );
  };
};

export const runOutboxRelayOnce = async (
  db: DatabaseClient,
  publish: OutboxPublisher,
  options: { batchSize?: number; logger?: Logger } = {},
): Promise<{ published: number; failed: number }> => {
  const batchSize = options.batchSize ?? 50;
  const rows = await db.all<OutboxRow>(
    `SELECT id, tenant_id, event_id, topic, payload, status, created_at, published_at
     FROM tmf_outbox
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT ?`,
    [batchSize],
  );

  let published = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await publish({
        id: row.id,
        tenantId: row.tenant_id,
        eventId: row.event_id,
        topic: row.topic,
        payload: JSON.parse(row.payload) as unknown,
        createdAt: row.created_at,
      });
      await db.run(`UPDATE tmf_outbox SET status = 'published', published_at = ? WHERE id = ?`, [
        new Date().toISOString(),
        row.id,
      ]);
      published += 1;
    } catch (error) {
      failed += 1;
      options.logger?.warn(
        { outboxId: row.id, error: error instanceof Error ? error.message : String(error) },
        'outbox publish failed; leaving pending for retry',
      );
      // Fica 'pending' de propósito — a próxima varredura tenta de novo. Não há campo de
      // contagem de tentativas ainda; se uma linha travar publish indefinidamente, ela só
      // aparece nos logs de warning repetidos (sinal suficiente para o laboratório).
    }
  }

  return { published, failed };
};

export type OutboxRelayHandle = { stop: () => void };

export const startOutboxRelay = (
  db: DatabaseClient,
  publish: OutboxPublisher,
  options: { intervalMs?: number; batchSize?: number; logger?: Logger } = {},
): OutboxRelayHandle => {
  const intervalMs = options.intervalMs ?? 5_000;
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // não sobrepõe execuções se uma varredura demorar mais que o intervalo
    running = true;
    void runOutboxRelayOnce(db, publish, options)
      .catch((error: unknown) => {
        options.logger?.error(
          { error: error instanceof Error ? error.message : String(error) },
          'outbox relay tick failed',
        );
      })
      .finally(() => {
        running = false;
      });
  }, intervalMs);
  // Node mantém o processo vivo por causa do timer; unref() deixa o processo encerrar
  // normalmente (ex.: scripts, testes) sem precisar parar o relay explicitamente.
  timer.unref?.();

  return {
    stop: () => clearInterval(timer),
  };
};
