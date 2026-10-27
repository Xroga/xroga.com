import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MigrationEngine, type ReadLinker } from './engine.js';
import type { MigrationLedger } from './ledger.js';
import { NotApprovedError } from './types.js';

export type Phase = 'discover' | 'dry-run' | 'copy' | 'verify' | 'reconcile' | 'read-new' | 'freeze-old' | 'rollback' | 'manifest';

/** Phases that change object storage, serving behaviour or retention markers. They require `--execute`. */
export const MUTATING: ReadonlySet<Phase> = new Set(['copy', 'read-new', 'freeze-old', 'rollback']);

export class BlockedError extends Error {
  constructor(readonly missing: string[]) {
    super(`BLOCKED: missing ${missing.join(', ')}`);
    this.name = 'BlockedError';
  }
}

const SECRETISH = /(X-Amz-[A-Za-z-]+=)[^&\s"]+|(secret|token|password|authorization|api[_-]?key|access[_-]?key)(["':= ]+)[^\s"',}]{6,}/gi;
export function redactDeep<T>(v: T): T {
  if (typeof v === 'string') return v.replace(SECRETISH, (_m, a, b, c) => (a ? `${a}[redacted]` : `${b}${c}[redacted]`)) as unknown as T;
  if (Array.isArray(v)) return v.map(redactDeep) as unknown as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, /secret|token|password|authorization/i.test(k) ? '[redacted]' : redactDeep(x)])) as T;
  return v;
}

export interface Flags { execute: boolean; concurrency?: number; limit?: number; rehashSource?: boolean; pageSize?: number }

export interface PhaseResult { phase: Phase; jobId: string; executed: boolean; dryRunOnly: boolean; result: unknown; at: string }

export async function runPhase(engine: MigrationEngine, ledger: MigrationLedger, jobId: string, phase: Phase, flags: Flags, now: () => Date = () => new Date()): Promise<PhaseResult> {
  const base = { phase, jobId, at: now().toISOString() };
  if (MUTATING.has(phase) && !flags.execute) {
    const counts = await ledger.countsByStatus(jobId);
    const n = (f: (r: (typeof counts)[number]) => boolean) => counts.filter(f).reduce((a, r) => a + r.n, 0);
    const plan: Record<Phase, unknown> = {
      copy: { wouldCopy: n((r) => r.status === 'ELIGIBLE' || r.status === 'FAILED'), bytes: counts.filter((r) => r.status === 'ELIGIBLE' || r.status === 'FAILED').reduce((a, r) => a + r.bytes, 0) },
      'read-new': { wouldSwitch: n((r) => r.status === 'VERIFIED' && r.readMode === 'legacy') },
      'freeze-old': { wouldFreeze: n((r) => r.status === 'VERIFIED' && r.readMode === 'new' && r.sourceRetention === 'RETAINED') },
      rollback: { wouldRevert: n((r) => r.readMode === 'new') },
      discover: null, 'dry-run': null, verify: null, reconcile: null, manifest: null,
    };
    return { ...base, executed: false, dryRunOnly: true, result: { message: 'no changes made; pass --execute to perform this phase', plan: plan[phase] } };
  }
  let result: unknown;
  switch (phase) {
    case 'discover': result = await engine.discover(jobId, { pageSize: flags.pageSize }); break;
    case 'dry-run': result = await engine.dryRun(jobId); break;
    case 'copy': result = await engine.copy(jobId, { concurrency: flags.concurrency, limit: flags.limit }); break;
    case 'verify': result = await engine.verify(jobId, { rehashSource: flags.rehashSource }); break;
    case 'reconcile': result = await engine.reconcile(jobId); break;
    case 'read-new': result = await engine.readNew(jobId, { limit: flags.limit }); break;
    case 'freeze-old': result = await engine.freezeOld(jobId); break;
    case 'rollback': result = await engine.rollbackReadMode(jobId); break;
    case 'manifest': result = await engine.deletionManifest(jobId); break;
  }
  return { ...base, executed: MUTATING.has(phase), dryRunOnly: false, result };
}

export async function writeReceipt(dir: string, r: PhaseResult): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${r.at.replace(/[:.]/g, '-')}_${r.jobId}_${r.phase}.json`);
  await writeFile(file, JSON.stringify(redactDeep(r), null, 2), { flag: 'wx' });
  return file;
}

export function parseArgs(argv: string[]): { positional: string[]; flags: Record<string, string | true> } {
  const positional: string[] = []; const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) flags[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[k] = argv[++i];
      else flags[k] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

export function toFlags(f: Record<string, string | true>): Flags {
  const num = (v: string | true | undefined) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : undefined);
  return { execute: f.execute === true, concurrency: num(f.concurrency), limit: num(f.limit), pageSize: num(f['page-size']), rehashSource: f['rehash-source'] === true };
}

export type { ReadLinker };
export { NotApprovedError };
