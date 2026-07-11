import type { Request, Response, NextFunction } from 'express';

let requestCount = 0;
let errorCount = 0;
const startTime = Date.now();

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  requestCount++;
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    if (res.statusCode >= 500) errorCount++;
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    if (elapsed > 5000) {
      console.warn(`[metrics] Slow request ${req.method} ${req.path} ${elapsed.toFixed(0)}ms`);
    }
  });

  next();
}

export function getMetricsText(): string {
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const mem = process.memoryUsage();

  return [
    '# HELP xroga_http_requests_total Total HTTP requests',
    '# TYPE xroga_http_requests_total counter',
    `xroga_http_requests_total ${requestCount}`,
    '# HELP xroga_http_errors_total Total HTTP 5xx responses',
    '# TYPE xroga_http_errors_total counter',
    `xroga_http_errors_total ${errorCount}`,
    '# HELP xroga_process_uptime_seconds Process uptime',
    '# TYPE xroga_process_uptime_seconds gauge',
    `xroga_process_uptime_seconds ${uptimeSec}`,
    '# HELP xroga_process_heap_bytes Heap memory usage',
    '# TYPE xroga_process_heap_bytes gauge',
    `xroga_process_heap_bytes ${mem.heapUsed}`,
    '# HELP xroga_redis_connected Redis connection status',
    '# TYPE xroga_redis_connected gauge',
    `xroga_redis_connected ${process.env.REDIS_URL ? 1 : 0}`,
  ].join('\n');
}
