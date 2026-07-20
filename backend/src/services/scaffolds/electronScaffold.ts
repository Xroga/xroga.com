import type { ProjectFile } from '../integrations/githubDeploy.js';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'xroga-desktop'
  );
}

/**
 * Electron desktop scaffold + GitHub Releases workflow (free unsigned path).
 * Code signing / store fees remain on the user’s accounts when they need them.
 */
export function buildElectronScaffold(opts: {
  projectName: string;
  userPrompt?: string;
}): ProjectFile[] {
  const name = opts.projectName.trim() || 'Xroga Desktop';
  const slug = slugify(name);
  const promptNote = opts.userPrompt ? opts.userPrompt.slice(0, 400) : 'Desktop app';

  return [
    {
      path: 'package.json',
      content: JSON.stringify(
        {
          name: slug,
          version: '1.0.0',
          private: true,
          description: `${name} — Electron app scaffolded by Xroga`,
          main: 'main.js',
          scripts: {
            start: 'electron .',
            pack: 'electron-builder --dir',
            dist: 'electron-builder',
          },
          devDependencies: {
            electron: '^33.2.0',
            'electron-builder': '^25.1.8',
          },
          build: {
            appId: `com.xroga.${slug.replace(/-/g, '')}`,
            productName: name,
            directories: {
              output: 'release',
            },
            files: ['main.js', 'preload.js', 'renderer/**/*', 'package.json'],
            mac: { target: ['zip'], category: 'public.app-category.productivity' },
            win: { target: ['zip'] },
            linux: { target: ['AppImage', 'zip'] },
            publish: [
              {
                provider: 'github',
                releaseType: 'release',
              },
            ],
          },
        },
        null,
        2,
      ),
    },
    {
      path: 'main.js',
      content: `const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`,
    },
    {
      path: 'preload.js',
      content: `const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('xroga', {
  platform: process.platform,
  appName: '${name}',
});
`,
    },
    {
      path: 'renderer/index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
    <title>${name}</title>
    <link rel="stylesheet" href="styles.css" />
  </head>
  <body>
    <main>
      <p class="eyebrow">Xroga · Electron</p>
      <h1>${name}</h1>
      <p id="meta">Loading…</p>
      <p class="hint">Edit renderer files, then iterate with follow-up prompts on your sticky GitHub repo.</p>
    </main>
    <script src="app.js"></script>
  </body>
</html>
`,
    },
    {
      path: 'renderer/styles.css',
      content: `body {
  margin: 0;
  min-height: 100vh;
  font-family: system-ui, sans-serif;
  background: radial-gradient(circle at top, #13203a, #070b14 55%);
  color: #e8eefc;
}
main { padding: 3rem 2rem; max-width: 40rem; }
.eyebrow { letter-spacing: 0.12em; text-transform: uppercase; font-size: 0.7rem; color: #7dd3fc; }
h1 { font-size: 2rem; margin: 0.4rem 0 0.8rem; }
.hint { opacity: 0.7; line-height: 1.5; }
`,
    },
    {
      path: 'renderer/app.js',
      content: `const meta = document.getElementById('meta');
const info = window.xroga || {};
meta.textContent = \`Running on \${info.platform || 'unknown'} · \${info.appName || '${name}'}\`;
`,
    },
    {
      path: '.github/workflows/release.yml',
      content: `name: Desktop release
on:
  push:
    tags:
      - 'v*'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install
      - run: npx electron-builder --linux zip
        env:
          GH_TOKEN: \${{ secrets.GITHUB_TOKEN }}
      - uses: softprops/action-gh-release@v2
        with:
          files: release/*.zip
          generate_release_notes: true
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
`,
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${name} — Desktop</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #070b14; color: #e8eefc; margin: 0; padding: 2rem; }
      main { max-width: 42rem; margin: 0 auto; }
      code { background: #121a2b; padding: 0.15rem 0.4rem; border-radius: 4px; }
      .card { border: 1px solid #243044; border-radius: 12px; padding: 1rem 1.1rem; margin-top: 1rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>${name}</h1>
      <p>Electron desktop scaffold by <strong>Xroga</strong>. This page is a web preview of the product story.</p>
      <div class="card">
        <p><strong>Free path:</strong> <code>npm install && npm start</code> locally, or tag <code>v1.0.0</code> to cut a GitHub Release zip (unsigned).</p>
        <p><strong>Paid by you (optional):</strong> Apple/Windows code signing and store fees — Xroga only scaffolds + triggers workflows on your GitHub.</p>
      </div>
    </main>
  </body>
</html>
`,
    },
    {
      path: 'PUBLISH.md',
      content: `# Publish ${name} (Electron desktop)

## Free path — local + GitHub Releases
1. \`npm install && npm start\` — run unsigned locally
2. Push to your sticky GitHub repo (Xroga does this in the ship loop)
3. Tag a version (\`git tag v1.0.0 && git push --tags\`) or run the **Desktop release** workflow
4. Download the zip from GitHub Releases and distribute to testers

## Paid by you (optional, unavoidable for stores/signing)
- Apple Developer / notarization
- Windows code signing certificate
- Microsoft Store / Mac App Store fees

Xroga does **not** hold signing certificates or pay store fees — same pattern as Expo/EAS on **your** accounts.
`,
    },
    {
      path: 'README.md',
      content: `# ${name}

Electron desktop app scaffolded by **Xroga AI**.

## Prompt
${promptNote}

## Develop
\`\`\`bash
npm install
npm start
\`\`\`

## Ship
See \`PUBLISH.md\` — GitHub Releases (free unsigned) first; signing/stores on your accounts when needed.
`,
    },
  ];
}
