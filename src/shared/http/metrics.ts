// Métricas RED (Rate, Errors, Duration) por rota — NFR §7 pedia isso e não existia nada além de
// log estruturado. Coletor em memória, por instância (mesma limitação de sempre em ambiente com
// múltiplas réplicas: é visão local, não agregada — Prometheus fica responsável por agregar entre
// pods via scrape). Exposto em GET /metrics no formato de exposição do Prometheus.

type RouteKey = string;

type RouteMetrics = {
  count: number;
  errorCount: number;
  durationSumMs: number;
  durationMaxMs: number;
};

const routeMetrics = new Map<RouteKey, RouteMetrics>();

// Substitui segmentos que parecem id (uuid v7, slugs de negócio com dígito) por `:id` — sem
// isso, cada recurso diferente vira uma série própria e a cardinalidade explode (a mesma razão
// pela qual Apigee/NGINX normalizam path antes de rotular métricas). Exige 6+ chars com pelo
// menos um dígito, para não confundir com segmentos de versão de API curtos (`v4`, `v1`).
const ID_SEGMENT = /^(?=.*\d)[0-9a-zA-Z-]{6,}$/;
const normalizeRoute = (pathname: string): string =>
  pathname
    .split('/')
    .map((segment) => (segment && ID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/') || '/';

export const recordRequestMetric = (
  method: string | undefined,
  pathname: string,
  statusCode: number,
  durationMs: number,
): void => {
  const key = `${method ?? 'UNKNOWN'} ${normalizeRoute(pathname)}`;
  const current = routeMetrics.get(key) ?? {
    count: 0,
    errorCount: 0,
    durationSumMs: 0,
    durationMaxMs: 0,
  };
  current.count += 1;
  if (statusCode >= 500) current.errorCount += 1;
  current.durationSumMs += durationMs;
  current.durationMaxMs = Math.max(current.durationMaxMs, durationMs);
  routeMetrics.set(key, current);
};

const escapeLabel = (value: string): string => value.replace(/"/g, '\\"');

export const renderPrometheusMetrics = (): string => {
  const lines: string[] = [
    '# HELP nexus_http_requests_total Total de requisições HTTP por rota e método.',
    '# TYPE nexus_http_requests_total counter',
  ];
  for (const [key, metrics] of routeMetrics) {
    const [method, route] = key.split(' ', 2);
    lines.push(
      `nexus_http_requests_total{method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}"} ${metrics.count}`,
    );
  }

  lines.push(
    '# HELP nexus_http_request_errors_total Requisições HTTP com status >= 500, por rota e método.',
    '# TYPE nexus_http_request_errors_total counter',
  );
  for (const [key, metrics] of routeMetrics) {
    const [method, route] = key.split(' ', 2);
    lines.push(
      `nexus_http_request_errors_total{method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}"} ${metrics.errorCount}`,
    );
  }

  lines.push(
    '# HELP nexus_http_request_duration_ms_sum Soma da duração das requisições em ms, por rota e método.',
    '# TYPE nexus_http_request_duration_ms_sum counter',
  );
  for (const [key, metrics] of routeMetrics) {
    const [method, route] = key.split(' ', 2);
    lines.push(
      `nexus_http_request_duration_ms_sum{method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}"} ${metrics.durationSumMs}`,
    );
  }

  lines.push(
    '# HELP nexus_http_request_duration_ms_max Maior duração observada em ms, por rota e método.',
    '# TYPE nexus_http_request_duration_ms_max gauge',
  );
  for (const [key, metrics] of routeMetrics) {
    const [method, route] = key.split(' ', 2);
    lines.push(
      `nexus_http_request_duration_ms_max{method="${escapeLabel(method ?? '')}",route="${escapeLabel(route ?? '')}"} ${metrics.durationMaxMs}`,
    );
  }

  return lines.join('\n') + '\n';
};

// Exposto só para testes — reinicia o coletor entre casos.
export const resetMetricsForTesting = (): void => {
  routeMetrics.clear();
};
