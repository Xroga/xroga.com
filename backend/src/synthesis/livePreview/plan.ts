import type {
  ProjectFile,
} from '../../ai/patches.js';

import {
  detectComposition,
  sandboxImageFor,
} from '../runtime/registry.js';

import type {
  SoftwareProject,
} from '../softwareProject.js';

import {
  cliPreviewCommand,
  workerPreviewProcess,
} from './commandPlans.js';

import type {
  LivePreviewKind,
  LivePreviewLaunchPlan,
  LivePreviewProcessPlan,
} from './types.js';

const PREVIEW_PORT =
  3000;

const STATIC_SERVER_SOURCE =
  String.raw`
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = '/work';
const port = ${PREVIEW_PORT};

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

http.createServer((req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://preview.local');
    const decoded = decodeURIComponent(url.pathname);
    const relative = decoded.replace(/^\/+/, '') || 'index.html';

    if (
      relative.split('/').some((part) => part === '..')
    ) {
      res.writeHead(400);
      res.end('Bad path');
      return;
    }

    let target = path.join(root, relative);

    if (
      !fs.existsSync(target) ||
      fs.statSync(target).isDirectory()
    ) {
      target = path.join(root, 'index.html');
    }

    if (!fs.existsSync(target)) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(target).toLowerCase();

    res.writeHead(200, {
      'content-type': types[ext] || 'application/octet-stream',
      'cache-control': 'no-store',
    });

    fs.createReadStream(target).pipe(res);
  } catch (error) {
    res.writeHead(500);
    res.end(error instanceof Error ? error.message : 'Preview error');
  }
}).listen(port, '::', () => {
  console.log('Xroga static Preview listening on', port);
});
`;

interface PackageJson {
  readonly scripts?:
    Record<
      string,
      string
    >;

  readonly dependencies?:
    Record<
      string,
      string
    >;

  readonly devDependencies?:
    Record<
      string,
      string
    >;
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

function packageJson(
  files:
    readonly ProjectFile[],
): PackageJson | null {
  const manifest =
    file(
      files,
      'package.json',
    );

  if (
    !manifest
  ) {
    return null;
  }

  try {
    return JSON.parse(
      manifest.content,
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

function runScript(
  manager:
    string,

  script:
    string,

  args:
    readonly string[] =
    [],
): {
  command:
    string;

  args:
    readonly string[];
} {
  return {
    command:
      manager,

    args: [
      'run',
      script,

      ...(
        args.length
          ? [
              '--',
              ...args,
            ]
          : []
      ),
    ],
  };
}

function nodeProbe():
  Pick<
    LivePreviewProcessPlan,
    'probeCommand'
    | 'probeArgs'
  > {
  return {
    probeCommand:
      'node',

    probeArgs: [
      '-e',

      [
        `fetch('http://[::1]:${PREVIEW_PORT}/')`,
        `.then(r => process.exit(r.status < 500 ? 0 : 1))`,
        `.catch(() => process.exit(1))`,
      ].join(
        '',
      ),
    ],
  };
}

function pythonProbe():
  Pick<
    LivePreviewProcessPlan,
    'probeCommand'
    | 'probeArgs'
  > {
  return {
    probeCommand:
      'python',

    probeArgs: [
      '-c',

      [
        'import sys, urllib.request;',
        `r=urllib.request.urlopen('http://[::1]:${PREVIEW_PORT}/',timeout=2);`,
        'sys.exit(0 if r.status < 500 else 1)',
      ].join(
        '',
      ),
    ],
  };
}

function browserProcess(
  files:
    readonly ProjectFile[],
): LivePreviewProcessPlan | null {
  const pkg =
    packageJson(
      files,
    );

  if (
    !pkg
  ) {
    if (
      file(
        files,
        'index.html',
      )
    ) {
      return {
        command:
          'node',

        args: [
          '-e',
          STATIC_SERVER_SOURCE,
        ],

        cwd:
          '',

        environment: {},

        port:
          PREVIEW_PORT,

        hotReload:
          true,

        ...nodeProbe(),
      };
    }

    return null;
  }

  const manager =
    packageManager(
      files,
    );

  const dependencies = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  if (
    dependencies.next &&
    pkg.scripts?.dev
  ) {
    const command =
      runScript(
        manager,
        'dev',
        [
          '-H',
          '::',
          '-p',
          String(
            PREVIEW_PORT,
          ),
        ],
      );

    return {
      ...command,

      cwd:
        '',

      environment: {
        HOSTNAME:
          '::',

        PORT:
          String(
            PREVIEW_PORT,
          ),

        NODE_ENV:
          'development',
      },

      port:
        PREVIEW_PORT,

      hotReload:
        true,

      ...nodeProbe(),
    };
  }

  if (
    dependencies.vite &&
    pkg.scripts?.dev
  ) {
    const command =
      runScript(
        manager,
        'dev',
        [
          '--host',
          '::',
          '--port',
          String(
            PREVIEW_PORT,
          ),
        ],
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
        PREVIEW_PORT,

      hotReload:
        true,

      ...nodeProbe(),
    };
  }

  if (
    pkg.scripts?.dev
  ) {
    const command =
      runScript(
        manager,
        'dev',
      );

    return {
      ...command,

      cwd:
        '',

      environment: {
        HOST:
          '::',

        HOSTNAME:
          '::',

        PORT:
          String(
            PREVIEW_PORT,
          ),

        NODE_ENV:
          'development',
      },

      port:
        PREVIEW_PORT,

      hotReload:
        true,

      ...nodeProbe(),
    };
  }

  if (
    pkg.scripts?.start
  ) {
    const command =
      runScript(
        manager,
        'start',
      );

    return {
      ...command,

      cwd:
        '',

      environment: {
        HOST:
          '::',

        HOSTNAME:
          '::',

        PORT:
          String(
            PREVIEW_PORT,
          ),

        NODE_ENV:
          'development',
      },

      port:
        PREVIEW_PORT,

      hotReload:
        false,

      ...nodeProbe(),
    };
  }

  if (
    file(
      files,
      'index.html',
    )
  ) {
    return {
      command:
        'node',

      args: [
        '-e',
        STATIC_SERVER_SOURCE,
      ],

      cwd:
        '',

      environment: {},

      port:
        PREVIEW_PORT,

      hotReload:
        true,

      ...nodeProbe(),
    };
  }

  return null;
}

function fastApiModule(
  files:
    readonly ProjectFile[],
): string | null {
  for (
    const candidate of
    files
  ) {
    if (
      !candidate.path.endsWith(
        '.py',
      )
    ) {
      continue;
    }

    if (
      !candidate.content.includes(
        'FastAPI',
      ) ||
      !/\bapp\s*=\s*FastAPI\s*\(/.test(
        candidate.content,
      )
    ) {
      continue;
    }

    return candidate.path
      .replace(
        /\.py$/,
        '',
      )
      .replaceAll(
        '/',
        '.',
      );
  }

  return null;
}

function apiProcess(
  files:
    readonly ProjectFile[],
): LivePreviewProcessPlan | null {
  const module =
    fastApiModule(
      files,
    );

  if (
    !module
  ) {
    return null;
  }

  return {
    command:
      'python',

    args: [
      '-m',
      'uvicorn',
      `${module}:app`,
      '--host',
      '::',
      '--port',
      String(
        PREVIEW_PORT,
      ),
    ],

    cwd:
      '',

    environment: {
      PYTHONUNBUFFERED:
        '1',

      PYTHONDONTWRITEBYTECODE:
        '1',
    },

    port:
      PREVIEW_PORT,

    hotReload:
      false,

    ...pythonProbe(),
  };
}

function previewKind(
  project:
    SoftwareProject,
): LivePreviewKind {
  switch (
    project.recipe
      ?.previewStrategy
  ) {
    case 'browser':
      return 'browser';

    case 'api_console':
      return 'api';

    case 'terminal':
      return 'terminal';

    case 'logs':
      return 'logs';

    case 'extension_browser':
      return 'extension';

    case 'mobile_runtime':
      return 'mobile';

    case 'desktop_runtime':
      return 'desktop';

    case 'mcp_inspector':
      return 'mcp';

    case 'ai_playground':
      return 'ai';
  }

  const surfaces =
    project.architecture
      ?.components
      .flatMap(
        (
          component,
        ) =>
          component.surfaces.map(
            String,
          ),
      ) ??
    [];

  if (
    surfaces.some(
      (
        surface,
      ) =>
        surface ===
          'web_frontend' ||
        surface ===
          'documentation_site',
    )
  ) {
    return 'browser';
  }

  if (
    surfaces.some(
      (
        surface,
      ) =>
        surface ===
          'api' ||
        surface ===
          'webhook_service',
    )
  ) {
    return 'api';
  }

  if (
    surfaces.some(
      (
        surface,
      ) =>
        surface ===
          'cli' ||
        surface ===
          'library' ||
        surface ===
          'sdk',
    )
  ) {
    return 'terminal';
  }

  if (
    surfaces.some(
      (
        surface,
      ) =>
        surface ===
          'worker' ||
        surface ===
          'scheduled_job' ||
        surface ===
          'background_service',
    )
  ) {
    return 'logs';
  }

  if (
    surfaces.includes(
      'mcp_server',
    )
  ) {
    return 'mcp';
  }

  if (
    surfaces.includes(
      'ai_pipeline',
    )
  ) {
    return 'ai';
  }

  if (
    surfaces.includes(
      'browser_extension',
    )
  ) {
    return 'extension';
  }

  if (
    surfaces.includes(
      'mobile_app',
    )
  ) {
    return 'mobile';
  }

  if (
    surfaces.includes(
      'desktop_app',
    )
  ) {
    return 'desktop';
  }

  return 'none';
}

export function planLivePreview(
  project:
    SoftwareProject,
): LivePreviewLaunchPlan {
  const files =
    project.workspace
      .files;

  const kind =
    previewKind(
      project,
    );

  const composition =
    detectComposition(
      files,
    );

  const relevant =
    kind ===
      'api'
      ? (
          composition
            .components
            .find(
              (
                component,
              ) =>
                component.adapterId ===
                'python',
            ) ??
          composition
            .components[0]
        )
      : (
          composition
            .components
            .find(
              (
                component,
              ) =>
                component.adapterId ===
                  'node' ||
                component.adapterId ===
                  'static-web',
            ) ??
          composition
            .components[0]
        );

  const image =
    relevant
      ? sandboxImageFor(
          relevant,
        )
      : null;

  if (
    kind ===
    'browser'
  ) {
    const process =
      browserProcess(
        files,
      );

    return {
      kind,

      image,

      installDependencies:
        true,

      process,

      message:
        process
          ? 'Browser Preview runtime is available.'
          : 'The project is browser-based but no runnable browser entrypoint was detected.',
    };
  }

  if (
    kind ===
    'api'
  ) {
    const process =
      apiProcess(
        files,
      );

    return {
      kind,

      image,

      installDependencies:
        true,

      process,

      message:
        process
          ? 'API Preview runtime is available.'
          : 'The API was built, but no supported HTTP startup contract was detected.',
    };
  }

 if (
  kind ===
  'terminal'
) {
  const command =
    cliPreviewCommand(
      files,
    );

  return {
    kind,

    image,

    installDependencies:
      true,

    process:
      null,

    command,

    message:
      command
        ? 'CLI Preview executes the generated command in the isolated Xroga runtime.'
        : 'This CLI was built, but no safe executable CLI entrypoint was detected.',
  };
}

if (
  kind ===
  'logs'
) {
  const process =
    workerPreviewProcess(
      files,
    );

  return {
    kind,

    image,

    installDependencies:
      true,

    process,

    command:
      null,

    message:
      process
        ? 'Worker Preview is available through the isolated runtime process and logs.'
        : 'This worker was built, but no supported background-process entrypoint was detected.',
  };
}

if (
  kind ===
  'none'
) {
  return {
    kind,

    image,

    installDependencies:
      false,

    process:
      null,

    command:
      null,

    message:
      'This product does not expose an interactive Preview surface.',
  };
}

const unsupportedMessages:
  Record<
    | 'extension'
    | 'mobile'
    | 'desktop'
    | 'mcp'
    | 'ai',
    string
  > = {
  extension:
    'Browser-extension runtime Preview is not connected yet. Xroga will not claim a runnable Preview without a browser-extension host.',

  mobile:
    'Mobile runtime Preview is not connected yet. Xroga will not claim an emulator Preview without a mobile runtime provider.',

  desktop:
    'Desktop GUI Preview is not connected yet. Xroga will not claim a GUI Preview without desktop streaming support.',

  mcp:
    'The dedicated MCP inspector is not connected yet. Xroga will not claim an interactive MCP Preview without it.',

  ai:
    'The dedicated AI playground is not connected yet. Xroga will not claim an interactive AI Preview without it.',
};

return {
  kind,

  image,

  installDependencies:
    false,

  process:
    null,

  command:
    null,

  message:
    unsupportedMessages[
      kind
    ],
};
}
