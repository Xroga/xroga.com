import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';

const startTime = Date.now();
const requests = new Map<string, number>();
const durationBuckets = new Map<string, number>();
const BUCKETS = [100, 500, 1_000, 5_000, Number.POSITIVE_INFINITY];

function routeLabel(req: Request): string {
  const clean = req.path.split('/').filter(Boolean).slice(0, 2)
    .map((part) => (/^[0-9a-f-]{16,}$/i.test(part) ? ':id' : part.replace(/[^a-zA-Z0-9_.:-]/g, '_')));
  return `/${clean.join('/')}` || '/';
}

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const started = process.hrtime.bigint();
  const requestId = String(req.headers['x-request-id'] ?? randomUUID()).slice(0, 100);
  res.setHeader('X-Request-Id', requestId);

  res.on('finish', () => {
    const route = routeLabel(req);
    const statusClass = `${Math.floor(res.statusCode / 100)}xx`;
    const key = `method="${req.method}",route="${route}",status_class="${statusClass}"`;
    requests.set(key, (requests.get(key) ?? 0) + 1);
    const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
    for (const bucket of BUCKETS) {
      if (elapsed <= bucket) {
        const bucketKey = `${key},le="${Number.isFinite(bucket) ? bucket : '+Inf'}"`;
        durationBuckets.set(bucketKey, (durationBuckets.get(bucketKey) ?? 0) + 1);
      }
    }
    if (elapsed > 5_000) {
      console.warn(JSON.stringify({ level: 'warn', event: 'slow_request', requestId, method: req.method, route, durationMs: Math.round(elapsed) }));
    }
  });
  next();
}

export function getMetricsText(): string {
  const mem = process.memoryUsage();
  const lines = [
    '# HELP xroga_http_requests_total Total HTTP requests by bounded route and status class',
    '# TYPE xroga_http_requests_total counter',
    ...[...requests].map(([labels, count]) => `xroga_http_requests_total{${labels}} ${count}`),
    '# HELP xroga_http_request_duration_ms Request latency histogram',
    '# TYPE xroga_http_request_duration_ms histogram',
    ...[...durationBuckets].map(([labels, count]) => `xroga_http_request_duration_ms_bucket{${labels}} ${count}`),
    '# HELP xroga_process_uptime_seconds Process uptime',
    '# TYPE xroga_process_uptime_seconds gauge',
    `xroga_process_uptime_seconds ${Math.floor((Date.now() - startTime) / 1000)}`,
    '# HELP xroga_process_heap_bytes Process heap usage',
    '# TYPE xroga_process_heap_bytes gauge',
    `xroga_process_heap_bytes ${mem.heapUsed}`,
    '# HELP xroga_queue_configured Queue provider configuration state (not connectivity)',
    '# TYPE xroga_queue_configured gauge',
    `xroga_queue_configured ${process.env.REDIS_URL ? 1 : 0}`,
  ];
  return `${lines.join('\n')}\n`;
}
