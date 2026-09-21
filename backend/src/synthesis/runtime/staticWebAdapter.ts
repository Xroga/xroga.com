import type {
  ProjectFile,
} from '../../ai/patches.js';

import {
  fileAt,
  joinPath,
  type ParsedDiagnostic,
  type ProjectInspection,
  type RuntimeAdapter,
  type ToolCommand,
} from './adapterContract.js';

function scopedFiles(
  files: readonly ProjectFile[],
  root: string,
): readonly ProjectFile[] {
  if (!root) {
    return files;
  }

  return files.filter(
    (file) =>
      file.path === root ||
      file.path.startsWith(
        `${root}/`,
      ),
  );
}

/**
 * Dependency-free HTML/CSS/JavaScript websites.
 *
 * This adapter exists so a simple browser product does not acquire
 * npm, Next.js, React or another package manager merely because it
 * has a web_frontend surface.
 *
 * Validation uses only Node already present in Xroga's default
 * sandbox image. No registry/network access is required.
 */
export class StaticWebRuntimeAdapter
implements RuntimeAdapter {
  readonly id =
    'static-web';

  readonly adapterVersion =
    '1.0.0';

  readonly displayName =
    'Static HTML / CSS / JavaScript';

  readonly languages = [
  'javascript',
] as const;

  readonly runtimes = [
    'browser',
  ] as const;

  readonly platforms = [
    'browser',
  ] as const;

  readonly capabilityState =
    'implementation_available' as const;

  /**
   * index.html is the manifest-equivalent marker for a static site.
   */
  readonly manifestNames = [
    'index.html',
  ] as const;

  detect(
    files:
      readonly ProjectFile[],

    root =
      '',
  ): ProjectInspection | null {
    const index =
      fileAt(
        files,
        root,
        'index.html',
      );

    if (!index) {
      return null;
    }

    const scoped =
      scopedFiles(
        files,
        root,
      );

    const hasCss =
      scoped.some(
        (file) =>
          /\.css$/i.test(
            file.path,
          ),
      );

    const hasJavaScript =
      scoped.some(
        (file) =>
          /\.(?:js|mjs)$/i.test(
            file.path,
          ),
      );

    const evidence: string[] = [
  `${joinPath(
    root,
    'index.html',
  )} identifies a dependency-free browser application`,
];

if (hasCss) {
  evidence.push(
    'local CSS assets are present',
  );
}

if (hasJavaScript) {
  evidence.push(
    'local JavaScript assets are present',
  );
}

return {
  adapterId:
    this.id,

  root,

  languages: [
    'javascript',
  ],

      manifests: [
        joinPath(
          root,
          'index.html',
        ),
      ],

      lockfiles:
        [],

      packageManager:
        null,

      buildSystem:
        null,

      testRunner:
        'xroga-static-smoke',

      workspaces:
        [],

      entrypoints: [
        joinPath(
          root,
          'index.html',
        ),
      ],

      /*
       * Deliberately slightly below package-manifest ecosystems.
       *
       * If a repository contains both package.json and index.html,
       * Node remains authoritative. Pure static repos have no competing
       * manifest adapter and are selected here.
       */
      confidence:
        0.9,

      evidence,
    };
  }

  installCommands():
    readonly ToolCommand[] {
    /*
     * Critical:
     *
     * A static site has nothing to install. Returning npm install here
     * would recreate the exact production failure this adapter fixes.
     */
    return [];
  }

  formatCommands():
    readonly ToolCommand[] {
    return [];
  }

  lintCommands():
    readonly ToolCommand[] {
    return [];
  }

  typecheckCommands():
    readonly ToolCommand[] {
    return [];
  }

  unitTestCommands(
    inspection:
      ProjectInspection,
  ): readonly ToolCommand[] {
    /*
     * Deterministic structural smoke test.
     *
     * Uses Node built into Xroga's default sandbox and requires no
     * registry/network connection.
     */
    const smokeScript =
      [
        "const fs = require('node:fs');",
        "const path = require('node:path');",
        '',
        "const entry = 'index.html';",
        '',
        'if (!fs.existsSync(entry)) {',
        "  console.error('Missing index.html');",
        '  process.exit(1);',
        '}',
        '',
        "const html = fs.readFileSync(entry, 'utf8');",
        '',
        "for (const tag of ['html', 'head', 'body']) {",
        "  const pattern = new RegExp('<' + tag + '\\\\b', 'i');",
        '  if (!pattern.test(html)) {',
        "    console.error('Missing required <' + tag + '> element');",
        '    process.exit(1);',
        '  }',
        '}',
        '',
        "const references = [...html.matchAll(/\\b(?:src|href)\\s*=\\s*[\"']([^\"']+)[\"']/gi)]",
        '  .map((match) => match[1])',
        '  .filter(Boolean);',
        '',
        'for (const reference of references) {',
        '  if (',
        "    /^(?:https?:)?\\/\\//i.test(reference) ||",
        "    /^(?:data:|mailto:|tel:|javascript:|#)/i.test(reference)",
        '  ) {',
        '    continue;',
        '  }',
        '',
        "  const clean = reference.split('#')[0].split('?')[0];",
        '',
        "  if (!clean || clean === '/' || clean.endsWith('/')) {",
        '    continue;',
        '  }',
        '',
        "  const relative = clean.replace(/^\\.\\//, '').replace(/^\\//, '');",
        '',
        '  if (!fs.existsSync(path.resolve(relative))) {',
        "    console.error('Missing local asset referenced by index.html: ' + reference);",
        '    process.exit(1);',
        '  }',
        '}',
        '',
        "console.log('Static web smoke test passed');",
      ].join(
        '\n',
      );

    return [
      {
        command:
          'node',

        args: [
          '-e',
          smokeScript,
        ],

        networkPolicy:
          'none',

        source:
          'adapter_default',

        purpose:
          'Verify static website structure and local asset references',

        cwd:
          inspection.root,
      },
    ];
  }

  buildCommands():
    readonly ToolCommand[] {
    /*
     * HTML/CSS/JS needs no compilation step.
     */
    return [];
  }

  packageCommands():
    readonly ToolCommand[] {
    return [];
  }

  artifactLocations(
    inspection:
      ProjectInspection,
  ): readonly string[] {
    return [
      joinPath(
        inspection.root,
        'index.html',
      ),
    ];
  }

  environmentRequirements():
    Readonly<
      Record<
        string,
        string
      >
    > {
    return {};
  }

  parseFailure(
    output:
      string,
  ): readonly ParsedDiagnostic[] {
    if (
      /Missing local asset referenced by index\.html/i.test(
        output,
      )
    ) {
      return [
        {
          kind:
            'test_failure',

          message:
            output.trim(),

          repairable:
            true,
        },
      ];
    }

    if (
      /Missing required <(?:html|head|body)>/i.test(
        output,
      )
    ) {
      return [
        {
          kind:
            'test_failure',

          message:
            output.trim(),

          repairable:
            true,
        },
      ];
    }

    return output.trim()
      ? [
          {
            kind:
              'unknown',

            message:
              output.trim(),

            repairable:
              true,
          },
        ]
      : [];
  }

  repairHints(
    diagnostics:
      readonly ParsedDiagnostic[],
  ): readonly string[] {
    if (
      diagnostics.length ===
      0
    ) {
      return [];
    }

    return [
      'Repair index.html and its local CSS/JavaScript asset references without introducing a package manager or framework.',
    ];
  }
}
