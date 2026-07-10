/** Xroga AI Phase 1 — Winston logger */

import winston from 'winston';

const { combine, timestamp, errors, json, colorize, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [phase1] ${level}: ${message}${extra}`;
});

export const phase1Logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  defaultMeta: { service: 'xroga-phase1' },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? combine(timestamp(), errors({ stack: true }), json())
          : combine(colorize(), timestamp({ format: 'HH:mm:ss' }), devFormat),
    }),
  ],
});
