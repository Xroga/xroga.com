/**
 * Install, typecheck and build as **one** sandbox execution.
 *
 * ## The defect this closes
 *
 * `compileValidate` ran each stage through its own `runCmd` → `executeSandboxed` call:
 *
 *     npm install                      → execution 1
 *     node_modules/.bin/tsc --noEmit   → execution 2
 *     npm run build                    → execution 3
 *
 * That is safe only where executions share a filesystem. They do not. `SandboxRuntime.execute()`
 * is one-shot, and the Fly provider creates a **disposable microVM per execution** that
 * materializes the project's *source files* and nothing else. So the `node_modules` produced by
 * execution 1 does not exist in execution 2: the local `tsc` is missing, the `npx` fallback has
 * no network under a `none` policy, and the stage exits **127 — command not found**.
 *
 * The pipeline then reported that as evidence about the user's code:
 *
 *     "TypeScript errors remain after 1 automatic repair attempt — tsc failed (exit 127)."
 *
 * There were no TypeScript errors. The compiler never ran. Observed in production run
 * `2e559410-f9b5-4146-8c61-5447f0683426`, which generated 28 files, installed cleanly, and was
 * still blocked from shipping.
 *
 * The failure was latent until an isolation provider was configured: without one,
 * `executeSandboxed` threw `SandboxUnavailableError` and compile returned `skipped: true`, so
 * builds shipped with the typecheck silently not performed. Enabling the sandbox turned a
 * skipped check into a false accusation — which is worse, and is the reason this is a defect
 * rather than a slow path.
 *
 * ## Why one command rather than a shared workspace
 *
 * A persistent workspace across executions would mean a long-lived sandbox, which is exactly the
 * property the isolation boundary gives up: disposable per execution, destroyed after, nothing
 * carried between runs. One command that performs every stage fits the existing contract
 * unchanged — the same shape already proven for browser verification in `inSandboxBrowser.ts`.
 *
 * ## Network policy is preserved, not widened
 *
 * The combined execution needs the registry for `npm install`, so it runs under
 * `registry-only`. The stages *after* install regain the previous denial from inside the
 * sandbox: `unshare -n` drops the network namespace before typecheck and build, which is the
 * mechanism the Fly provider itself uses for `networkPolicy: 'none'`.
 *
 * Where `unshare` is unavailable the stages still run, and the result says so
 * (`networkDeniedAfterInstall: false`) rather than implying a denial that did not happen. A
 * security property that quietly degrades is worse than one that reports its own absence.
 */

/** Delimiters the host parses. Chosen to be things npm and tsc do not print. */
export const COMPILE_RESULT_BEGIN = '<<<XROGA_COMPILE_RESULT';
export const COMPILE_RESULT_END = 'XROGA_COMPILE_RESULT>>>';

export interface CompileCommandRequest {
  /** Arguments for `npm`, e.g. `['install', '--ignore-scripts', …]`. */
  readonly installArgs: readonly string[];
  /** Whether to run `tsc --noEmit`. */
  readonly typecheck: boolean;
  /**
   * The package script to run as the production build, or null for none.
   *
   * A script *name*, never a command line: it reaches the sandbox through the environment and
   * is run as `npm run "$name"`, so a script name containing a semicolon or a backtick is inert
   * rather than executable.
   */
  readonly buildScript: string | null;
}

export interface CompileCommandPayload {
  readonly installCode: number | null;
  readonly tscCode: number | null;
  readonly tscRan: boolean;
  readonly buildCode: number | null;
  readonly buildRan: boolean;
  /** False when `unshare` was unavailable, so the caller can state the truth. */
  readonly networkDeniedAfterInstall: boolean;
}

/**
 * The one command.
 *
 * Written as a script rather than assembled per stage because the stages are not independent:
 * typecheck needs what install produced, and the build needs both. Expressing that as one unit
 * is what makes the dependency real instead of assumed.
 */
export function buildCompileCommand(request: CompileCommandRequest): {
  command: string;
  args: string[];
} {
  const install = request.installArgs.map(shellQuote).join(' ');

  const script =
    'set -u\n' +
    'cd /work 2>/dev/null || cd "${XROGA_SANDBOX_WORKDIR:-.}" 2>/dev/null || true\n' +
    'INSTALL_CODE=-1; TSC_CODE=-1; TSC_RAN=false; BUILD_CODE=-1; BUILD_RAN=false\n' +
    // The network is dropped for everything after install, restoring the denial the separate
    // executions had. `unshare -n true` is a real probe: presence of the binary is not
    // permission to use it, and a container that dropped CAP_SYS_ADMIN will fail here.
    'if command -v unshare >/dev/null 2>&1 && unshare -n true >/dev/null 2>&1; then\n' +
    '  NET_DENY="unshare -n"; NET_DENIED=true\n' +
    'else\n' +
    '  NET_DENY=""; NET_DENIED=false\n' +
    'fi\n' +
    `echo "--- npm install ---"\n` +
    `npm ${install} 2>&1; INSTALL_CODE=$?\n` +
    // Every later stage still runs even if install failed: a partial `node_modules` sometimes
    // typechecks, and the caller decides what the combination means. Reporting each code
    // separately is what lets it decide honestly.
    (request.typecheck
      ? 'echo "--- typecheck ---"\n' +
        'if [ -x ./node_modules/.bin/tsc ]; then\n' +
        '  TSC_RAN=true\n' +
        '  $NET_DENY ./node_modules/.bin/tsc --noEmit --pretty false 2>&1; TSC_CODE=$?\n' +
        'else\n' +
        // Not found is *our* missing dependency, not the project's type error. It stays
        // distinguishable so the caller never reports it as a TypeScript failure.
        '  echo "typecheck skipped: no local tsc after install"\n' +
        '  TSC_RAN=false; TSC_CODE=-1\n' +
        'fi\n'
      : '') +
    (request.buildScript
      ? 'echo "--- production build ---"\n' +
        'if [ "$INSTALL_CODE" -eq 0 ] && [ "$TSC_CODE" -eq 0 ]; then\n' +
        '  BUILD_RAN=true\n' +
        '  $NET_DENY npm run "$XROGA_COMPILE_BUILD_SCRIPT" 2>&1; BUILD_CODE=$?\n' +
        'fi\n'
      : '') +
    'printf "\\n%s{\\"installCode\\":%s,\\"tscCode\\":%s,\\"tscRan\\":%s,\\"buildCode\\":%s,\\"buildRan\\":%s,\\"networkDeniedAfterInstall\\":%s}%s\\n" ' +
    `"${COMPILE_RESULT_BEGIN}" "$INSTALL_CODE" "$TSC_CODE" "$TSC_RAN" "$BUILD_CODE" "$BUILD_RAN" "$NET_DENIED" "${COMPILE_RESULT_END}"\n` +
    // The command itself succeeds; the stage codes carry the verdict. A non-zero exit here
    // would be indistinguishable from the sandbox failing to run anything at all.
    'exit 0\n';

  return { command: '/bin/sh', args: ['-c', script] };
}

/**
 * Single-quotes a token for `sh`.
 *
 * The install arguments are repository constants rather than user input, but quoting them costs
 * nothing and means a future caller passing something derived from a manifest cannot turn an
 * argument into a command.
 */
function shellQuote(token: string): string {
  return `'${token.replace(/'/g, `'\\''`)}'`;
}

/**
 * Reads the structured result.
 *
 * Returns null when nothing was printed, which is a different fact from a stage reporting
 * failure — the caller must not read "our harness produced no result" as "the code is broken".
 */
export function parseCompileResult(stdout: string): CompileCommandPayload | null {
  const start = stdout.lastIndexOf(COMPILE_RESULT_BEGIN);
  if (start === -1) return null;
  const from = start + COMPILE_RESULT_BEGIN.length;
  const end = stdout.indexOf(COMPILE_RESULT_END, from);
  if (end === -1) return null;
  try {
    const raw = JSON.parse(stdout.slice(from, end)) as Record<string, unknown>;
    const code = (value: unknown): number | null => {
      const parsed = typeof value === 'number' ? value : Number.NaN;
      // `-1` is the script's "did not run" sentinel; it is not an exit code.
      return Number.isFinite(parsed) && parsed !== -1 ? parsed : null;
    };
    return {
      installCode: code(raw.installCode),
      tscCode: code(raw.tscCode),
      tscRan: raw.tscRan === true,
      buildCode: code(raw.buildCode),
      buildRan: raw.buildRan === true,
      networkDeniedAfterInstall: raw.networkDeniedAfterInstall === true,
    };
  } catch {
    return null;
  }
}
