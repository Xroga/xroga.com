import assert from 'node:assert/strict';

import {
  readFileSync,
} from 'node:fs';

import {
  test,
} from 'node:test';

const read =
  (
    path:
      string,
  ) =>
    readFileSync(
      new URL(
        path,
        import.meta.url,
      ),

      'utf8',
    );

const PANEL =
  read(
    '../components/terminal/ProjectDeliveryPanel.tsx',
  );

const WORKSPACE =
  read(
    '../components/terminal/DevWorkspacePanel.tsx',
  );

const CHAT =
  read(
    '../context/TerminalChatContext.tsx',
  );

const ARTIFACT =
  read(
    './engineeringArtifact.ts',
  );

test(
  'Step 6 mounts the canonical delivery panel in the Deploy workspace tab',
  () => {
    assert.match(
      WORKSPACE,

      /import\s*\{[\s\S]*ProjectDeliveryPanel[\s\S]*\}\s*from\s*['"]\.\/ProjectDeliveryPanel['"]/,
    );

    assert.match(
      WORKSPACE,

      /activeTab\s*===\s*['"]deploy['"][\s\S]{0,500}<ProjectDeliveryPanel\s*\/>/,
    );
  },
);

test(
  'Step 6 uses the repository GitHub mark instead of an unavailable Lucide Github export',
  () => {
    assert.match(
      PANEL,

      /GitHubIcon/,
    );

    assert.match(
      PANEL,

      /@\/components\/icons\/GitHubIcon/,
    );

    assert.doesNotMatch(
      PANEL,

      /\bGithub\b/,
    );
  },
);

test(
  'Step 6 can resolve delivery project identity during a live runtime',
  () => {
    assert.match(
      PANEL,

      /useLiveBuildStore/,
    );

    assert.match(
      PANEL,

      /state\.preview[\s\S]{0,120}\.projectId/,
    );

    assert.match(
      PANEL,

      /workspaceProjectId\s*\?\?\s*runtimeProjectId/,
    );
  },
);

test(
  'Step 6 restores the canonical project id from persisted engineering artifacts',
  () => {
    assert.match(
      ARTIFACT,

      /function artifactProjectId/,
    );

    assert.match(
      ARTIFACT,

      /softwareProject[\s\S]{0,120}\.projectId/,
    );

    assert.match(
      ARTIFACT,

      /buildContract[\s\S]{0,120}\.projectId/,
    );

    const restore =
      CHAT.slice(
        CHAT.indexOf(
          'async function restoreProjectWorkspaceFromMessages',
        ),

        CHAT.indexOf(
          'function lastUserPromptNear',
        ),
      );

    assert.match(
      restore,

      /projectId\s*:\s*projection\.projectId/,
    );
  },
);

test(
  'Step 6 keeps GitHub publication and deployment optional delivery actions',
  () => {
    assert.match(
      PANEL,

      /Download ZIP/,
    );

    assert.match(
      PANEL,

      /Connect GitHub/,
    );

    assert.match(
      PANEL,

      /Connect Vercel/,
    );

    assert.match(
      PANEL,

      /projectDeliveryApi[\s\S]*\.publish/,
    );

    assert.match(
      PANEL,

      /projectDeliveryApi[\s\S]*\.deploy/,
    );
  },
);
