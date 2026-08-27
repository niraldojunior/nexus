import assert from 'node:assert/strict';
import { afterEach, test } from 'vitest';
import {
  recordRequestMetric,
  renderPrometheusMetrics,
  resetMetricsForTesting,
} from '../src/shared/http/metrics.js';

afterEach(() => {
  resetMetricsForTesting();
});

test('renderPrometheusMetrics reflete count/errors/duration por rota normalizada', () => {
  recordRequestMetric('GET', '/tmf-api/resourceInventoryManagement/v4/resource/abc-123', 200, 40);
  recordRequestMetric('GET', '/tmf-api/resourceInventoryManagement/v4/resource/def-456', 200, 60);
  recordRequestMetric('GET', '/tmf-api/resourceInventoryManagement/v4/resource/def-456', 500, 10);

  const text = renderPrometheusMetrics();

  // Segmentos com id/dígito viram `:id` — as duas primeiras chamadas caem na mesma série.
  assert.match(
    text,
    /nexus_http_requests_total\{method="GET",route="\/tmf-api\/resourceInventoryManagement\/v4\/resource\/:id"\} 3/,
  );
  assert.match(
    text,
    /nexus_http_request_errors_total\{method="GET",route="\/tmf-api\/resourceInventoryManagement\/v4\/resource\/:id"\} 1/,
  );
  assert.match(
    text,
    /nexus_http_request_duration_ms_sum\{method="GET",route="\/tmf-api\/resourceInventoryManagement\/v4\/resource\/:id"\} 110/,
  );
  assert.match(
    text,
    /nexus_http_request_duration_ms_max\{method="GET",route="\/tmf-api\/resourceInventoryManagement\/v4\/resource\/:id"\} 60/,
  );
});

test('resetMetricsForTesting limpa o coletor', () => {
  recordRequestMetric('GET', '/health', 200, 5);
  resetMetricsForTesting();
  const text = renderPrometheusMetrics();
  assert.ok(!text.includes('route="/health"'));
});
