import { randomUUID } from 'node:crypto';

import type { BuilderService } from '../service.js';
import type { Phase2Store } from '../phase2Store.js';
import type { BuilderStore } from '../store.js';
import { BuilderError, type BuilderProject, type BuilderRevision, type VerificationRecord } from '../types.js';
import { deriveQaPlan } from './plan.js';
import { buildRepairPacket, DEFAULT_MAX_REPAIR_ATTEMPTS, runRepairLoop, type RepairLoopResult, type RepairPacket, type RepairPorts } from './repair.js';
import { passedCheckIds, runQa, type QaEnvironment } from './runner.js';
import type { QaDriver, QaPlan, QaReport } from './types.js';

/** Where the application for a revision is running, or null when it cannot be (no runtime). */
export interface QaTarget {
  ensure(input: { userId: string; project: BuilderProject; revision: BuilderRevision; signal?: AbortSignal }): Promise<{ baseUrl: string; environment: QaEnvironment } | null>;
}

/** One canonical repair run through the SoftwareAgent path. */
export interface RepairRunner {
  (input: {
    userId: string;
    projectId: string;
    runId: string;
    prompt: string;
    guard: (committed: BuilderRevision['files'], head: BuilderRevision['files']) => void;
    signal?: AbortSignal;
  }): Promise<{ revision: BuilderRevision | null; reason: string; noChange?: boolean }>;
}

export interface QaServiceDeps {
  readonly builder: BuilderService;
  readonly store: BuilderStore;
  readonly phase2: Phase2Store;
  readonly target: QaTarget;
  readonly openDriver: (baseUrl: string) => Promise<QaDriver>;
  readonly repair: RepairRunner;
  /** Whether the project's budget allows another model-backed repair attempt. */
  readonly budgetAllows: (userId: string, projectId: string) => Promise<boolean>;
}

export interface QaSummary {
  readonly status: QaReport['status'];
  readonly revisionId: string;
  readonly runId: string;
  readonly executedChecks: number;
  readonly failedChecks: number;
  readonly pendingChecks: number;
  readonly reason: string;
  readonly verificationId: string;
}

const verificationStatus = (status: QaReport['status']) => (status === 'passed' ? 'verified' : status === 'failed' ? 'failed' : 'partial');

function summarize(report: QaReport, record: VerificationRecord): QaSummary {
  return {
    status: report.status, revisionId: record.revisionId, runId: record.runId, executedChecks: report.executedChecks, failedChecks: report.failedChecks,
    pendingChecks: report.pendingChecks, reason: report.reason, verificationId: record.id,
  };
}

export class QaService {
  /** One QA or repair run per project at a time in this process, so a browser is never started twice for the same project. */
  private readonly running = new Set<string>();

  constructor(private readonly deps: QaServiceDeps) {}

  private async exclusive<T>(userId: string, projectId: string, run: () => Promise<T>): Promise<T> {
    const key = `${userId}:${projectId}`;
    if (this.running.has(key)) throw new BuilderError('conflict', 'Tests are already running for this project.');
    this.running.add(key);
    try {
      return await run();
    } finally {
      this.running.delete(key);
    }
  }

  private async headOf(userId: string, projectId: string) {
    const project = await this.deps.builder.requireProject(userId, projectId);
    const { revision } = await this.deps.builder.headFiles(userId, project);
    if (!revision) throw new BuilderError('not_found', 'The project has no source revision yet.');
    return { project, revision };
  }

  /** Executes a plan against a revision's running application. Pending (never passed) when there is none. */
  private async execute(userId: string, project: BuilderProject, revision: BuilderRevision, plan: QaPlan, options: { only?: ReadonlySet<string>; previouslyPassed?: ReadonlySet<string>; signal?: AbortSignal }): Promise<QaReport> {
    const target = await this.deps.target.ensure({ userId, project, revision, signal: options.signal });
    if (!target) return this.notRun(plan, 'No running application is available for this revision.');
    return this.executeAgainst(target, plan, options);
  }

  private notRun(plan: QaPlan, reason: string): QaReport {
    const now = new Date().toISOString();
    return {
      version: 1, status: 'pending_runtime', executedChecks: 0, passedChecks: 0, failedChecks: 0, pendingChecks: plan.checks.length, notChecked: plan.notChecked,
      checks: plan.checks.map((check) => ({ id: check.id, title: check.title, category: check.category, viewport: check.viewport, required: check.required, status: 'pending' as const, executed: false, failureClass: null, durationMs: 0, pendingReason: reason, evidence: null, regression: false })),
      environment: { driver: 'none', browser: null, baseHost: null }, startedAt: now, finishedAt: now, reason: `No check was executed: ${reason}`,
    };
  }

  private async executeAgainst(target: { baseUrl: string; environment: QaEnvironment }, plan: QaPlan, options: { only?: ReadonlySet<string>; previouslyPassed?: ReadonlySet<string>; signal?: AbortSignal }): Promise<QaReport> {
    let driver: QaDriver;
    try {
      driver = await this.deps.openDriver(target.baseUrl);
    } catch (error) {
      // No usable browser in this environment: that is "not run", never a pass and never a server error.
      if ((error as { code?: string }).code !== 'BROWSER_UNAVAILABLE') throw error;
      return this.notRun(plan, error instanceof Error ? error.message : 'No browser is available in this environment.');
    }
    return runQa({ plan, driver, environment: target.environment, baseHost: new URL(target.baseUrl).host, only: options.only, previouslyPassed: options.previouslyPassed, signal: options.signal });
  }

  private async record(userId: string, project: BuilderProject, revision: BuilderRevision, runId: string, report: QaReport): Promise<VerificationRecord> {
    const saved = await this.deps.phase2.saveVerification(userId, project.id, {
      revisionId: revision.id, runId, kind: 'browser_qa', status: report.status, executedChecks: report.executedChecks,
      summary: { passed: report.passedChecks, failed: report.failedChecks, pending: report.pendingChecks, reason: report.reason, driver: report.environment.driver, browser: report.environment.browser },
      report,
    });
    if (!saved) throw new BuilderError('storage_failed', 'The QA result could not be stored; it is not recorded as verified.');
    // Evidence is only attached to the revision it tested.
    await this.deps.store.setRevisionVerification(userId, project.id, revision.id, verificationStatus(report.status));
    return saved.record;
  }

  /** Runs the QA plan against the project's current revision and records the evidence against it. */
  runQa(userId: string, projectId: string, input: { runId?: string; signal?: AbortSignal } = {}): Promise<{ report: QaReport; summary: QaSummary }> {
    return this.exclusive(userId, projectId, () => this.runQaUnlocked(userId, projectId, input));
  }

  private async runQaUnlocked(userId: string, projectId: string, input: { runId?: string; signal?: AbortSignal }): Promise<{ report: QaReport; summary: QaSummary }> {
    const { project, revision } = await this.headOf(userId, projectId);
    const runId = input.runId ?? randomUUID();
    const plan = deriveQaPlan(project.spec, revision.files);
    const previous = await this.previousPassed(userId, projectId, revision);
    const report = await this.execute(userId, project, revision, plan, { previouslyPassed: previous, signal: input.signal });
    const record = await this.record(userId, project, revision, runId, report);
    if (report.status === 'failed') {
      await this.deps.store.setState(userId, projectId, 'partial', `Browser QA failed: ${report.reason}`, null);
    }
    return { report, summary: summarize(report, record) };
  }

  /** The checks that passed on the revision this one descends from, for regression detection. */
  private async previousPassed(userId: string, projectId: string, revision: BuilderRevision): Promise<ReadonlySet<string> | undefined> {
    if (!revision.parentRevisionId) return undefined;
    const records = await this.deps.phase2.listVerifications(userId, projectId, revision.parentRevisionId);
    const latest = records.find((record) => record.kind === 'browser_qa' && record.executedChecks > 0);
    if (!latest) return undefined;
    const full = await this.deps.phase2.getVerification(userId, projectId, latest.id);
    return full?.report ? passedCheckIds(full.report as QaReport) : undefined;
  }

  /** Latest QA summary recorded against the current revision. */
  async latest(userId: string, projectId: string): Promise<QaSummary | null> {
    const { revision } = await this.headOf(userId, projectId);
    const [record] = (await this.deps.phase2.listVerifications(userId, projectId, revision.id)).filter((row) => row.kind === 'browser_qa');
    if (!record) return null;
    const failed = Number(record.summary.failed ?? 0);
    return {
      status: record.status as QaReport['status'], revisionId: record.revisionId, runId: record.runId, executedChecks: record.executedChecks, failedChecks: failed,
      pendingChecks: Number(record.summary.pending ?? 0), reason: String(record.summary.reason ?? ''), verificationId: record.id,
    };
  }

  async history(userId: string, projectId: string, revisionId?: string) {
    await this.deps.builder.requireProject(userId, projectId);
    return this.deps.phase2.listVerifications(userId, projectId, revisionId);
  }

  async report(userId: string, projectId: string, verificationId: string) {
    await this.deps.builder.requireProject(userId, projectId);
    const record = await this.deps.phase2.getVerification(userId, projectId, verificationId);
    if (!record) throw new BuilderError('not_found', 'Verification not found.');
    return record;
  }

  /**
   * Verify, and if checks fail, repair within a bounded budget through the canonical path, then
   * verify again. The plan is fixed from the starting revision so a repair can never change what
   * is being asked of it.
   */
  verifyAndRepair(userId: string, projectId: string, input: { maxAttempts?: number; signal?: AbortSignal } = {}): Promise<RepairLoopResult> {
    return this.exclusive(userId, projectId, () => this.verifyAndRepairUnlocked(userId, projectId, input));
  }

  private async verifyAndRepairUnlocked(userId: string, projectId: string, input: { maxAttempts?: number; signal?: AbortSignal }): Promise<RepairLoopResult> {
    const { project, revision } = await this.headOf(userId, projectId);
    const plan = deriveQaPlan(project.spec, revision.files);
    const baseRunId = randomUUID();
    let counter = 0;
    const ports: RepairPorts = {
      qa: async ({ revision: target, only, previouslyPassed }) => this.execute(userId, project, target, plan, { only, previouslyPassed, signal: input.signal }),
      save: async (target, report) => {
        counter += 1;
        await this.record(userId, project, target, `${baseRunId.slice(0, 24)}-${counter}`, report);
      },
      repair: async ({ prompt, guard }) => {
        try {
          return await this.deps.repair({ userId, projectId, runId: randomUUID(), prompt, guard, signal: input.signal });
        } finally {
          // A refused, failed or no-change attempt must not keep the project's build slot.
          await this.deps.store.setState(userId, projectId, 'partial', 'A repair attempt finished; the project is being verified.', null).catch(() => undefined);
        }
      },
      budgetAllows: () => this.deps.budgetAllows(userId, projectId),
    };
    const result = await runRepairLoop({ plan, head: revision, maxAttempts: input.maxAttempts ?? DEFAULT_MAX_REPAIR_ATTEMPTS, ports, signal: input.signal });
    // Verified only when every required check actually executed and passed. Pending checks (for
    // example persistence without a test database) keep the project partial, with the reason.
    const fullyPassed = result.finalReport.status === 'passed';
    const finalState = fullyPassed ? 'verified' : 'partial';
    const reason = fullyPassed
      ? `Browser QA passed on revision ${result.headRevision.revisionNumber}.`
      : result.finalReport.status === 'partial' && result.attempts.length === 0 && (result.status === 'passed')
        ? `Browser QA found no failures, but some required checks could not run: ${result.finalReport.reason}`
        : `Browser QA is not passing: ${result.reason}`;
    await this.deps.store.setState(userId, projectId, finalState, reason, null);
    return result;
  }

  /** Exposed for tests and the API: the packet a repair would receive for the current failures. */
  previewPacket(report: QaReport, revision: BuilderRevision): RepairPacket {
    return buildRepairPacket(1, report, revision.files, []);
  }
}
