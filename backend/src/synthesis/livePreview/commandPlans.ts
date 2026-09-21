import type {
  ProjectFile,
} from '../../ai/patches.js';

import type {
  LivePreviewCommandPlan,
  LivePreviewProcessPlan,
} from './types.js';

interface PackageJson {
  scripts?:
    Record<
      string,
      string
    >;

  bin?:
    | string
    | Record<
        string,
        string
      >;

  main?:
    string;
}

function file(
  files:
    readonly ProjectFile[],

  path:
    string,
): ProjectFile | undefined {
  return files.find(
    (
      item,
    ) =>
      item.path ===
      path,
  );
}

function manifest(
  files:
    readonly ProjectFile[],
): PackageJson | null {
  const pkg =
    file(
      files,
      'package.json',
    );

  if (
    !pkg
  ) {
    return null;
  }

  try {
    return JSON.parse(
      pkg.content,
    ) as PackageJson;
  } catch {
    return null;
  }
}

function packageManager(
  files:
    readonly ProjectFile[],
): string {
  if (
    file(
      files,
      'pnpm-lock.yaml',
    )
  ) {
    return 'pnpm';
  }

  if (
    file(
      files,
      'yarn.lock',
    )
  ) {
    return 'yarn';
  }

  if (
    file(
      files,
      'bun.lock',
    ) ||
    file(
      files,
      'bun.lockb',
    )
  ) {
    return 'bun';
  }

  return 'npm';
}

function scriptCommand(
  manager:
    string,

  script:
    string,

  extra:
    readonly string[] =
    [],
): {
  command:
    string;

  args:
    readonly string[];
} {
  if (
    manager ===
    'yarn'
  ) {
    return {
      command:
        manager,

      args: [
        'run',
        script,
        ...extra,
      ],
    };
  }

  return {
    command:
      manager,

    args: [
      'run',
      script,

      ...(
        extra.length
          ? [
              '--',
              ...extra,
            ]
          : []
      ),
    ],
  };
}

function pythonEntry(
  files:
    readonly ProjectFile[],

  names:
    readonly string[],
): string | null {
  for (
    const name of
    names
  ) {
    if (
      file(
        files,
        name,
      )
    ) {
      return name;
    }
  }

  return null;
}

export function cliPreviewCommand(
  files:
    readonly ProjectFile[],
): LivePreviewCommandPlan | null {
  if (
    file(
      files,
      'Cargo.toml',
    )
  ) {
    return {
      command:
        'cargo',

      args: [
        'run',
        '--',
        '--help',
      ],

      cwd:
        '',

      environment: {},

      timeoutMs:
        120_000,
    };
  }

  const pkg =
    manifest(
      files,
    );

  if (
    pkg
  ) {
    let entry:
      string | null =
      null;

    if (
      typeof pkg.bin ===
      'string'
    ) {
      entry =
        pkg.bin;
    } else if (
      pkg.bin &&
      typeof pkg.bin ===
        'object'
    ) {
      entry =
        Object
          .values(
            pkg.bin,
          )
          .find(
            (
              value,
            ) =>
              typeof value ===
                'string' &&
              Boolean(
                value.trim(),
              ),
          ) ??
        null;
    }

    if (
      entry
    ) {
      return {
        command:
          'node',

        args: [
          entry,
          '--help',
        ],

        cwd:
          '',

        environment: {},

        timeoutMs:
          60_000,
      };
    }

    if (
      pkg.scripts?.cli
    ) {
      const command =
        scriptCommand(
          packageManager(
            files,
          ),

          'cli',

          [
            '--help',
          ],
        );

      return {
        ...command,

        cwd:
          '',

        environment: {},

        timeoutMs:
          60_000,
      };
    }

    if (
      pkg.main
    ) {
      return {
        command:
          'node',

        args: [
          pkg.main,
          '--help',
        ],

        cwd:
          '',

        environment: {},

        timeoutMs:
          60_000,
      };
    }
  }

  const python =
    pythonEntry(
      files,

      [
        '__main__.py',
        'cli.py',
        'main.py',
        'src/__main__.py',
        'src/cli.py',
      ],
    );

  if (
    python
  ) {
    return {
      command:
        'python',

      args: [
        python,
        '--help',
      ],

      cwd:
        '',

      environment: {
        PYTHONUNBUFFERED:
          '1',
      },

      timeoutMs:
        60_000,
    };
  }

  if (
    file(
      files,
      'main.go',
    ) ||
    file(
      files,
      'go.mod',
    )
  ) {
    return {
      command:
        'go',

      args: [
        'run',
        '.',
        '--help',
      ],

      cwd:
        '',

      environment: {},

      timeoutMs:
        120_000,
    };
  }

  return null;
}

export function workerPreviewProcess(
  files:
    readonly ProjectFile[],
): LivePreviewProcessPlan | null {
  const pkg =
    manifest(
      files,
    );

  if (
    pkg
  ) {
    const script =
      pkg.scripts?.worker
        ? 'worker'
        : pkg.scripts?.start
          ? 'start'
          : pkg.scripts?.dev
            ? 'dev'
            : null;

    if (
      script
    ) {
      const command =
        scriptCommand(
          packageManager(
            files,
          ),

          script,
        );

      return {
        ...command,

        cwd:
          '',

        environment: {
          NODE_ENV:
            'development',
        },

        port:
          null,

        hotReload:
          false,

        probeCommand:
          null,

        probeArgs:
          [],
      };
    }
  }

  const python =
    pythonEntry(
      files,

      [
        'worker.py',
        'src/worker.py',
        'main.py',
      ],
    );

  if (
    python
  ) {
    return {
      command:
        'python',

      args: [
        python,
      ],

      cwd:
        '',

      environment: {
        PYTHONUNBUFFERED:
          '1',
      },

      port:
        null,

      hotReload:
        false,

      probeCommand:
        null,

      probeArgs:
        [],
    };
  }

  if (
    file(
      files,
      'Cargo.toml',
    )
  ) {
    return {
      command:
        'cargo',

      args: [
        'run',
      ],

      cwd:
        '',

      environment: {},

      port:
        null,

      hotReload:
        false,

      probeCommand:
        null,

      probeArgs:
        [],
    };
  }

  if (
    file(
      files,
      'go.mod',
    )
  ) {
    return {
      command:
        'go',

      args: [
        'run',
        '.',
      ],

      cwd:
        '',

      environment: {},

      port:
        null,

      hotReload:
        false,

      probeCommand:
        null,

      probeArgs:
        [],
    };
  }

  return null;
}
