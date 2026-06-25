import type { Response } from 'express';

export interface SSEPayload {
  event?: string;
  data: Record<string, unknown>;
}

export function initSSE(res: Response): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

export function sendSSE(res: Response, payload: SSEPayload): void {
  const eventLine = payload.event ? `event: ${payload.event}\n` : '';
  res.write(`${eventLine}data: ${JSON.stringify(payload.data)}\n\n`);
}

export function endSSE(res: Response): void {
  sendSSE(res, { event: 'done', data: { complete: true } });
  res.end();
}
