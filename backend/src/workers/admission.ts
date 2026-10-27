/**
 * Bounded concurrency with tenant fairness for browser jobs (INFRA-006).
 *
 * A browser job is expensive (a Chromium process tree, memory, an egress budget), and the host has a fixed number of slots. Two rules
 * keep one tenant from being everyone's outage:
 *
 *  - a PER-TENANT CAP on running jobs, so a tenant that submits fifty jobs holds at most `maxPerTenant` slots, and
 *  - FAIR ORDER for waiting jobs: when a slot frees, it goes to the waiting tenant with the fewest running jobs, and among equals to the
 *    tenant that has waited longest (round robin). A noisy tenant's backlog can delay only its own jobs.
 *
 * The queue is bounded per tenant and in total; a full queue refuses immediately with a typed error instead of growing without limit.
 * A job waiting in the queue leaves it the moment its signal aborts. `release` is idempotent, so a double release can never free a
 * slot that belongs to someone else.
 */

export type AdmissionFailure = 'QUEUE_FULL' | 'ADMISSION_ABORTED';

export class AdmissionError extends Error {
  readonly code: AdmissionFailure;
  readonly safeReasons: string[];
  constructor(code: AdmissionFailure, reason: string) {
    super(reason);
    this.name = 'AdmissionError';
    this.code = code;
    this.safeReasons = [reason];
  }
}

export interface AdmissionOptions {
  maxConcurrent: number;
  maxPerTenant: number;
  maxQueuedPerTenant: number;
  maxQueuedTotal: number;
}

interface Waiter {
  tenantId: string;
  seq: number;
  grant: (release: () => void) => void;
  fail: (e: Error) => void;
  cleanup: () => void;
}

export class AdmissionController {
  readonly #opts: AdmissionOptions;
  readonly #running = new Map<string, number>();
  readonly #queues = new Map<string, Waiter[]>();
  #runningTotal = 0;
  #queuedTotal = 0;
  #seq = 0;

  constructor(options: AdmissionOptions) {
    for (const [k, v] of Object.entries(options)) {
      if (!Number.isSafeInteger(v) || v < 1) throw new Error(`admission option ${k} must be a positive integer`);
    }
    if (options.maxPerTenant > options.maxConcurrent) throw new Error('maxPerTenant cannot exceed maxConcurrent');
    this.#opts = { ...options };
  }

  stats(): { running: number; queued: number; runningByTenant: Record<string, number> } {
    return { running: this.#runningTotal, queued: this.#queuedTotal, runningByTenant: Object.fromEntries(this.#running) };
  }

  /** Resolves with a release function once a slot is granted. */
  acquire(tenantId: string, signal?: AbortSignal): Promise<() => void> {
    if (!tenantId || typeof tenantId !== 'string') return Promise.reject(new Error('a tenant id is required'));
    if (signal?.aborted) return Promise.reject(new AdmissionError('ADMISSION_ABORTED', 'the job was cancelled before it started'));
    // `#dispatch` grants waiting jobs eagerly whenever capacity exists for them, so a waiter and free capacity for it never coexist:
    // a newcomer that can run now cannot be jumping anyone.
    if (this.#canRun(tenantId)) return Promise.resolve(this.#take(tenantId));

    const queue = this.#queues.get(tenantId) ?? [];
    if (queue.length >= this.#opts.maxQueuedPerTenant || this.#queuedTotal >= this.#opts.maxQueuedTotal) {
      return Promise.reject(new AdmissionError('QUEUE_FULL', 'too many browser jobs are waiting; try again shortly'));
    }
    return new Promise<() => void>((resolve, reject) => {
      const waiter: Waiter = {
        tenantId, seq: this.#seq++,
        grant: resolve, fail: reject,
        cleanup: () => signal?.removeEventListener('abort', onAbort),
      };
      const onAbort = () => {
        const q = this.#queues.get(tenantId);
        const i = q ? q.indexOf(waiter) : -1;
        if (i >= 0) {
          q!.splice(i, 1);
          if (!q!.length) this.#queues.delete(tenantId);
          this.#queuedTotal--;
          waiter.cleanup();
          reject(new AdmissionError('ADMISSION_ABORTED', 'the job was cancelled while waiting'));
        }
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      queue.push(waiter);
      this.#queues.set(tenantId, queue);
      this.#queuedTotal++;
    });
  }

  #canRun(tenantId: string): boolean {
    return this.#runningTotal < this.#opts.maxConcurrent && (this.#running.get(tenantId) ?? 0) < this.#opts.maxPerTenant;
  }

  #take(tenantId: string): () => void {
    this.#runningTotal++;
    this.#running.set(tenantId, (this.#running.get(tenantId) ?? 0) + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#runningTotal--;
      const n = (this.#running.get(tenantId) ?? 1) - 1;
      if (n <= 0) this.#running.delete(tenantId); else this.#running.set(tenantId, n);
      this.#dispatch();
    };
  }

  /** Hands free slots to waiting tenants: fewest running first, then the oldest waiter. */
  #dispatch(): void {
    while (this.#runningTotal < this.#opts.maxConcurrent) {
      let best: Waiter | null = null;
      let bestRunning = Infinity;
      for (const [tenantId, q] of this.#queues) {
        const head = q[0];
        if (!head) continue;
        const running = this.#running.get(tenantId) ?? 0;
        if (running >= this.#opts.maxPerTenant) continue;
        if (running < bestRunning || (running === bestRunning && best && head.seq < best.seq)) { best = head; bestRunning = running; }
      }
      if (!best) return;
      const q = this.#queues.get(best.tenantId)!;
      q.shift();
      if (!q.length) this.#queues.delete(best.tenantId);
      this.#queuedTotal--;
      best.cleanup();
      best.grant(this.#take(best.tenantId));
    }
  }
}
