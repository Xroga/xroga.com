import type {
  ProjectFile,
} from '../../ai/patches.js';

import {
  commandsFor,
  detectComposition,
  sandboxImageFor,
} from '../runtime/registry.js';

import type {
  ProjectRuntimeManager,
} from './manager.js';

export interface DependencyInstallStep {
  readonly componentRoot:
    string;

  readonly adapterId:
    string;

  readonly image:
    string | null;

  readonly command:
    string;

  readonly args:
    readonly string[];

  readonly cwd:
    string;

  readonly purpose:
    string;
}

export interface DependencyInstallAttempt {
  readonly componentRoot:
    string;

  readonly command:
    string;

  readonly attempt:
    number;

  readonly exitCode:
    number | null;

  readonly durationMs:
    number;

  readonly stdout:
    string;

  readonly stderr:
    string;
}

export interface DependencyInstallResult {
  readonly installed:
    boolean;

  readonly steps:
    readonly DependencyInstallStep[];

  readonly attempts:
    readonly DependencyInstallAttempt[];

  readonly failures:
    readonly string[];

  readonly blockers:
    readonly string[];
}

const MAX_INSTALL_ATTEMPTS =
  2;

export function dependencyInstallPlan(
  files:
    readonly ProjectFile[],
): readonly DependencyInstallStep[] {
  const composition =
    detectComposition(
      files,
    );

  const steps:
    DependencyInstallStep[] =
    [];

  for (
    const component of
    composition.components
  ) {
    const image =
      sandboxImageFor(
        component,
      );

    for (
      const command of
      commandsFor(
        component,
        'install',
      )
    ) {
      steps.push({
        componentRoot:
          component.root,

        adapterId:
          component.adapterId,

        image,

        command:
          command.command,

        args:
          command.args,

        cwd:
          command.cwd ??
          component.root,

        purpose:
          command.purpose,
      });
    }
  }

  return steps;
}

export class ProjectDependencyManager {
  constructor(
    private readonly runtime:
      ProjectRuntimeManager,
  ) {}

  async install(
    input: {
      sessionId:
        string;

      sessionImage:
        string | null;

      files:
        readonly ProjectFile[];
    },
  ): Promise<DependencyInstallResult> {
    const steps =
      dependencyInstallPlan(
        input.files,
      );

    const attempts:
      DependencyInstallAttempt[] =
      [];

    const failures:
      string[] =
      [];

    const blockers:
      string[] =
      [];

    for (
      const step of
      steps
    ) {
      if (
        step.image &&
        input.sessionImage &&
        step.image !==
          input.sessionImage
      ) {
        blockers.push(
          `${step.componentRoot || '.'}: requires runtime image ${step.image}, but this session uses ${input.sessionImage}. Use a separate component runtime.`,
        );

        continue;
      }

      let installed =
        false;

      let finalError =
        '';

      for (
        let attempt =
          1;

        attempt <=
        MAX_INSTALL_ATTEMPTS;

        attempt +=
          1
      ) {
        const result =
          await this.runtime.exec(
            input.sessionId,
            {
              command:
                step.command,

              args:
                step.args,

              cwd:
                step.cwd,

              /*
               * Adapter install steps are the only steps allowed to
               * request package-registry network access.
               */
              networkPolicy:
                'registry-only',

              timeoutMs:
                300_000,
            },
          );

        attempts.push({
          componentRoot:
            step.componentRoot,

          command:
            step.command,

          attempt,

          exitCode:
            result.exitCode,

          durationMs:
            result.durationMs,

          stdout:
            result.stdout.slice(
              -4_000,
            ),

          stderr:
            result.stderr.slice(
              -4_000,
            ),
        });

        if (
          result.exitCode ===
          0
        ) {
          installed =
            true;

          break;
        }

        finalError =
          result.stderr ||
          result.stdout ||
          'Dependency installation failed without output.';
      }

      if (
        !installed
      ) {
        failures.push(
          `${step.componentRoot || '.'}: ${step.command} failed after ${MAX_INSTALL_ATTEMPTS} attempt(s) — ${finalError.slice(
            0,
            2_000,
          )}`,
        );
      }
    }

       return {
      installed:
        failures.length ===
          0 &&
        blockers.length ===
          0,

      steps,

      attempts,

      failures,

      blockers,
    };
  }
}
     
