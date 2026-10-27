import { randomUUID } from 'node:crypto';
import { MemoryObjectStore } from '../memoryObjectStore.js';
import { defaultPolicyConfig, type StoragePolicyConfig } from '../policy.js';
import { MemoryStorageRepository } from '../repository.js';
import { StorageService, type QuotaResolver } from '../storageService.js';
import type { StorageActor } from '../types.js';

export const BUCKET = 'xroga-drive-test';

export interface Harness {
  repo: MemoryStorageRepository;
  store: MemoryObjectStore;
  svc: StorageService;
  clock: { t: number };
  alice: StorageActor;
  bob: StorageActor;
  aliceProject: string;
  bobProject: string;
}

export function makeActor(): StorageActor {
  const id = randomUUID();
  return { userId: id, tenantId: id };
}

export function harness(opts: { quota?: QuotaResolver; policy?: Partial<StoragePolicyConfig> } = {}): Harness {
  const clock = { t: Date.parse('2026-10-22T10:00:00Z') };
  const repo = new MemoryStorageRepository(() => new Date(clock.t));
  const store = new MemoryObjectStore(() => clock.t);
  const alice = makeActor();
  const bob = makeActor();
  const aliceProject = randomUUID();
  const bobProject = randomUUID();
  repo.projects.set(aliceProject, alice.userId);
  repo.projects.set(bobProject, bob.userId);
  const svc = new StorageService({
    repo, store, bucket: BUCKET, quota: opts.quota, now: () => new Date(clock.t),
    policy: { ...defaultPolicyConfig({}), ...opts.policy },
  });
  return { repo, store, svc, clock, alice, bob, aliceProject, bobProject };
}

/** Browser-side half of an upload against the synthetic store. */
export async function browserUpload(h: Harness, actor: StorageActor, body: Buffer, o: { filename?: string; contentType?: string; projectId?: string | null; sha256?: string } = {}) {
  const init = await h.svc.initiateUpload(actor, {
    projectId: o.projectId ?? null, filename: o.filename ?? 'report.txt', contentType: o.contentType ?? 'text/plain', size: body.length, sha256: o.sha256,
  });
  if (init.mode !== 'single') throw new Error('expected single');
  const put = h.store.clientPut(init.upload.url, init.upload.headers, body);
  return { init, put };
}
