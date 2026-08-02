import type { ArchitectureDecision, FrameworkAdapter } from './adapters.js';

/**
 * The `synthesis-architecture` validation gate.
 *
 * Extracted from `foundation.ts` so the rule has a name, a test, and one place to
 * change — it took a production outage to find it inlined in a return statement.
 *
 * The gate used to read:
 *
 *     Boolean(framework.buildCommand || architecture.primary === 'static_site')
 *
 * which asked the wrong question. `selectFrameworkAdapter` chooses `static-web`
 * whenever the repository contains an `index.html`, and `static-web` deliberately
 * has `buildCommand: null` — a static site has nothing to build. So the moment a
 * repository had an index.html, the stage failed unless the architecture *also*
 * happened to be labelled `static_site`, which it is not for a dashboard, an app,
 * or anything with a backend.
 *
 * That is every follow-up prompt against an already-built site. The stage has one
 * attempt and no retry, so the whole run died in about four seconds with no events
 * and a blank error.
 *
 * The real question is whether the selected framework can be verified at all. A
 * build command is one way; a production verification step is another. A framework
 * offering neither is genuinely unusable, and that — and only that — is what this
 * gate should stop.
 */
export function architectureStageIsValid(
  _architecture: ArchitectureDecision,
  framework: Pick<FrameworkAdapter, 'buildCommand' | 'productionVerification'>,
): boolean {
  if (framework.buildCommand && framework.buildCommand.trim().length > 0) return true;
  // No build step is legitimate — static hosting serves the files as they are —
  // provided there is still some way to check the result before it ships.
  return framework.productionVerification.length > 0;
}
