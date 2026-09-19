import type {
  AcceptanceKind,
} from './acceptanceCompiler.js';

import type {
  ProductSurface,
} from './universalProductSpec.js';

import type {
  ProductClassification,
} from './productTaxonomy.js';

export const BUILD_RECIPE_SCHEMA_VERSION =
  '1.0.0' as const;

export type BuildRecipeMaturity =
  | 'supported'
  | 'beta'
  | 'experimental';

export interface RecipeArchitectureDefault {
  readonly surface:
    ProductSurface;

  readonly language:
    string;

  readonly runtime:
    string;

  readonly framework:
    string | null;

  readonly reason:
    string;
}

export interface RecipeFileCandidate {
  readonly path:
    string;

  readonly framework?:
    string | null;

  readonly language?:
    string | null;

  readonly adapterId?:
    string | null;
}

export interface RecipeFileRole {
  readonly id:
    string;

  readonly description:
    string;

  readonly required:
    boolean;

  readonly candidates:
    readonly RecipeFileCandidate[];
}

export interface RecipeVerificationRequirement {
  readonly id:
    string;

  readonly statement:
    string;

  readonly kind:
    AcceptanceKind;

  readonly observable:
    string;

  readonly required:
    boolean;
}

export interface BuildRecipe {
  readonly schemaVersion:
    typeof BUILD_RECIPE_SCHEMA_VERSION;

  readonly id:
    string;

  readonly label:
    string;

  readonly surfaces:
    readonly ProductSurface[];

  readonly subtypes:
    readonly string[];

  readonly architectureDefaults:
    readonly RecipeArchitectureDefault[];

  readonly capabilityRequirements:
    readonly string[];

  readonly files:
    readonly RecipeFileRole[];

  readonly verification:
    readonly RecipeVerificationRequirement[];

  readonly previewStrategy:
    string;

  readonly packaging:
    readonly string[];

  readonly constraints:
    readonly string[];

  readonly maturity:
    BuildRecipeMaturity;
}

function file(
  id: string,
  description: string,
  candidates:
    readonly RecipeFileCandidate[],
  required =
    true,
): RecipeFileRole {
  return {
    id,
    description,
    required,
    candidates,
  };
}

function verify(
  id: string,
  statement: string,
  kind: AcceptanceKind,
  observable: string,
  required =
    true,
): RecipeVerificationRequirement {
  return {
    id,
    statement,
    kind,
    observable,
    required,
  };
}

const WEB_NEXT_DEFAULT:
  RecipeArchitectureDefault = {
  surface:
    'web_frontend',

  language:
    'typescript',

  runtime:
    'node',

  framework:
    'next',

  reason:
    'the selected product recipe requires an application-capable browser architecture',
};

const RECIPES:
  readonly BuildRecipe[] = [
  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.static_landing',

    label:
      'Static landing website',

    surfaces: [
      'web_frontend',
    ],

    subtypes: [
      'landing_page',
    ],

    architectureDefaults: [
      {
        surface:
          'web_frontend',

        language:
          'typescript',

        runtime:
          'node',

        framework:
          'next',

        reason:
          'the recipe supports an application framework when the request does not explicitly select dependency-free static HTML',
      },
    ],

    capabilityRequirements: [
      'responsive_layout',
      'content_sections',
      'call_to_action',
      'seo_basics',
    ],

    files: [
      file(
        'static_document',
        'Primary static HTML document',
        [
          {
            path:
              'index.html',

            adapterId:
              'static-web',
          },
        ],
      ),

      file(
        'application_page',
        'Primary framework page',
        [
          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/App.tsx',

            framework:
              'react',
          },
        ],
      ),

      file(
        'styles',
        'Global responsive styles',
        [
          {
            path:
              'styles.css',

            adapterId:
              'static-web',
          },

          {
            path:
              'app/globals.css',

            framework:
              'next',
          },

          {
            path:
              'src/styles.css',

            framework:
              'react',
          },
        ],
      ),

      file(
        'browser_behaviour',
        'Browser interaction code when interaction is required',
        [
          {
            path:
              'script.js',

            adapterId:
              'static-web',
          },
        ],
        false,
      ),

      file(
        'manifest',
        'Dependency and script manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
        false,
      ),

      file(
        'readme',
        'Project usage and development instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'page_loads',
        'The primary page renders successfully',
        'browser',
        'the rendered document returns successfully and produces visible page content',
      ),

      verify(
        'responsive',
        'The page remains usable at mobile and desktop widths',
        'browser',
        'required content remains visible and does not overflow the viewport',
      ),

      verify(
        'links',
        'Required local links and assets resolve',
        'browser',
        'no required local href or src reference returns a missing resource',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'web_project',
    ],

    constraints: [
      'Do not invent authentication, a database, or a backend unless the product requirements require them.',
      'If static-web is selected, do not introduce a package manager or framework.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.portfolio',

    label:
      'Portfolio website',

    surfaces: [
      'web_frontend',
    ],

    subtypes: [
      'portfolio',
    ],

    architectureDefaults: [
      WEB_NEXT_DEFAULT,
    ],

    capabilityRequirements: [
      'portfolio_gallery',
      'about_section',
      'contact',
      'responsive_layout',
    ],

    files: [
      file(
        'page',
        'Main portfolio experience',
        [
          {
            path:
              'index.html',

            adapterId:
              'static-web',
          },

          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/App.tsx',

            framework:
              'react',
          },
        ],
      ),

      file(
        'styles',
        'Portfolio visual system and responsive styling',
        [
          {
            path:
              'styles.css',

            adapterId:
              'static-web',
          },

          {
            path:
              'app/globals.css',

            framework:
              'next',
          },

          {
            path:
              'src/styles.css',

            framework:
              'react',
          },
        ],
      ),

      file(
        'manifest',
        'Application manifest when a package-managed architecture is selected',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
        false,
      ),

      file(
        'readme',
        'Project instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'portfolio_sections',
        'Portfolio work, identity information and contact path are visible',
        'browser',
        'the rendered page exposes work samples, an about/identity section and contact action',
      ),

      verify(
        'responsive',
        'Portfolio layout works on mobile and desktop',
        'browser',
        'gallery and primary navigation remain usable at representative viewport sizes',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'web_project',
    ],

    constraints: [
      'Use project imagery/content placeholders only when real content was not supplied.',
      'Do not invent client names, awards, testimonials, or factual credentials.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.dashboard',

    label:
      'Interactive dashboard',

    surfaces: [
      'web_frontend',
    ],

    subtypes: [
      'dashboard',
    ],

    architectureDefaults: [
      WEB_NEXT_DEFAULT,
    ],

    capabilityRequirements: [
      'application_navigation',
      'data_visualisation',
      'tables',
      'interactive_state',
    ],

    files: [
      file(
        'manifest',
        'Application dependencies and scripts',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'page',
        'Dashboard entry page',
        [
          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/App.tsx',

            framework:
              'react',
          },
        ],
      ),

      file(
        'styles',
        'Dashboard layout and responsive visual system',
        [
          {
            path:
              'app/globals.css',

            framework:
              'next',
          },

          {
            path:
              'src/styles.css',

            framework:
              'react',
          },
        ],
      ),

      file(
        'components',
        'Reusable dashboard UI components',
        [
          {
            path:
              'components/Dashboard.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/components/Dashboard.tsx',

            framework:
              'react',
          },
        ],
      ),

      file(
        'readme',
        'Development instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'dashboard_visible',
        'Primary dashboard metrics and controls render',
        'browser',
        'the dashboard contains visible navigation, data presentation and interactive controls',
      ),

      verify(
        'dashboard_states',
        'Loading, empty and populated states are handled',
        'browser',
        'the interface produces an understandable state for loading, zero-data and populated data',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'web_application',
    ],

    constraints: [
      'Do not fabricate live data integrations when the request did not provide one.',
      'Mock/demo data must be clearly local and replaceable.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.saas_application',

    label:
      'SaaS web application',

    surfaces: [
      'web_frontend',
    ],

    subtypes: [
      'saas_application',
    ],

    architectureDefaults: [
      WEB_NEXT_DEFAULT,
    ],

    capabilityRequirements: [
      'application_navigation',
      'forms',
      'interactive_state',
      'authentication_candidate',
      'persistent_state_candidate',
    ],

    files: [
      file(
        'manifest',
        'Application manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'entry',
        'Primary application page',
        [
          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/App.tsx',

            framework:
              'react',
          },
        ],
      ),

      file(
        'styles',
        'Application styling',
        [
          {
            path:
              'app/globals.css',

            framework:
              'next',
          },

          {
            path:
              'src/styles.css',

            framework:
              'react',
          },
        ],
      ),

      file(
        'readme',
        'Configuration and usage instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'primary_workflow',
        'The primary user workflow can be completed',
        'integration',
        'a test or browser flow performs the main requested operation and observes its result',
      ),

      verify(
        'error_state',
        'The primary workflow exposes an understandable failure state',
        'integration',
        'a representative failure is surfaced without corrupting application state',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'web_application',
    ],

    constraints: [
      'Authentication and persistence are requirements, not decorative defaults; include them only when required.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.ecommerce',

    label:
      'E-commerce storefront',

    surfaces: [
      'web_frontend',
    ],

    subtypes: [
      'ecommerce',
    ],

    architectureDefaults: [
      WEB_NEXT_DEFAULT,
    ],

    capabilityRequirements: [
      'catalog',
      'product_detail',
      'cart',
      'checkout_candidate',
    ],

    files: [
      file(
        'manifest',
        'Application manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'storefront',
        'Storefront entry',
        [
          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/App.tsx',

            framework:
              'react',
          },
        ],
      ),

      file(
        'styles',
        'Storefront visual system',
        [
          {
            path:
              'app/globals.css',

            framework:
              'next',
          },

          {
            path:
              'src/styles.css',

            framework:
              'react',
          },
        ],
      ),

      file(
        'readme',
        'Project configuration instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'catalog',
        'Products can be discovered and inspected',
        'browser',
        'the storefront exposes a catalog and a usable product-detail path',
      ),

      verify(
        'cart',
        'Cart state responds to add/remove actions',
        'browser',
        'adding and removing a representative item changes cart state predictably',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'web_application',
    ],

    constraints: [
      'Do not represent a mock checkout as a real payment integration.',
      'Payment credentials and webhook secrets must never be placed in browser code.',
    ],

    maturity:
      'beta',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.documentation',

    label:
      'Documentation website',

    surfaces: [
      'documentation_site',
    ],

    subtypes: [
      'documentation',
    ],

    architectureDefaults: [
      {
        surface:
          'documentation_site',

        language:
          'typescript',

        runtime:
          'node',

        framework:
          'next',

        reason:
          'documentation benefits from structured routing and reusable content navigation',
      },
    ],

    capabilityRequirements: [
      'documentation_navigation',
      'content_pages',
      'code_examples_candidate',
    ],

    files: [
      file(
        'manifest',
        'Documentation application manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'entry',
        'Documentation home page',
        [
          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },
        ],
      ),

      file(
        'readme',
        'Documentation project development instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'navigation',
        'Documentation navigation reaches documented sections',
        'browser',
        'representative documentation links resolve and display their content',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'documentation_site',
    ],

    constraints: [
      'Do not invent API contracts or product behavior that was not supplied.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'web.generic_app',

    label:
      'Generic web application',

    surfaces: [
      'web_frontend',
    ],

    subtypes:
      [],

    architectureDefaults: [
      WEB_NEXT_DEFAULT,
    ],

    capabilityRequirements: [
      'responsive_layout',
      'interactive_state',
    ],

    files: [
      file(
        'manifest',
        'Application manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'entry',
        'Application entry',
        [
          {
            path:
              'app/page.tsx',

            framework:
              'next',
          },

          {
            path:
              'src/App.tsx',

            framework:
              'react',
          },

          {
            path:
              'index.html',

            adapterId:
              'static-web',
          },
        ],
      ),

      file(
        'readme',
        'Project instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'main_behavior',
        'The main requested browser behavior is demonstrated',
        'browser',
        'the rendered application visibly supports the primary requested behavior',
      ),
    ],

    previewStrategy:
      'browser',

    packaging: [
      'web_application',
    ],

    constraints: [
      'Do not assume SaaS, authentication, payments or persistence without requirement evidence.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'api.service',

    label:
      'HTTP API service',

    surfaces: [
      'api',
      'webhook_service',
    ],

    subtypes: [
      'rest_api',
    ],

    architectureDefaults: [
      {
        surface:
          'api',

        language:
          'python',

        runtime:
          'cpython',

        framework:
          'fastapi',

        reason:
          'the API recipe favors typed request validation and deterministic HTTP testing',
      },
    ],

    capabilityRequirements: [
      'http_endpoints',
      'structured_validation',
      'error_responses',
      'health_endpoint',
    ],

    files: [
      file(
        'manifest',
        'Python project manifest',
        [
          {
            path:
              'pyproject.toml',

            language:
              'python',
          },
        ],
      ),

      file(
        'entry',
        'HTTP application entry',
        [
          {
            path:
              'app/main.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'tests',
        'API integration tests',
        [
          {
            path:
              'tests/test_api.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'readme',
        'Run and API usage instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'health',
        'The service exposes a runnable health path or equivalent startup proof',
        'api',
        'the started process responds successfully to a deterministic health request',
      ),

      verify(
        'route_contract',
        'Documented API routes satisfy their response contracts',
        'api',
        'representative valid and invalid requests return expected status codes and response shapes',
      ),
    ],

    previewStrategy:
      'api_console',

    packaging: [
      'service',
    ],

    constraints: [
      'Secrets remain server-side.',
      'Every externally supplied value is validated before side effects.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'cli.generic',

    label:
      'Command-line tool',

    surfaces: [
      'cli',
      'devtool',
    ],

    subtypes: [
      'cli_tool',
    ],

    architectureDefaults: [
      {
        surface:
          'cli',

        language:
          'rust',

        runtime:
          'native',

        framework:
          null,

        reason:
          'a standalone CLI benefits from deterministic packaging and a self-contained binary',
      },
    ],

    capabilityRequirements: [
      'command_arguments',
      'help_output',
      'exit_codes',
    ],

    files: [
      file(
        'manifest',
        'Rust package manifest',
        [
          {
            path:
              'Cargo.toml',

            language:
              'rust',
          },
        ],
      ),

      file(
        'entry',
        'CLI program entry',
        [
          {
            path:
              'src/main.rs',

            language:
              'rust',
          },
        ],
      ),

      file(
        'tests',
        'CLI integration tests',
        [
          {
            path:
              'tests/cli.rs',

            language:
              'rust',
          },
        ],
      ),

      file(
        'readme',
        'Installation and CLI usage',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'help',
        'The command exposes usable help output',
        'cli',
        'the built command accepts --help and exits successfully',
      ),

      verify(
        'representative_command',
        'A representative invocation produces the requested result',
        'cli',
        'a deterministic invocation exits successfully and its output matches the expected behavior',
      ),

      verify(
        'invalid_command',
        'Invalid input fails predictably',
        'cli',
        'invalid input returns a non-zero exit code and a useful error message',
      ),
    ],

    previewStrategy:
      'terminal',

    packaging: [
      'binary_or_package',
    ],

    constraints: [
      'Do not add a browser UI unless the request explicitly requires one.',
    ],

    maturity:
      'supported',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'extension.browser',

    label:
      'Browser extension',

    surfaces: [
      'browser_extension',
    ],

    subtypes: [
      'browser_extension',
    ],

    architectureDefaults: [
      {
        surface:
          'browser_extension',

        language:
          'typescript',

        runtime:
          'browser',

        framework:
          null,

        reason:
          'browser extensions use manifest-declared browser entry points and JavaScript-compatible code',
      },
    ],

    capabilityRequirements: [
      'extension_manifest',
      'browser_permissions',
      'extension_runtime',
    ],

    files: [
      file(
        'manifest',
        'Extension manifest',
        [
          {
            path:
              'manifest.json',
          },
        ],
      ),

      file(
        'package_manifest',
        'Build-tool manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'background',
        'Background/service worker entry',
        [
          {
            path:
              'src/background.ts',

            language:
              'typescript',
          },
        ],
        false,
      ),

      file(
        'content',
        'Content-script entry when page integration is required',
        [
          {
            path:
              'src/content.ts',

            language:
              'typescript',
          },
        ],
        false,
      ),

      file(
        'readme',
        'Build and load-unpacked instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'manifest',
        'The extension manifest references real build outputs and valid permissions',
        'extension',
        'manifest paths resolve and required permissions are explicitly declared',
      ),
    ],

    previewStrategy:
      'extension_browser',

    packaging: [
      'browser_extension_package',
    ],

    constraints: [
      'Request only permissions required by the product behavior.',
    ],

    maturity:
      'beta',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'mobile.application',

    label:
      'Mobile application',

    surfaces: [
      'mobile_app',
    ],

    subtypes: [
      'mobile_application',
    ],

    architectureDefaults: [
      {
        surface:
          'mobile_app',

        language:
          'dart',

        runtime:
          'flutter',

        framework:
          'flutter',

        reason:
          'the mobile recipe keeps one cross-platform codebase unless an explicit platform stack was requested',
      },
    ],

    capabilityRequirements: [
      'mobile_navigation',
      'touch_interface',
      'device_layout',
    ],

    files: [
      file(
        'manifest',
        'Flutter package manifest',
        [
          {
            path:
              'pubspec.yaml',

            language:
              'dart',
          },
        ],
      ),

      file(
        'entry',
        'Mobile application entry',
        [
          {
            path:
              'lib/main.dart',

            language:
              'dart',
          },
        ],
      ),

      file(
        'tests',
        'Mobile widget tests',
        [
          {
            path:
              'test/widget_test.dart',

            language:
              'dart',
          },
        ],
      ),

      file(
        'readme',
        'Mobile build instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'mobile_build',
        'The mobile project builds for its declared toolchain',
        'mobile',
        'the framework build/test command completes successfully',
      ),
    ],

    previewStrategy:
      'mobile_runtime',

    packaging: [
      'mobile_project',
    ],

    constraints: [
      'Device-specific permissions must be explicitly justified by requested behavior.',
    ],

    maturity:
      'beta',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'desktop.application',

    label:
      'Desktop application',

    surfaces: [
      'desktop_app',
    ],

    subtypes: [
      'desktop_application',
    ],

    architectureDefaults: [
      {
        surface:
          'desktop_app',

        language:
          'rust',

        runtime:
          'tauri',

        framework:
          'tauri',

        reason:
          'the desktop recipe favors a native shell without bundling an entire browser runtime',
      },
    ],

    capabilityRequirements: [
      'desktop_window',
      'desktop_navigation',
      'local_runtime',
    ],

    files: [
      file(
        'native_manifest',
        'Native application manifest',
        [
          {
            path:
              'src-tauri/Cargo.toml',

            framework:
              'tauri',
          },
        ],
      ),

      file(
        'native_entry',
        'Native application entry',
        [
          {
            path:
              'src-tauri/src/main.rs',

            framework:
              'tauri',
          },
        ],
      ),

      file(
        'frontend_manifest',
        'Desktop frontend manifest',
        [
          {
            path:
              'package.json',

            framework:
              'tauri',
          },
        ],
      ),

      file(
        'readme',
        'Desktop build instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'desktop_build',
        'The desktop application reaches a buildable state',
        'build',
        'the declared desktop build command completes successfully',
      ),
    ],

    previewStrategy:
      'desktop_runtime',

    packaging: [
      'desktop_package',
    ],

    constraints: [
      'Privileged native operations must be kept behind the native trust boundary.',
    ],

    maturity:
      'beta',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'ai.rag',

    label:
      'Retrieval-augmented generation service',

    surfaces: [
      'ai_pipeline',
    ],

    subtypes: [
      'rag_application',
    ],

    architectureDefaults: [
      {
        surface:
          'ai_pipeline',

        language:
          'python',

        runtime:
          'cpython',

        framework:
          null,

        reason:
          'retrieval and model tooling are strongest in the Python ecosystem',
      },
    ],

    capabilityRequirements: [
      'document_ingestion',
      'retrieval',
      'model_generation',
      'evaluation_candidate',
    ],

    files: [
      file(
        'manifest',
        'Python project manifest',
        [
          {
            path:
              'pyproject.toml',

            language:
              'python',
          },
        ],
      ),

      file(
        'entry',
        'AI pipeline entry',
        [
          {
            path:
              'app/main.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'retrieval',
        'Retrieval implementation',
        [
          {
            path:
              'app/retrieval.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'tests',
        'Deterministic retrieval/evaluation tests',
        [
          {
            path:
              'tests/test_rag.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'readme',
        'Provider and local execution instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'retrieval',
        'Known content is retrievable from a deterministic fixture',
        'ai_evaluation',
        'a known query retrieves the expected fixture content before generation is evaluated',
      ),
    ],

    previewStrategy:
      'ai_playground',

    packaging: [
      'ai_service',
    ],

    constraints: [
      'Provider secrets are server-only.',
      'Model output confidence is not verification evidence.',
    ],

    maturity:
      'beta',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'ai.mcp_server',

    label:
      'MCP server',

    surfaces: [
      'mcp_server',
    ],

    subtypes: [
      'mcp_server',
    ],

    architectureDefaults: [
      {
        surface:
          'mcp_server',

        language:
          'typescript',

        runtime:
          'node',

        framework:
          null,

        reason:
          'MCP tooling integrates naturally with a small typed Node service',
      },
    ],

    capabilityRequirements: [
      'mcp_tools',
      'structured_tool_io',
      'stdio_or_http_transport',
    ],

    files: [
      file(
        'manifest',
        'Node package manifest',
        [
          {
            path:
              'package.json',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'entry',
        'MCP server entry',
        [
          {
            path:
              'src/index.ts',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'tools',
        'MCP tool definitions',
        [
          {
            path:
              'src/tools.ts',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'tests',
        'MCP server tests',
        [
          {
            path:
              'tests/server.test.ts',

            language:
              'typescript',
          },
        ],
      ),

      file(
        'readme',
        'MCP client configuration instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'tool_contract',
        'Declared MCP tools expose structured schemas and deterministic responses',
        'integration',
        'a test lists the tools and successfully invokes a representative tool',
      ),
    ],

    previewStrategy:
      'mcp_inspector',

    packaging: [
      'node_package',
    ],

    constraints: [
      'Tool inputs must be validated before external side effects.',
    ],

    maturity:
      'beta',
  },

  {
    schemaVersion:
      BUILD_RECIPE_SCHEMA_VERSION,

    id:
      'worker.background',

    label:
      'Background worker',

    surfaces: [
      'worker',
      'background_service',
      'scheduled_job',
    ],

    subtypes: [
      'background_worker',
    ],

    architectureDefaults: [
      {
        surface:
          'worker',

        language:
          'python',

        runtime:
          'cpython',

        framework:
          null,

        reason:
          'background processing requires no HTTP framework by default',
      },
    ],

    capabilityRequirements: [
      'background_execution',
      'structured_logging',
      'graceful_failure',
    ],

    files: [
      file(
        'manifest',
        'Worker project manifest',
        [
          {
            path:
              'pyproject.toml',

            language:
              'python',
          },
        ],
      ),

      file(
        'entry',
        'Worker entry',
        [
          {
            path:
              'worker/main.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'tests',
        'Worker behavior tests',
        [
          {
            path:
              'tests/test_worker.py',

            language:
              'python',
          },
        ],
      ),

      file(
        'readme',
        'Worker execution instructions',
        [
          {
            path:
              'README.md',
          },
        ],
      ),
    ],

    verification: [
      verify(
        'job',
        'A representative job completes deterministically',
        'background_job',
        'the worker processes a fixture job and records the expected result',
      ),
    ],

    previewStrategy:
      'logs',

    packaging: [
      'service',
    ],

    constraints: [
      'Retries must not duplicate non-idempotent side effects.',
    ],

    maturity:
      'supported',
  },
];

const FALLBACK_RECIPE:
  Readonly<
    Record<
      string,
      string
    >
  > = {
  web_frontend:
    'web.generic_app',

  documentation_site:
    'web.documentation',

  api:
    'api.service',

  webhook_service:
    'api.service',

  cli:
    'cli.generic',

  devtool:
    'cli.generic',

  browser_extension:
    'extension.browser',

  mobile_app:
    'mobile.application',

  desktop_app:
    'desktop.application',

  ai_pipeline:
    'ai.rag',

  mcp_server:
    'ai.mcp_server',

  worker:
    'worker.background',

  background_service:
    'worker.background',

  scheduled_job:
    'worker.background',
};

export function buildRecipes():
  readonly BuildRecipe[] {
  return RECIPES;
}

export function buildRecipe(
  id: string,
): BuildRecipe | null {
  return (
    RECIPES.find(
      (
        recipe,
      ) =>
        recipe.id ===
        id,
    ) ??
    null
  );
}

export function selectBuildRecipe(
  input: {
    classification:
      ProductClassification | null;

    surfaces:
      readonly ProductSurface[];
  },
): BuildRecipe | null {
  const preferred =
    input.classification
      ?.defaultRecipeId;

  if (
    preferred
  ) {
    const exact =
      buildRecipe(
        preferred,
      );

    if (
      exact
    ) {
      return exact;
    }
  }

  const subtype =
    input.classification
      ?.subtype;

  if (
    subtype
  ) {
    const matchingSubtype =
      RECIPES.find(
        (
          recipe,
        ) =>
          recipe.subtypes.includes(
            subtype,
          ),
      );

    if (
      matchingSubtype
    ) {
      return matchingSubtype;
    }
  }

  for (
    const surface of
    input.surfaces
  ) {
    const fallback =
      FALLBACK_RECIPE[
        String(
          surface,
        )
      ];

    if (
      fallback
    ) {
      return buildRecipe(
        fallback,
      );
    }
  }

  return null;
}

export function recipeArchitectureDefault(
  recipe:
    BuildRecipe | null,

  surface:
    ProductSurface,
): RecipeArchitectureDefault | null {
  return (
    recipe
      ?.architectureDefaults
      .find(
        (
          item,
        ) =>
          String(
            item.surface,
          ) ===
          String(
            surface,
          ),
      ) ??
    null
  );
}
