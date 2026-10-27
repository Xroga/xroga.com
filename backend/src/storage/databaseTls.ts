import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import net from 'node:net';
import tls from 'node:tls';
import type { PoolConfig } from 'pg';
import { SUPABASE_ROOT_2021_CA_PEM, SUPABASE_ROOT_2021_CA_SHA256 } from './certs/supabaseRoot2021.js';

/**
 * Database connection planning for the storage pool (Batch 1.5 INFRA-005 prerequisite).
 *
 * Replaces the Phase 1 default of "encrypted but the server certificate is not verified". Rules:
 *  - Loopback hosts (judged from the PARSED hostname only, never by searching the URL text) connect in plain text:
 *    nothing crosses a network.
 *  - Every other host is verified. Trust comes from, in order: STORAGE_DB_SSL_CA (PEM text or a file path), the pinned
 *    Supabase Root 2021 CA for *.supabase.co / *.supabase.com, otherwise the platform's own CA store. There is no
 *    unverified path in a production runtime; a failed verification is a failed connection.
 *  - The URL is never handed to pg as a connection string. pg lets values parsed from a connection string override the
 *    `ssl` option, so `?sslmode=no-verify` in DATABASE_URL would silently switch verification off. We pass discrete
 *    fields instead, ignore every URL parameter except application_name, and refuse a URL that asks for plain text or
 *    no verification.
 *  - There is no switch that turns verification off. A developer whose remote database uses a private CA supplies that CA
 *    through STORAGE_DB_SSL_CA.
 * Errors never echo the URL (it contains the password).
 */
export class DatabaseTlsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseTlsError';
  }
}

export type DatabaseTlsMode =
  | 'loopback-plain'
  | 'verified-custom-ca'
  | 'verified-supabase-root'
  | 'verified-system-store';

export interface DatabaseConnectionPlan {
  /** discrete fields only: never a connection string */
  config: PoolConfig;
  tls: DatabaseTlsMode;
  host: string;
  port: number;
}

const isLoopback = (host: string) => host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);
const isSupabaseHost = (host: string) => /(^|\.)supabase\.(co|com)$/.test(host);
const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

function certificatesFrom(pem: string, label: string): string[] {
  const blocks = pem.match(PEM_BLOCK) ?? [];
  if (!blocks.length) throw new DatabaseTlsError(`${label} does not contain a PEM certificate`);
  const now = Date.now();
  for (const block of blocks) {
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(block);
    } catch {
      throw new DatabaseTlsError(`${label} contains a certificate that cannot be parsed`);
    }
    if (Date.parse(cert.validTo) < now) throw new DatabaseTlsError(`${label} contains an expired certificate (valid until ${cert.validTo})`);
  }
  return blocks;
}

function customCa(raw: string): string[] {
  const text = raw.includes('BEGIN CERTIFICATE') ? raw : (() => {
    try {
      return readFileSync(raw, 'utf8');
    } catch {
      throw new DatabaseTlsError('STORAGE_DB_SSL_CA is neither PEM text nor a readable file');
    }
  })();
  return certificatesFrom(text, 'STORAGE_DB_SSL_CA');
}

/** The pinned root, accepted only if it is exactly one certificate with the recorded fingerprint (parameters are a test seam). */
export function pinnedSupabaseRoot(pem: string = SUPABASE_ROOT_2021_CA_PEM, expectedSha256: string = SUPABASE_ROOT_2021_CA_SHA256): string[] {
  const blocks = certificatesFrom(pem, 'the pinned Supabase root');
  if (blocks.length !== 1 || new X509Certificate(blocks[0]).fingerprint256 !== expectedSha256) {
    throw new DatabaseTlsError('the pinned Supabase root does not match its recorded fingerprint');
  }
  return blocks;
}

function decode(part: string, what: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    throw new DatabaseTlsError(`database URL ${what} is not valid percent-encoding`);
  }
}

export function planDatabaseConnection(url: string, env: NodeJS.ProcessEnv = process.env): DatabaseConnectionPlan {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new DatabaseTlsError('database URL is not a valid URL');
  }
  if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') throw new DatabaseTlsError('database URL must use postgres:// or postgresql://');
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host) throw new DatabaseTlsError('database URL has no host');
  const port = Number(u.port || 5432);
  // parameter names are matched case-insensitively so a refusal can never depend on letter case
  const param = (name: string) => {
    for (const [k, v] of u.searchParams) if (k.toLowerCase() === name) return v;
    return undefined;
  };
  const appName = param('application_name');
  const base: PoolConfig = {
    host,
    port,
    user: u.username ? decode(u.username, 'user') : undefined,
    password: u.password ? decode(u.password, 'password') : undefined,
    database: u.pathname.length > 1 ? decode(u.pathname.slice(1), 'database name') : undefined,
    ...(appName ? { application_name: appName.slice(0, 63) } : {}),
  };

  if (isLoopback(host)) return { config: { ...base, ssl: false }, tls: 'loopback-plain', host, port };

  const mode = (param('sslmode') ?? '').toLowerCase();
  const sslParam = (param('ssl') ?? '').toLowerCase();
  const weakens = ['disable', 'allow', 'prefer', 'no-verify'].includes(mode) || ['false', '0', 'no-verify'].includes(sslParam);
  if (weakens) {
    throw new DatabaseTlsError('the database URL asks for plain text or unverified TLS (sslmode/ssl); certificate verification is enforced for every remote database');
  }

  const caEnv = env.STORAGE_DB_SSL_CA?.trim();
  const ssl: tls.ConnectionOptions = { rejectUnauthorized: true, minVersion: 'TLSv1.2' };
  let tlsMode: DatabaseTlsMode;
  if (caEnv) {
    ssl.ca = customCa(caEnv);
    tlsMode = 'verified-custom-ca';
  } else if (isSupabaseHost(host)) {
    ssl.ca = pinnedSupabaseRoot();
    tlsMode = 'verified-supabase-root';
  } else {
    tlsMode = 'verified-system-store';
  }
  return { config: { ...base, ssl }, tls: tlsMode, host, port };
}

export interface TlsProbeResult {
  ok: boolean;
  stage: 'connect' | 'sslrequest' | 'tls' | 'skipped';
  /** Node/OpenSSL error code or message when !ok; never includes a URL or credentials */
  error?: string;
  protocol?: string;
  peer?: { subject?: string; issuer?: string; validTo?: string };
}

const SSL_REQUEST = Buffer.from([0x00, 0x00, 0x00, 0x08, 0x04, 0xd2, 0x16, 0x2f]);

/**
 * Handshake-only check of a plan: sends the 8-byte SSLRequest and a TLS ClientHello, then reports whether the server's
 * certificate chain verifies under the plan's trust settings. No startup packet, user name, password or query is sent,
 * so it is safe against a production database. `dial` redirects the TCP connection (tests, port-forwards) while the
 * certificate is still verified against the plan's host name.
 */
export function probeDatabaseTls(plan: DatabaseConnectionPlan, opts: { timeoutMs?: number; dial?: { host: string; port: number } } = {}): Promise<TlsProbeResult> {
  if (plan.tls === 'loopback-plain') return Promise.resolve({ ok: true, stage: 'skipped' });
  const ssl = plan.config.ssl as tls.ConnectionOptions;
  return new Promise((resolve) => {
    const raw = net.connect({ host: opts.dial?.host ?? plan.host, port: opts.dial?.port ?? plan.port });
    raw.setTimeout(opts.timeoutMs ?? 10_000);
    const done = (r: TlsProbeResult) => {
      raw.destroy();
      resolve(r);
    };
    raw.once('timeout', () => done({ ok: false, stage: 'connect', error: 'timeout' }));
    raw.once('error', (e: NodeJS.ErrnoException) => done({ ok: false, stage: 'connect', error: e.code ?? e.message }));
    raw.once('connect', () => raw.write(SSL_REQUEST));
    raw.once('data', (b) => {
      if (b[0] !== 0x53) return done({ ok: false, stage: 'sslrequest', error: 'the server does not offer TLS' });
      const s = tls.connect({ ...ssl, socket: raw, servername: net.isIP(plan.host) ? undefined : plan.host });
      s.once('error', (e: NodeJS.ErrnoException) => done({ ok: false, stage: 'tls', error: e.code ?? e.message }));
      s.once('secureConnect', () => {
        const c = s.getPeerCertificate();
        const cn = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
        done({ ok: s.authorized, stage: 'tls', protocol: s.getProtocol() ?? undefined, peer: { subject: cn(c.subject?.CN), issuer: cn(c.issuer?.CN), validTo: c.valid_to } });
      });
    });
  });
}
