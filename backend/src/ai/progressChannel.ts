import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Request-scoped live steps for work done while one answer is prepared.
 *
 * The transport that is streaming to the user sets a sink; code doing real work reports when a step
 * starts and how it ended. With no sink (every non-streaming caller) reporting does nothing. This is
 * display only: it grants nothing, meters nothing and must never change or fail the work itself.
 */

export interface ProgressStepFrame {
  agent: 'session';
  status: 'step';
  activityId: string;
  activityStatus: 'running' | 'completed' | 'failed';
  message: string;
  swarmActivity: string;
  /** Public pages the step actually used. */
  sources?: ProgressSource[];
}

export interface ProgressSource { title: string; url: string }

const MAX_SOURCES = 8;

type Sink = (frame: ProgressStepFrame) => void;

const channel = new AsyncLocalStorage<Sink>();

export function withProgressSink<T>(sink: Sink, run: () => T): T {
  return channel.run(sink, run);
}

export interface ProgressStep {
  done(message: string, sources?: readonly ProgressSource[]): void;
  fail(message: string): void;
}

export function startProgressStep(message: string): ProgressStep {
  const sink = channel.getStore();
  const activityId = `step-${randomUUID()}`;
  let settled = false;
  const report = (activityStatus: ProgressStepFrame['activityStatus'], text: string, sources?: readonly ProgressSource[]) => {
    try {
      const listed = (sources ?? []).filter(source => /^https?:\/\//i.test(source.url)).slice(0, MAX_SOURCES)
        .map(source => ({ title: String(source.title ?? '').slice(0, 160), url: source.url.slice(0, 600) }));
      sink?.({ agent: 'session', status: 'step', activityId, activityStatus, message: text, swarmActivity: text,
        ...(listed.length ? { sources: listed } : {}) });
    } catch {
      // Display only.
    }
  };
  report('running', message);
  const settle = (activityStatus: 'completed' | 'failed', text: string, sources?: readonly ProgressSource[]) => {
    if (settled) return;
    settled = true;
    report(activityStatus, text, sources);
  };
  return { done: (text, sources) => settle('completed', text, sources), fail: (text) => settle('failed', text) };
}
